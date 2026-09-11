import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});

vi.mock("eve/context", () => ({
  defineState: <T>(_name: string, initial: () => T) => {
    let value = initial();
    state.resets.push(() => {
      value = initial();
    });
    return {
      get: () => value,
      update: (update: (current: T) => T) => {
        value = update(value);
      },
    };
  },
  readBackgroundTaskMembers: () => [],
  readBackgroundTaskTerminals: () => [],
}));

import {
  admitTask,
  cancelCohort,
  recordTerminal,
  type BoundedFact,
} from "@/agent/lib/completion-obligations";
import { recoveryProgress } from "@/agent/lib/recovery-progress";

beforeEach(() => {
  for (const reset of state.resets) reset();
});

function admit(taskId: string, turnId: string) {
  admitTask({ objectiveRevision: turnId, parentTurnId: turnId, taskId });
}

function settle(
  taskId: string,
  turnId: string,
  status: "completed" | "failed" | "cancelled",
  facts: BoundedFact[]
) {
  recordTerminal(
    {
      childSessionId: `${taskId}_session`,
      parentTurnId: turnId,
      status,
      taskId,
      workerName: "browser",
    },
    facts
  );
}

describe("recoveryProgress", () => {
  it("RP-01: an uncertain write is never offered a retry", () => {
    // The worker got a receipt for a dispatch and then failed. The effect may
    // already have reached the world, so repeating it is the one thing that
    // must not happen.
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "failed", [
      { claim: "Submitted the order form", evidence: "executor_receipt" },
      {
        claim: "Then the page stopped responding",
        evidence: "worker_assertion",
      },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("uncertain_write");
    expect(progress.nextStep).toBe("report_uncertain");
    // The prepared work is not thrown away.
    expect(progress.verifiedCheckpoints).toEqual(["Submitted the order form"]);
    expect(progress.unknownRemainder.join(" ")).toMatch(/unknown|uncertain/iu);
  });

  it("RP-02: a cancellation after a dispatch receipt is still uncertain", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "cancelled", [
      { claim: "Sent the message", evidence: "executor_receipt" },
    ]);
    cancelCohort("turn_1");

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    // Cancelling does not unsend anything, so this cannot be reported as
    // "cancelled, nothing happened".
    expect(progress.disposition).toBe("uncertain_write");
    expect(progress.nextStep).toBe("report_uncertain");
  });

  it("RP-02b: a cancellation after the work already completed is not made uncertain", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "completed", [
      { claim: "Sent the message", evidence: "executor_receipt" },
      { claim: "The thread shows it delivered", evidence: "observed" },
    ]);
    cancelCohort("turn_1");

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    // The work finished before the cancellation arrived. Calling that uncertain
    // would be its own untruth; what cancellation forbids is claiming rollback.
    expect(progress.disposition).toBe("verified_success");
    expect(progress.nextStep).toBe("report");
  });

  it("RP-03: stopping with no dispatch evidence asks rather than guesses", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "failed", [
      { claim: "The login form never appeared", evidence: "observed" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("stopped_without_dispatch");
    // No automatic retry: whether this is worth another attempt is a judgement
    // about the user's goal, not something derivable from a failed observation.
    expect(progress.nextStep).toBe("ask_user");
    expect(progress.verifiedCheckpoints).toEqual([
      "The login form never appeared",
    ]);
  });

  it("RP-04: a corroborated completion reports rather than asking", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "completed", [
      { claim: "The receipt page shows the order", evidence: "observed" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("verified_success");
    expect(progress.nextStep).toBe("report");
    expect(progress.unknownRemainder).toEqual([]);
  });

  it("RP-05: a completion backed only by the worker's word is not called verified", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "completed", [
      { claim: "I submitted it successfully", evidence: "worker_assertion" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("settled_unverified");
    expect(progress.nextStep).toBe("report");
    expect(progress.verifiedCheckpoints).toEqual([]);
    // The claim survives, labelled for what it is.
    expect(progress.unknownRemainder.join(" ")).toMatch(/not corroborated/iu);
  });

  it("RP-06: an unsettled sibling means there is nothing to recover yet", () => {
    admit("task_a", "turn_1");
    admit("task_b", "turn_1");
    settle("task_a", "turn_1", "failed", [
      { claim: "Submitted the form", evidence: "executor_receipt" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("awaiting");
    expect(progress.nextStep).toBe("wait");
    expect(progress.tasksSpent).toBe(2);
  });

  it("RP-07: effort is counted per objective, not across the session", () => {
    admit("task_a", "turn_1");
    admit("task_b", "turn_1");
    admit("task_elsewhere", "turn_2");
    settle("task_a", "turn_1", "completed", [
      { claim: "Checked it", evidence: "observed" },
    ]);
    settle("task_b", "turn_1", "completed", [
      { claim: "Checked the other", evidence: "observed" },
    ]);

    expect(recoveryProgress({ objectiveRevision: "turn_1" }).tasksSpent).toBe(
      2
    );
  });

  it("RP-08: an objective that started no work has nothing to recover", () => {
    const progress = recoveryProgress({ objectiveRevision: "turn_quiet" });

    expect(progress.disposition).toBe("awaiting");
    expect(progress.tasksSpent).toBe(0);
  });
});
