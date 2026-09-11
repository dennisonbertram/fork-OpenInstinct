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

    expect(progress.disposition).toBe("uncertain_effect");
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
    expect(progress.disposition).toBe("uncertain_effect");
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

  it("RP-02c: one task's failure does not relabel another task's confirmed effect", () => {
    // The cross-task case an outside review found: judging a receipt against the
    // whole cohort's status let one task's failure make another task's
    // completed, corroborated dispatch look uncertain.
    admit("task_done", "turn_1");
    admit("task_stalled", "turn_1");
    settle("task_done", "turn_1", "completed", [
      { claim: "Sent the invoice", evidence: "executor_receipt" },
      { claim: "The outbox shows it sent", evidence: "observed" },
    ]);
    settle("task_stalled", "turn_1", "failed", [
      { claim: "The report page never loaded", evidence: "observed" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    // task_stalled never dispatched anything, so nothing here is uncertain.
    expect(progress.disposition).toBe("stopped_incomplete");
    expect(progress.verifiedCheckpoints).toContain("The outbox shows it sent");
  });

  it("RP-02d: an unconfirmed dispatch is an unknown effect, not a known write", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "failed", [
      { claim: "Dispatched the request", evidence: "executor_receipt" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("uncertain_effect");
    const said = progress.unknownRemainder.join(" ");
    // It must not assert what the action was, only that the outcome is unknown
    // and that repeating it cannot be shown to be safe.
    expect(said).toMatch(/never confirmed|cannot establish/iu);
    expect(said).not.toMatch(/\bwrote\b|\bwrite\b/iu);
  });

  it("RP-03: stopping with no dispatch evidence asks rather than guesses", () => {
    admit("task_a", "turn_1");
    settle("task_a", "turn_1", "failed", [
      { claim: "The login form never appeared", evidence: "observed" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });

    expect(progress.disposition).toBe("stopped_incomplete");
    // No automatic retry: whether this is worth another attempt is a judgement
    // about the user's goal, not something derivable from a failed observation.
    expect(progress.nextStep).toBe("ask_user");
    expect(progress.verifiedCheckpoints).toEqual([
      "The login form never appeared",
    ]);
  });

  it("RP-03b: a mixed outcome never claims that nothing was dispatched", () => {
    // The contradiction an outside review found: one task completed with a
    // receipt while another stopped, and the summary asserted that the
    // objective had dispatched nothing.
    admit("task_done", "turn_1");
    admit("task_stopped", "turn_1");
    settle("task_done", "turn_1", "completed", [
      { claim: "Filed the return", evidence: "executor_receipt" },
    ]);
    settle("task_stopped", "turn_1", "failed", [
      { claim: "The second form never loaded", evidence: "observed" },
    ]);

    const progress = recoveryProgress({ objectiveRevision: "turn_1" });
    const said = progress.unknownRemainder.join(" ");

    expect(progress.disposition).toBe("stopped_incomplete");
    // Must not negate the task that did finish, and must not claim non-dispatch.
    expect(said).not.toMatch(/stopped before anything was dispatched/iu);
    expect(said).toMatch(/not the same as proof/iu);
    expect(progress.verifiedCheckpoints).toContain("Filed the return");
  });

  it("RP-05b: a completion with no recorded facts is not credited to the worker's word", () => {
    admit("task_bare", "turn_1");
    settle("task_bare", "turn_1", "completed", []);

    const bare = recoveryProgress({ objectiveRevision: "turn_1" });

    // "Unverified" would imply the worker vouched for it. Nothing did.
    expect(bare.disposition).toBe("settled_without_evidence");
    expect(bare.unknownRemainder.join(" ")).toMatch(/not even the worker/iu);
  });

  it("RP-05c: a completion supported only by unknown-provenance facts is also uncredited", () => {
    admit("task_murky", "turn_1");
    settle("task_murky", "turn_1", "completed", [
      { claim: "Something happened", evidence: "unknown" },
    ]);

    expect(recoveryProgress({ objectiveRevision: "turn_1" }).disposition).toBe(
      "settled_without_evidence"
    );
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
    expect(progress.unknownRemainder.join(" ")).toMatch(
      /nothing corroborated it|worker's own account/iu
    );
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
