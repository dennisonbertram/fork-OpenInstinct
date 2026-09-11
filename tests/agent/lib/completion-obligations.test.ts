import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundTaskTerminalRecord } from "@/agent/lib/background-task-terminal";
import { browserImageArtifactUrl } from "@/lib/browser-artifact";
import { maximumWorkerCompletionImages } from "@/lib/worker-completion";

/** What the framework's two task projections would hand authored code. */
interface ProjectionFixtures {
  terminals: readonly unknown[];
  members: readonly unknown[];
}

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  // SAFETY: these stand in for the framework's own projections, which reach
  // authored code untyped. Each test assigns records the adapters then
  // validate, which is exactly the boundary under test.
  const projections: ProjectionFixtures = { terminals: [], members: [] };
  resets.push(() => {
    projections.terminals = [];
    projections.members = [];
  });
  return { resets, projections };
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
  readBackgroundTaskTerminals: () => state.projections.terminals,
  readBackgroundTaskMembers: () => state.projections.members,
}));

import {
  admitTask,
  beginCohortReport,
  cohortForReportAttempt,
  blockCohort,
  cancelCohort,
  cohortFor,
  completionCapacity,
  factsFromWorkerCompletion,
  recordTerminal,
  reconcileBackgroundTasks,
  reportableCohorts,
  retireCohort,
  retiredSummaries,
  settleCohortReport,
  supersedeCohort,
  taskRecords,
  type BoundedFact,
} from "@/agent/lib/completion-obligations";

beforeEach(() => {
  for (const reset of state.resets) reset();
});

function terminal(
  overrides: Partial<BackgroundTaskTerminalRecord> = {}
): BackgroundTaskTerminalRecord {
  return {
    taskId: "task_1",
    parentTurnId: "turn_1",
    childSessionId: "session_1",
    workerName: "worker",
    status: "completed",
    ...overrides,
  };
}

function fact(overrides: Partial<BoundedFact> = {}): BoundedFact {
  return {
    claim: "did the thing",
    evidence: "worker_assertion",
    ...overrides,
  };
}

function admit(input: {
  taskId: string;
  parentTurnId: string;
  objectiveRevision?: string;
  /** Accepted so existing cases read naturally; the child session is learned
   * from the terminal, never supplied at admission. */
  workerSessionId?: string;
}) {
  return admitTask({
    taskId: input.taskId,
    parentTurnId: input.parentTurnId,
    objectiveRevision: input.objectiveRevision ?? "rev_1",
  });
}

describe("admission without a child session", () => {
  // A task is admitted BEFORE its worker is dispatched. At that moment the
  // parent's task index holds { taskId, taskRunId, taskInboxToken,
  // createdByTurnId, metadata, executor?: { data, kind } } — no child session
  // anywhere. `childSessionId` only appears on `terminalView.executor`, which
  // exists once the task has settled. So the root can only admit on what it
  // knows, and must learn the child identity from the terminal.
  it("AC-01: admits on task and parent turn alone, then records the child identity from the terminal", () => {
    const admission = admitTask({
      taskId: "task_1",
      parentTurnId: "turn_1",
      objectiveRevision: "rev_1",
    });
    expect(admission).toEqual({ admitted: true, cohortId: "turn_1" });

    const outcome = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_learned",
        childTurnId: "turn_child",
      }),
      [fact()]
    );
    expect(outcome).toEqual({ matched: true, cohortBecameReportable: true });

    const task = taskRecords("turn_1").find(
      (candidate) => candidate.taskId === "task_1"
    );
    expect(task?.workerSessionId).toBe("session_learned");
    expect(task?.workerTurnId).toBe("turn_child");
  });

  it("AC-02: still rejects a terminal whose task or parent turn disagrees", () => {
    admitTask({
      taskId: "task_1",
      parentTurnId: "turn_1",
      objectiveRevision: "rev_1",
    });
    const before = taskRecords("turn_1");

    expect(
      recordTerminal(terminal({ taskId: "other", parentTurnId: "turn_1" }), [
        fact(),
      ])
    ).toEqual({ matched: false, cohortBecameReportable: false });
    expect(
      recordTerminal(terminal({ taskId: "task_1", parentTurnId: "other" }), [
        fact(),
      ])
    ).toEqual({ matched: false, cohortBecameReportable: false });
    expect(taskRecords("turn_1")).toEqual(before);
  });
});

describe("recordTerminal", () => {
  it("CO-01: first terminal of a two-task cohort leaves it awaiting_terminal", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    admit({
      taskId: "task_2",
      parentTurnId: "turn_1",
      workerSessionId: "session_2",
    });

    const outcome = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact()]
    );

    expect(outcome).toEqual({ matched: true, cohortBecameReportable: false });
    expect(cohortFor("turn_1")?.phase).toBe("awaiting_terminal");
    expect(reportableCohorts()).toEqual([]);
  });

  it("CO-02: the second terminal transitions to must_report exactly once", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    admit({
      taskId: "task_2",
      parentTurnId: "turn_1",
      workerSessionId: "session_2",
    });

    const first = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact()]
    );
    expect(first.cohortBecameReportable).toBe(false);

    const second = recordTerminal(
      terminal({
        taskId: "task_2",
        parentTurnId: "turn_1",
        childSessionId: "session_2",
      }),
      [fact()]
    );
    expect(second).toEqual({ matched: true, cohortBecameReportable: true });
    expect(cohortFor("turn_1")?.phase).toBe("must_report");

    // Re-recording either terminal must not add a second transition.
    const replayFirst = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact()]
    );
    expect(replayFirst).toEqual({
      matched: true,
      cohortBecameReportable: false,
    });
    expect(cohortFor("turn_1")?.phase).toBe("must_report");

    const replaySecond = recordTerminal(
      terminal({
        taskId: "task_2",
        parentTurnId: "turn_1",
        childSessionId: "session_2",
      }),
      [fact()]
    );
    expect(replaySecond).toEqual({
      matched: true,
      cohortBecameReportable: false,
    });
    expect(cohortFor("turn_1")?.phase).toBe("must_report");
  });

  it("CO-03: two cohorts from different parent turns stay independent under interleaved terminals", () => {
    admit({ taskId: "a1", parentTurnId: "turn_a", workerSessionId: "sess_a1" });
    admit({ taskId: "a2", parentTurnId: "turn_a", workerSessionId: "sess_a2" });
    admit({ taskId: "b1", parentTurnId: "turn_b", workerSessionId: "sess_b1" });
    admit({ taskId: "b2", parentTurnId: "turn_b", workerSessionId: "sess_b2" });

    recordTerminal(
      terminal({
        taskId: "a1",
        parentTurnId: "turn_a",
        childSessionId: "sess_a1",
      }),
      [fact({ claim: "a1 done" })]
    );
    recordTerminal(
      terminal({
        taskId: "b1",
        parentTurnId: "turn_b",
        childSessionId: "sess_b1",
      }),
      [fact({ claim: "b1 done" })]
    );

    expect(cohortFor("turn_a")?.phase).toBe("awaiting_terminal");
    expect(cohortFor("turn_b")?.phase).toBe("awaiting_terminal");

    const bDone = recordTerminal(
      terminal({
        taskId: "b2",
        parentTurnId: "turn_b",
        childSessionId: "sess_b2",
      }),
      [fact({ claim: "b2 done" })]
    );
    expect(bDone).toEqual({ matched: true, cohortBecameReportable: true });
    expect(cohortFor("turn_b")?.phase).toBe("must_report");
    expect(cohortFor("turn_a")?.phase).toBe("awaiting_terminal");

    const aTasks = taskRecords("turn_a");
    const bTasks = taskRecords("turn_b");
    expect(aTasks.map((task) => task.taskId).toSorted()).toEqual(["a1", "a2"]);
    expect(bTasks.map((task) => task.taskId).toSorted()).toEqual(["b1", "b2"]);
    expect(
      aTasks.find((task) => task.taskId === "a2")?.terminal
    ).toBeUndefined();
  });

  it("CO-04: a terminal with any mismatched identity field does not match and leaves state unchanged", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    const before = taskRecords("turn_1");
    const beforeCohort = cohortFor("turn_1");

    const wrongTask = recordTerminal(
      terminal({
        taskId: "wrong_task",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact()]
    );
    expect(wrongTask).toEqual({
      matched: false,
      cohortBecameReportable: false,
    });
    expect(taskRecords("turn_1")).toEqual(before);
    expect(cohortFor("turn_1")).toEqual(beforeCohort);

    const wrongParentTurn = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "wrong_turn",
        childSessionId: "session_1",
      }),
      [fact()]
    );
    expect(wrongParentTurn).toEqual({
      matched: false,
      cohortBecameReportable: false,
    });
    expect(taskRecords("turn_1")).toEqual(before);
    expect(cohortFor("turn_1")).toEqual(beforeCohort);

    // A differing child session is NOT a rejection case: the root never knew
    // one to begin with, so the terminal's child identity is recorded as
    // evidence. What must not happen is a silent mismatch being treated as
    // authority over task or turn identity, which the two cases above cover.
    const learnedChildSession = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "whatever_the_runtime_used",
      }),
      [fact()]
    );
    expect(learnedChildSession.matched).toBe(true);
    expect(
      taskRecords("turn_1").find((task) => task.taskId === "task_1")
        ?.workerSessionId
    ).toBe("whatever_the_runtime_used");
  });

  it("CO-06: a cancelled cohort with a retained executor_receipt stays reportable; one with only assertions does not", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact({ evidence: "executor_receipt", claim: "wrote the file" })]
    );
    cancelCohort("turn_1");
    expect(cohortFor("turn_1")?.phase).toBe("cancelled");
    expect(reportableCohorts().map((c) => c.cohortId)).toContain("turn_1");

    admit({
      taskId: "task_2",
      parentTurnId: "turn_2",
      workerSessionId: "session_2",
    });
    recordTerminal(
      terminal({
        taskId: "task_2",
        parentTurnId: "turn_2",
        childSessionId: "session_2",
      }),
      [fact({ evidence: "worker_assertion" })]
    );
    cancelCohort("turn_2");
    expect(cohortFor("turn_2")?.phase).toBe("cancelled");
    expect(reportableCohorts().map((c) => c.cohortId)).not.toContain("turn_2");
  });

  it("CO-07: a late terminal for a superseded cohort updates the task record but never becomes reportable", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    supersedeCohort("turn_1");
    expect(cohortFor("turn_1")?.phase).toBe("superseded");

    const outcome = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact({ claim: "finished late" })]
    );
    expect(outcome).toEqual({ matched: true, cohortBecameReportable: false });
    expect(cohortFor("turn_1")?.phase).toBe("superseded");
    expect(reportableCohorts().map((c) => c.cohortId)).not.toContain("turn_1");
    expect(
      taskRecords("turn_1").find((task) => task.taskId === "task_1")?.terminal
    ).toEqual({
      status: "completed",
      facts: [fact({ claim: "finished late" })],
    });
  });

  it("CO-08: replaying the same terminal is idempotent with no duplicate facts and one transition", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    admit({
      taskId: "task_2",
      parentTurnId: "turn_1",
      workerSessionId: "session_2",
    });

    recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact({ claim: "task_1 done" })]
    );
    const promoting = recordTerminal(
      terminal({
        taskId: "task_2",
        parentTurnId: "turn_1",
        childSessionId: "session_2",
      }),
      [fact({ claim: "task_2 done" })]
    );
    expect(promoting.cohortBecameReportable).toBe(true);
    expect(cohortFor("turn_1")?.phase).toBe("must_report");

    const replay = recordTerminal(
      terminal({
        taskId: "task_2",
        parentTurnId: "turn_1",
        childSessionId: "session_2",
      }),
      [fact({ claim: "task_2 done" })]
    );
    expect(replay).toEqual({ matched: true, cohortBecameReportable: false });
    expect(cohortFor("turn_1")?.phase).toBe("must_report");
    expect(
      taskRecords("turn_1").find((task) => task.taskId === "task_2")?.terminal
        ?.facts
    ).toEqual([fact({ claim: "task_2 done" })]);
  });

  it("truncates facts beyond factsPerTask and marks truncatedUnknown", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    const nineFacts = Array.from({ length: 9 }, (_, index) =>
      fact({ claim: `fact_${String(index)}` })
    );
    recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      nineFacts
    );
    const record = taskRecords("turn_1").find(
      (task) => task.taskId === "task_1"
    );
    expect(record?.terminal?.truncatedUnknown).toBe(true);
    expect(record?.terminal?.facts).toEqual(
      nineFacts.slice(0, completionCapacity.factsPerTask)
    );
  });

  it("a terminal for a delivered cohort updates the task record but never downgrades the phase", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact({ claim: "first" })]
    );
    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" })
    ).toBe(true);
    settleCohortReport("turn_1", true);
    expect(cohortFor("turn_1")?.phase).toBe("delivered");

    const outcome = recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
        status: "failed",
      }),
      [fact({ claim: "actually failed" })]
    );
    expect(outcome).toEqual({ matched: true, cohortBecameReportable: false });
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
    expect(
      taskRecords("turn_1").find((task) => task.taskId === "task_1")?.terminal
        ?.status
    ).toBe("failed");
  });
});

describe("admitTask capacity (CO-09, CO-11)", () => {
  it("CO-09: a ninth task in a cohort is refused with a truthful reason before any state change", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    for (let index = 2; index <= 8; index += 1) {
      admit({
        taskId: `task_${String(index)}`,
        parentTurnId: "turn_1",
        workerSessionId: `session_${String(index)}`,
      });
    }
    expect(taskRecords("turn_1")).toHaveLength(8);
    const before = taskRecords("turn_1");
    const beforeCohort = cohortFor("turn_1");

    const result = admit({
      taskId: "task_9",
      parentTurnId: "turn_1",
      workerSessionId: "session_9",
    });
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error("expected refusal");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(taskRecords("turn_1")).toEqual(before);
    expect(cohortFor("turn_1")).toEqual(beforeCohort);
  });

  it("CO-09: a ninth cohort is refused with a truthful reason before any state change", () => {
    for (let index = 1; index <= 8; index += 1) {
      admit({
        taskId: `task_${String(index)}`,
        parentTurnId: `turn_${String(index)}`,
        workerSessionId: `session_${String(index)}`,
      });
    }
    const beforeCohorts = Array.from({ length: 8 }, (_, index) =>
      cohortFor(`turn_${String(index + 1)}`)
    );

    const result = admit({
      taskId: "task_9",
      parentTurnId: "turn_9",
      workerSessionId: "session_9",
    });
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error("expected refusal");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(cohortFor("turn_9")).toBeUndefined();
    expect(taskRecords("turn_9")).toEqual([]);
    for (let index = 1; index <= 8; index += 1) {
      expect(cohortFor(`turn_${String(index)}`)).toEqual(
        beforeCohorts[index - 1]
      );
    }
  });

  it("CO-09: a ninth fact truncates to 8 with truncatedUnknown and keeps task identity", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    const nineFacts = Array.from({ length: 9 }, (_, index) =>
      fact({ claim: `fact_${String(index)}` })
    );
    recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      nineFacts
    );
    const record = taskRecords("turn_1").find(
      (task) => task.taskId === "task_1"
    );
    expect(record?.taskId).toBe("task_1");
    expect(record?.terminal?.truncatedUnknown).toBe(true);
    expect(record?.terminal?.facts).toHaveLength(
      completionCapacity.factsPerTask
    );
  });

  it("CO-11: every open cohort slot held by a protected phase refuses admission and records nothing", () => {
    for (let index = 1; index <= 8; index += 1) {
      const turnId = `turn_${String(index)}`;
      admit({
        taskId: `task_${String(index)}`,
        parentTurnId: turnId,
        workerSessionId: `session_${String(index)}`,
      });
      recordTerminal(
        terminal({
          taskId: `task_${String(index)}`,
          parentTurnId: turnId,
          childSessionId: `session_${String(index)}`,
        }),
        [fact()]
      );
      expect(cohortFor(turnId)?.phase).toBe("must_report");
    }

    const beforeCohorts = Array.from({ length: 8 }, (_, index) =>
      cohortFor(`turn_${String(index + 1)}`)
    );

    const result = admit({
      taskId: "task_new",
      parentTurnId: "turn_new",
      workerSessionId: "session_new",
    });
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error("expected refusal");
    expect(result.reason.length).toBeGreaterThan(0);
    expect(cohortFor("turn_new")).toBeUndefined();
    expect(taskRecords("turn_new")).toEqual([]);
    for (let index = 1; index <= 8; index += 1) {
      expect(cohortFor(`turn_${String(index)}`)).toEqual(
        beforeCohorts[index - 1]
      );
    }
  });
});

describe("reportableCohorts", () => {
  it("returns must_report cohorts and excludes every other phase", () => {
    admit({
      taskId: "t_must",
      parentTurnId: "turn_must",
      workerSessionId: "s_must",
    });
    recordTerminal(
      terminal({
        taskId: "t_must",
        parentTurnId: "turn_must",
        childSessionId: "s_must",
      }),
      [fact()]
    );
    expect(cohortFor("turn_must")?.phase).toBe("must_report");

    admit({
      taskId: "t_wait",
      parentTurnId: "turn_wait",
      workerSessionId: "s_wait",
    });
    admit({
      taskId: "t_wait2",
      parentTurnId: "turn_wait",
      workerSessionId: "s_wait2",
    });

    admit({
      taskId: "t_pending",
      parentTurnId: "turn_pending",
      workerSessionId: "s_pending",
    });
    recordTerminal(
      terminal({
        taskId: "t_pending",
        parentTurnId: "turn_pending",
        childSessionId: "s_pending",
      }),
      [fact()]
    );
    beginCohortReport("turn_pending", { turnId: "turn_1", callId: "call_1" });
    expect(cohortFor("turn_pending")?.phase).toBe("delivery_pending");

    admit({
      taskId: "t_delivered",
      parentTurnId: "turn_delivered",
      workerSessionId: "s_delivered",
    });
    recordTerminal(
      terminal({
        taskId: "t_delivered",
        parentTurnId: "turn_delivered",
        childSessionId: "s_delivered",
      }),
      [fact()]
    );
    beginCohortReport("turn_delivered", { turnId: "turn_1", callId: "call_1" });
    settleCohortReport("turn_delivered", true);
    expect(cohortFor("turn_delivered")?.phase).toBe("delivered");

    admit({
      taskId: "t_superseded",
      parentTurnId: "turn_superseded",
      workerSessionId: "s_superseded",
    });
    supersedeCohort("turn_superseded");

    const ids = reportableCohorts().map((cohort) => cohort.cohortId);
    expect(ids).toContain("turn_must");
    expect(ids).not.toContain("turn_wait");
    expect(ids).not.toContain("turn_pending");
    expect(ids).not.toContain("turn_delivered");
    expect(ids).not.toContain("turn_superseded");
  });
});

describe("beginCohortReport and settleCohortReport", () => {
  function makeReportable(cohortId: string, taskId: string, sessionId: string) {
    admit({ taskId, parentTurnId: cohortId, workerSessionId: sessionId });
    recordTerminal(
      terminal({ taskId, parentTurnId: cohortId, childSessionId: sessionId }),
      [fact()]
    );
  }

  /**
   * Two cohorts owed at once, each bound in the same reporting turn. This is
   * what makes both halves of the attempt identity load-bearing: the turn alone
   * does not distinguish them, and neither does the call alone.
   */
  function twoBoundReports() {
    makeReportable("turn_a", "task_a", "session_a");
    makeReportable("turn_b", "task_b", "session_b");
    expect(
      beginCohortReport("turn_a", { callId: "call_1", turnId: "turn_report" })
    ).toBe(true);
    expect(
      beginCohortReport("turn_b", { callId: "call_2", turnId: "turn_report" })
    ).toBe(true);
  }

  it("CO-08: an attempt is identified by its turn and its call together", () => {
    twoBoundReports();

    expect(
      cohortForReportAttempt({ callId: "call_1", turnId: "turn_report" })
        ?.cohortId
    ).toBe("turn_a");
    expect(
      cohortForReportAttempt({ callId: "call_2", turnId: "turn_report" })
        ?.cohortId
    ).toBe("turn_b");
  });

  it("CO-09: neither half of the attempt identity is enough on its own", () => {
    twoBoundReports();

    // Same turn, a call that belongs to no attempt.
    expect(
      cohortForReportAttempt({ callId: "call_3", turnId: "turn_report" })
    ).toBeUndefined();
    // Same call, a turn that belongs to no attempt.
    expect(
      cohortForReportAttempt({ callId: "call_1", turnId: "another_turn" })
    ).toBeUndefined();
  });

  it("CO-10: settling one attempt leaves the other report outstanding", () => {
    twoBoundReports();

    const first = cohortForReportAttempt({
      callId: "call_1",
      turnId: "turn_report",
    });
    if (!first) throw new Error("expected the first attempt to be found");
    settleCohortReport(first.cohortId, true);

    expect(cohortFor("turn_a")?.phase).toBe("delivered");
    expect(cohortFor("turn_b")?.phase).toBe("delivery_pending");
  });

  it("CO-11: the first attempt at a cohort's report is revision zero", () => {
    makeReportable("turn_1", "task_1", "session_1");
    expect(
      beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" })
    ).toBe(true);

    expect(cohortFor("turn_1")?.reportRevision).toBe(0);
  });

  it("CO-12: a later turn asking again is a new revision, not a retry", () => {
    makeReportable("turn_1", "task_1", "session_1");
    expect(
      beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" })
    ).toBe(true);
    // The provider never confirmed, so the attempt is terminal and nothing
    // resends it inside its own turn.
    settleCohortReport("turn_1", false);
    expect(cohortFor("turn_1")?.phase).toBe("unconfirmed");

    // The user asks again in a later turn. That is a new obligation, so the
    // durable claim must key on a different revision rather than colliding
    // with the attempt that may already have reached the provider.
    expect(
      beginCohortReport("turn_1", { callId: "call_2", turnId: "turn_2" })
    ).toBe(true);

    expect(cohortFor("turn_1")?.reportRevision).toBe(1);
  });

  it("CO-13: the same attempt re-announcing itself is not a new revision", () => {
    makeReportable("turn_1", "task_1", "session_1");
    expect(
      beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" })
    ).toBe(true);
    // The identical call announcing itself again is the same physical attempt.
    // Counting it as a revision would let one send claim two durable rows.
    expect(
      beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" })
    ).toBe(true);

    expect(cohortFor("turn_1")?.reportRevision).toBe(0);
  });

  it("returns false when the cohort owes no report", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    expect(cohortFor("turn_1")?.phase).toBe("awaiting_terminal");
    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" })
    ).toBe(false);
    expect(cohortFor("turn_1")?.phase).toBe("awaiting_terminal");
  });

  it("returns true and moves the cohort to delivery_pending when reportable", () => {
    makeReportable("turn_1", "task_1", "session_1");
    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" })
    ).toBe(true);
    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_1")?.report).toEqual({
      turnId: "turn_1",
      callId: "call_1",
    });
  });

  it("refuses a different callId in the same turnId once an attempt holds the obligation, but is idempotent for the same callId", () => {
    makeReportable("turn_1", "task_1", "session_1");
    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" })
    ).toBe(true);
    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_2" })
    ).toBe(false);
    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" })
    ).toBe(true);
    expect(cohortFor("turn_1")?.report).toEqual({
      turnId: "turn_1",
      callId: "call_1",
    });
  });

  it("settleCohortReport(true) moves delivery_pending to delivered", () => {
    makeReportable("turn_1", "task_1", "session_1");
    beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" });
    settleCohortReport("turn_1", true);
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
  });

  it("settleCohortReport(false) moves delivery_pending to unconfirmed", () => {
    makeReportable("turn_1", "task_1", "session_1");
    beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" });
    settleCohortReport("turn_1", false);
    expect(cohortFor("turn_1")?.phase).toBe("unconfirmed");
  });

  it("settleCohortReport on any other phase changes nothing", () => {
    makeReportable("turn_1", "task_1", "session_1");
    const before = cohortFor("turn_1");
    settleCohortReport("turn_1", true);
    expect(cohortFor("turn_1")).toEqual(before);
  });

  it("no-resend: from unconfirmed, the same turnId is refused but a new turnId is allowed", () => {
    makeReportable("turn_1", "task_1", "session_1");
    beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" });
    settleCohortReport("turn_1", false);
    expect(cohortFor("turn_1")?.phase).toBe("unconfirmed");

    expect(
      beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_2" })
    ).toBe(false);
    expect(cohortFor("turn_1")?.phase).toBe("unconfirmed");

    expect(
      beginCohortReport("turn_1", { turnId: "turn_2", callId: "call_2" })
    ).toBe(true);
    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_1")?.report).toEqual({
      turnId: "turn_2",
      callId: "call_2",
    });
  });
});

describe("blockCohort, cancelCohort, supersedeCohort", () => {
  function makeReportable(cohortId: string, taskId: string, sessionId: string) {
    admit({ taskId, parentTurnId: cohortId, workerSessionId: sessionId });
    recordTerminal(
      terminal({ taskId, parentTurnId: cohortId, childSessionId: sessionId }),
      [fact()]
    );
  }

  it("blockCohort sets phase blocked and stores the reason", () => {
    makeReportable("turn_1", "task_1", "session_1");
    blockCohort("turn_1", "no delivery channel is bound for this turn");
    expect(cohortFor("turn_1")?.phase).toBe("blocked");
    expect(cohortFor("turn_1")?.blockedReason).toBe(
      "no delivery channel is bound for this turn"
    );
  });

  it("cancelCohort sets phase cancelled", () => {
    makeReportable("turn_1", "task_1", "session_1");
    cancelCohort("turn_1");
    expect(cohortFor("turn_1")?.phase).toBe("cancelled");
  });

  it("supersedeCohort sets phase superseded", () => {
    makeReportable("turn_1", "task_1", "session_1");
    supersedeCohort("turn_1");
    expect(cohortFor("turn_1")?.phase).toBe("superseded");
  });

  it("none of blockCohort, cancelCohort, supersedeCohort may move a delivered cohort", () => {
    makeReportable("turn_1", "task_1", "session_1");
    beginCohortReport("turn_1", { turnId: "turn_1", callId: "call_1" });
    settleCohortReport("turn_1", true);
    expect(cohortFor("turn_1")?.phase).toBe("delivered");

    blockCohort("turn_1", "should not apply");
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
    cancelCohort("turn_1");
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
    supersedeCohort("turn_1");
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
  });
});

describe("retireCohort (CO-10)", () => {
  function deliverCohort(cohortId: string, taskId: string, sessionId: string) {
    admit({ taskId, parentTurnId: cohortId, workerSessionId: sessionId });
    recordTerminal(
      terminal({ taskId, parentTurnId: cohortId, childSessionId: sessionId }),
      [fact({ evidence: "executor_receipt", claim: "wrote output" })]
    );
    beginCohortReport(cohortId, {
      turnId: "turn_report",
      callId: "call_report",
    });
    settleCohortReport(cohortId, true);
  }

  it("retires a delivered cohort to one summary that supports a later question", () => {
    deliverCohort("turn_1", "task_1", "session_1");
    const result = retireCohort("turn_1");
    expect(result).toBe(true);
    expect(cohortFor("turn_1")).toBeUndefined();
    expect(taskRecords("turn_1")).toEqual([]);

    const summaries = retiredSummaries();
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    if (summary === undefined) throw new Error("expected one summary");
    expect(summary).toEqual({
      cohortId: "turn_1",
      objectiveRevision: "rev_1",
      outcome: "completed",
      reportState: "delivered",
      report: { turnId: "turn_report", callId: "call_report" },
      evidenceDigest: summary.evidenceDigest,
    });
    expect(summary.evidenceDigest).toHaveLength(1);
    expect(summary.evidenceDigest[0]).toContain("task_1");
  });

  it("reports outcome mixed when tasks disagree on terminal status", () => {
    admit({
      taskId: "task_1",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    admit({
      taskId: "task_2",
      parentTurnId: "turn_1",
      workerSessionId: "session_2",
    });
    recordTerminal(
      terminal({
        taskId: "task_1",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact()]
    );
    recordTerminal(
      terminal({
        taskId: "task_2",
        parentTurnId: "turn_1",
        childSessionId: "session_2",
        status: "failed",
      }),
      [fact()]
    );
    beginCohortReport("turn_1", {
      turnId: "turn_report",
      callId: "call_report",
    });
    settleCohortReport("turn_1", true);
    const result = retireCohort("turn_1");
    expect(result).toBe(true);
    expect(retiredSummaries()[0]?.outcome).toBe("mixed");
  });

  it("refuses to retire every protected phase, plus awaiting_terminal and cancelled, and drops nothing", () => {
    const refusedCases: [string, () => void][] = [
      [
        "turn_must",
        () => {
          admit({
            taskId: "t_must",
            parentTurnId: "turn_must",
            workerSessionId: "s_must",
          });
          recordTerminal(
            terminal({
              taskId: "t_must",
              parentTurnId: "turn_must",
              childSessionId: "s_must",
            }),
            [fact()]
          );
        },
      ],
      [
        "turn_pending",
        () => {
          admit({
            taskId: "t_pending",
            parentTurnId: "turn_pending",
            workerSessionId: "s_pending",
          });
          recordTerminal(
            terminal({
              taskId: "t_pending",
              parentTurnId: "turn_pending",
              childSessionId: "s_pending",
            }),
            [fact()]
          );
          beginCohortReport("turn_pending", {
            turnId: "turn_r",
            callId: "call_r",
          });
        },
      ],
      [
        "turn_unconfirmed",
        () => {
          admit({
            taskId: "t_unconfirmed",
            parentTurnId: "turn_unconfirmed",
            workerSessionId: "s_unconfirmed",
          });
          recordTerminal(
            terminal({
              taskId: "t_unconfirmed",
              parentTurnId: "turn_unconfirmed",
              childSessionId: "s_unconfirmed",
            }),
            [fact()]
          );
          beginCohortReport("turn_unconfirmed", {
            turnId: "turn_r",
            callId: "call_r",
          });
          settleCohortReport("turn_unconfirmed", false);
        },
      ],
      [
        "turn_blocked",
        () => {
          admit({
            taskId: "t_blocked",
            parentTurnId: "turn_blocked",
            workerSessionId: "s_blocked",
          });
          recordTerminal(
            terminal({
              taskId: "t_blocked",
              parentTurnId: "turn_blocked",
              childSessionId: "s_blocked",
            }),
            [fact()]
          );
          blockCohort("turn_blocked", "no channel");
        },
      ],
      [
        "turn_awaiting",
        () => {
          admit({
            taskId: "t_awaiting",
            parentTurnId: "turn_awaiting",
            workerSessionId: "s_awaiting",
          });
        },
      ],
      [
        "turn_cancelled",
        () => {
          admit({
            taskId: "t_cancelled",
            parentTurnId: "turn_cancelled",
            workerSessionId: "s_cancelled",
          });
          cancelCohort("turn_cancelled");
        },
      ],
    ];

    for (const [cohortId, setup] of refusedCases) {
      setup();
      const beforeCohort = cohortFor(cohortId);
      const beforeTasks = taskRecords(cohortId);
      const result = retireCohort(cohortId);
      expect(result).toBe(false);
      expect(cohortFor(cohortId)).toEqual(beforeCohort);
      expect(taskRecords(cohortId)).toEqual(beforeTasks);
    }
    expect(retiredSummaries()).toEqual([]);
  });

  it("refuses to retire a delivered cohort that still has an unsettled task, and never claims a unanimous outcome for it", () => {
    // A task can join a cohort that already owes a report, so a delivered
    // cohort can still hold a member that never reported. Retiring it would
    // drop that member's record and claim the whole cohort completed.
    admit({
      taskId: "task_reported",
      parentTurnId: "turn_1",
      workerSessionId: "session_1",
    });
    recordTerminal(
      terminal({
        taskId: "task_reported",
        parentTurnId: "turn_1",
        childSessionId: "session_1",
      }),
      [fact()]
    );
    expect(cohortFor("turn_1")?.phase).toBe("must_report");

    admit({
      taskId: "task_straggler",
      parentTurnId: "turn_1",
      workerSessionId: "session_2",
    });
    beginCohortReport("turn_1", {
      turnId: "turn_report",
      callId: "call_report",
    });
    settleCohortReport("turn_1", true);
    expect(cohortFor("turn_1")?.phase).toBe("delivered");

    expect(retireCohort("turn_1")).toBe(false);
    expect(retiredSummaries()).toEqual([]);
    expect(
      taskRecords("turn_1")
        .map((task) => task.taskId)
        .toSorted()
    ).toEqual(["task_reported", "task_straggler"]);

    // Once the straggler reports, retirement is allowed again.
    recordTerminal(
      terminal({
        taskId: "task_straggler",
        parentTurnId: "turn_1",
        childSessionId: "session_2",
        status: "failed",
      }),
      [fact()]
    );
    expect(retireCohort("turn_1")).toBe(true);
    expect(retiredSummaries()[0]?.outcome).toBe("mixed");
  });

  it("33 retirements evict the oldest summary and hold the cap at 32", () => {
    for (let index = 1; index <= 33; index += 1) {
      const cohortId = `turn_${String(index)}`;
      deliverCohort(
        cohortId,
        `task_${String(index)}`,
        `session_${String(index)}`
      );
      expect(retireCohort(cohortId)).toBe(true);
    }
    const summaries = retiredSummaries();
    expect(summaries).toHaveLength(completionCapacity.retiredSummaries);
    expect(summaries.map((summary) => summary.cohortId)).not.toContain(
      "turn_1"
    );
    expect(summaries.map((summary) => summary.cohortId)).toContain("turn_33");
    expect(summaries[0]?.cohortId).toBe("turn_2");
  });
});

function image(id: string, label: string) {
  return {
    byteSize: 1024,
    filename: "shot.png",
    id,
    label,
    mediaType: "image/png" as const,
    url: browserImageArtifactUrl(id),
  };
}

describe("factsFromWorkerCompletion (CO-05)", () => {
  const firstArtifactId = "11111111-1111-4111-8111-111111111111";
  const secondArtifactId = "22222222-2222-4222-8222-222222222222";
  const unownedArtifactId = "33333333-3333-4333-8333-333333333333";

  it("a current success payload yields a worker_assertion and one observed fact per owned image", () => {
    const result = factsFromWorkerCompletion(
      {
        status: "success",
        message: "done",
        images: [
          image(firstArtifactId, "checkout page"),
          image(secondArtifactId, "receipt"),
        ],
      },
      { ownedArtifactIds: [firstArtifactId, secondArtifactId] }
    );

    expect(result.facts).toEqual([
      { claim: "done", evidence: "worker_assertion" },
      {
        claim: "checkout page",
        evidence: "observed",
        reference: firstArtifactId,
      },
      { claim: "receipt", evidence: "observed", reference: secondArtifactId },
    ]);
  });

  it("an image artifact not in ownedArtifactIds produces no observed fact", () => {
    const result = factsFromWorkerCompletion(
      {
        status: "success",
        message: "done",
        images: [image(unownedArtifactId, "a page this session does not own")],
      },
      { ownedArtifactIds: [] }
    );

    expect(result.facts).toEqual([
      { claim: "done", evidence: "worker_assertion" },
    ]);
  });

  it("a failure payload yields a worker_assertion fact and no observed fact", () => {
    const result = factsFromWorkerCompletion({
      status: "failure",
      message: "it broke",
      images: [],
    });

    expect(result.facts).toEqual([
      { claim: "it broke", evidence: "worker_assertion" },
    ]);
  });

  it("a legacy payload with no images key still classifies its message as worker_assertion only", () => {
    const result = factsFromWorkerCompletion({
      status: "success",
      message: "legacy done",
    });

    expect(result.facts).toEqual([
      { claim: "legacy done", evidence: "worker_assertion" },
    ]);
  });

  it("unrecognisable output yields exactly one unknown fact and never a fabricated success", () => {
    for (const unclassifiable of ["just a string", undefined, 42]) {
      const result = factsFromWorkerCompletion(unclassifiable);
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0]?.evidence).toBe("unknown");
      expect(result.facts[0]?.claim).not.toContain("success");
    }
  });

  // The worker contract caps images at `maximumWorkerCompletionImages`, so a
  // classified payload can never reach the eight-fact cap. The cap itself is
  // exercised where facts arrive unbounded, on `recordTerminal`.
  //
  // Over that image limit, the worker-completion union falls back to its
  // historical no-images shape. That drops the image evidence rather than
  // trusting an over-limit payload, which is the conservative direction: the
  // worker's own words survive as an assertion and nothing is promoted to
  // observed.
  it("an over-limit image payload keeps the worker's assertion and promotes nothing to observed", () => {
    const many = Array.from(
      { length: maximumWorkerCompletionImages + 1 },
      (_, index) =>
        image(
          `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
          `shot ${String(index)}`
        )
    );
    const result = factsFromWorkerCompletion(
      { status: "success", message: "done", images: many },
      { ownedArtifactIds: many.map((artifact) => artifact.id) }
    );

    expect(result.facts).toEqual([
      { claim: "done", evidence: "worker_assertion" },
    ]);
  });

  it("classifies every image the worker contract does allow", () => {
    const many = Array.from(
      { length: maximumWorkerCompletionImages },
      (_, index) =>
        image(
          `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
          `shot ${String(index)}`
        )
    );
    const result = factsFromWorkerCompletion(
      { status: "success", message: "done", images: many },
      { ownedArtifactIds: many.map((artifact) => artifact.id) }
    );

    expect(result.facts).toHaveLength(maximumWorkerCompletionImages + 1);
    expect(result.truncatedUnknown).toBeUndefined();
  });
});

function member(taskId: string, parentTurnId: string, settled: boolean) {
  return { taskId, parentTurnId, workerName: "browser", settled };
}

function projected(
  taskId: string,
  parentTurnId: string,
  output: { status: "success" | "failure"; message: string; images?: [] }
) {
  return {
    taskId,
    terminalTaskId: taskId,
    parentTurnId,
    childSessionId: `${taskId}_session`,
    childTurnId: `${taskId}_turn`,
    workerName: "browser",
    status: "completed" as const,
    output,
  };
}

describe("reconcileBackgroundTasks (the root registration)", () => {
  it("RG-01: a pending sibling keeps the cohort from owing a report", () => {
    state.projections.members = [
      member("task_a", "turn_1", true),
      member("task_b", "turn_1", false),
    ];
    state.projections.terminals = [
      projected("task_a", "turn_1", {
        status: "success",
        message: "first done",
      }),
    ];

    reconcileBackgroundTasks();

    expect(
      taskRecords("turn_1")
        .map((task) => task.taskId)
        .toSorted()
    ).toEqual(["task_a", "task_b"]);
    expect(cohortFor("turn_1")?.phase).toBe("awaiting_terminal");
    expect(reportableCohorts()).toEqual([]);
  });

  it("RG-02: once the sibling settles, the cohort owes exactly one report", () => {
    state.projections.members = [
      member("task_a", "turn_1", true),
      member("task_b", "turn_1", false),
    ];
    state.projections.terminals = [
      projected("task_a", "turn_1", { status: "success", message: "first" }),
    ];
    reconcileBackgroundTasks();
    expect(reportableCohorts()).toEqual([]);

    state.projections.members = [
      member("task_a", "turn_1", true),
      member("task_b", "turn_1", true),
    ];
    state.projections.terminals = [
      projected("task_a", "turn_1", { status: "success", message: "first" }),
      projected("task_b", "turn_1", { status: "success", message: "second" }),
    ];
    reconcileBackgroundTasks();

    expect(cohortFor("turn_1")?.phase).toBe("must_report");
    expect(reportableCohorts().map((cohort) => cohort.cohortId)).toEqual([
      "turn_1",
    ]);
  });

  it("RG-03: repeating reconciliation on an unchanged projection changes nothing", () => {
    state.projections.members = [member("task_a", "turn_1", true)];
    state.projections.terminals = [
      projected("task_a", "turn_1", { status: "success", message: "done" }),
    ];

    reconcileBackgroundTasks();
    const afterFirst = {
      tasks: taskRecords("turn_1"),
      cohort: cohortFor("turn_1"),
    };
    reconcileBackgroundTasks();
    reconcileBackgroundTasks();

    expect(taskRecords("turn_1")).toEqual(afterFirst.tasks);
    expect(cohortFor("turn_1")).toEqual(afterFirst.cohort);
  });

  it("RG-04: a worker's own result is only ever a worker_assertion here", () => {
    state.projections.members = [member("task_a", "turn_1", true)];
    state.projections.terminals = [
      projected("task_a", "turn_1", {
        status: "success",
        message: "submitted the form",
        images: [],
      }),
    ];

    reconcileBackgroundTasks();

    const facts =
      taskRecords("turn_1").find((task) => task.taskId === "task_a")?.terminal
        ?.facts ?? [];
    expect(facts).toEqual([
      { claim: "submitted the form", evidence: "worker_assertion" },
    ]);
  });

  it("RG-05: two parent turns stay independent", () => {
    state.projections.members = [
      member("task_a", "turn_1", true),
      member("task_b", "turn_2", false),
    ];
    state.projections.terminals = [
      projected("task_a", "turn_1", { status: "success", message: "one" }),
    ];

    reconcileBackgroundTasks();

    expect(cohortFor("turn_1")?.phase).toBe("must_report");
    expect(cohortFor("turn_2")?.phase).toBe("awaiting_terminal");
    expect(reportableCohorts().map((cohort) => cohort.cohortId)).toEqual([
      "turn_1",
    ]);
  });
});
