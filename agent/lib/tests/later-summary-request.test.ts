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
  beginCohortReport,
  cohortFor,
  recordTerminal,
  reportableCohorts,
  settleCohortReport,
  taskRecords,
} from "@/agent/lib/completion-obligations";
import { recoveryProgress } from "@/agent/lib/recovery-progress";
import { situationView } from "@/agent/lib/situation-view";

beforeEach(() => {
  for (const reset of state.resets) reset();
});

/**
 * RP-06 and AR-05 from `docs/evaluation/completion-summaries.md`, at the unit
 * layer that owns them.
 *
 * Both are about a *later* turn. The user asks "what was the result?" after the
 * work already settled, and the honest answer comes from evidence this session
 * already holds. Doing the work again would be the failure, and so would
 * answering with nothing because the records were consumed by the first report.
 */

function deliverOneTask(
  turnId: string,
  facts: Parameters<typeof recordTerminal>[1]
) {
  admitTask({
    objectiveRevision: turnId,
    parentTurnId: turnId,
    taskId: `${turnId}_task`,
  });
  recordTerminal(
    {
      childSessionId: `${turnId}_session`,
      parentTurnId: turnId,
      status: "completed",
      taskId: `${turnId}_task`,
      workerName: "browser",
    },
    facts
  );
  beginCohortReport(turnId, { callId: `${turnId}_call`, turnId });
  settleCohortReport(turnId, true);
}

describe("a later summary request", () => {
  it("RP-06: answers from retained evidence and admits no new work", () => {
    deliverOneTask("turn_1", [
      { claim: "Submitted the demo comment", evidence: "executor_receipt" },
      { claim: "The comment list shows it received", evidence: "observed" },
    ]);

    // The user now asks: "What was the result? Please summarize it. Do not
    // submit again." That is a new turn reading old evidence.
    const view = situationView({
      turnId: "turn_1",
      objectiveRevision: "turn_1",
    });

    expect(view.evidence.map((item) => item.claim)).toEqual([
      "Submitted the demo comment",
      "The comment list shows it received",
    ]);
    // Nothing is owed a fresh report: the first one was delivered and accepted.
    expect(reportableCohorts()).toEqual([]);
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
    // And answering required no new task.
    expect(taskRecords("turn_1")).toHaveLength(1);
  });

  it("RP-06: a delivered objective is not re-reported merely because it is asked about", () => {
    deliverOneTask("turn_1", [
      { claim: "Submitted the demo comment", evidence: "observed" },
    ]);

    // Asking twice more must not resurrect an obligation. Re-reporting would be
    // the duplicate-summary failure this epic exists to remove.
    for (let ask = 0; ask < 3; ask += 1) {
      expect(reportableCohorts()).toEqual([]);
      expect(
        situationView({ turnId: "turn_1", objectiveRevision: "turn_1" })
          .reportOwedFor
      ).toEqual([]);
    }
  });

  it("AR-05: a cancellation after dispatch keeps the evidence and states uncertainty", () => {
    admitTask({
      objectiveRevision: "turn_1",
      parentTurnId: "turn_1",
      taskId: "task_a",
    });
    recordTerminal(
      {
        childSessionId: "task_a_session",
        parentTurnId: "turn_1",
        status: "failed",
        taskId: "task_a",
        workerName: "browser",
      },
      [{ claim: "Dispatched the submission", evidence: "executor_receipt" }]
    );

    const progress = recoveryProgress({ turnId: "turn_1" });

    // The evidence of the dispatch survives, and the account is uncertain rather
    // than a claim of rollback or of success.
    expect(progress.verifiedCheckpoints).toEqual(["Dispatched the submission"]);
    expect(progress.disposition).toBe("uncertain_effect");
    expect(progress.nextStep).toBe("report_uncertain");
    const said = progress.unknownRemainder.join(" ");
    expect(said).not.toMatch(/rolled back|reverted|received|succeeded/iu);
  });
});
