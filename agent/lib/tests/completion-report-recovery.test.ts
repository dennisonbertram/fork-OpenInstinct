import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompletionReportPartRecord } from "@/db/services/completion-report-attempts";
import { completionEvidenceContext } from "@/agent/lib/completion-evidence-context";

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});
const tasks = vi.hoisted(() => ({
  members: [
    {
      parentTurnId: "turn_old_a",
      settled: true,
      taskId: "task_old_a",
      workerName: "worker",
    },
    {
      parentTurnId: "turn_old_b",
      settled: true,
      taskId: "task_old_b",
      workerName: "worker",
    },
  ],
  terminals: [
    {
      childSessionId: "child_a",
      parentTurnId: "turn_old_a",
      status: "completed",
      taskId: "task_old_a",
      terminalTaskId: "task_old_a",
      workerName: "worker",
    },
    {
      childSessionId: "child_b",
      parentTurnId: "turn_old_b",
      status: "completed",
      taskId: "task_old_b",
      terminalTaskId: "task_old_b",
      workerName: "worker",
    },
  ],
}));
type RecoveryFinder = (input: {
  readonly cohortIds: readonly string[];
  readonly rootSessionId: string;
  readonly workspaceId: string;
}) => Promise<readonly CompletionReportPartRecord[]>;

const reports = vi.hoisted(() => ({ find: vi.fn<RecoveryFinder>() }));

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
  readBackgroundTaskMembers: () => tasks.members,
  readBackgroundTaskTerminals: () => tasks.terminals,
}));
vi.mock("@/db/services/completion-report-attempts", () => ({
  findCompletionReportPartsForCohorts: reports.find,
}));

import {
  admitTask,
  allCohorts,
  beginCohortReport,
  reconcileBackgroundTasks,
  recordTerminal,
  reportableCohorts,
} from "@/agent/lib/completion-obligations";

beforeEach(() => {
  for (const reset of state.resets) reset();
  tasks.members.splice(2);
  tasks.terminals.splice(2);
  reports.find.mockReset();
  reports.find.mockResolvedValue([
    {
      cohortId: "turn_old_a",
      part: "text",
      physicalPart: "text",
      reportRevision: 0,
      state: "accepted",
    },
  ]);
});

describe("recovery after a completion-state loss", () => {
  it("CR-01: keeps exact accepted history delivered and ambiguous reconstructed siblings unconfirmed", async () => {
    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(allCohorts()).toMatchObject([
      { cohortId: "turn_old_a", phase: "delivered" },
      { cohortId: "turn_old_b", phase: "unconfirmed" },
    ]);
    const context = completionEvidenceContext("turn_after_recovery") ?? "";
    expect(context).toContain(
      "Prior work whose delivery to the user has not been confirmed"
    );
    expect(context).not.toContain("was sent to the user");
    expect(reportableCohorts()).toEqual([]);
  });

  it("CR-02: preserves uncertainty when a newer report revision was not accepted", async () => {
    reports.find.mockResolvedValueOnce([
      {
        cohortId: "turn_old_a",
        part: "text",
        physicalPart: "text",
        reportRevision: 0,
        state: "accepted",
      },
      {
        cohortId: "turn_old_a",
        part: "text",
        physicalPart: "text",
        reportRevision: 1,
        state: "unconfirmed",
      },
    ]);

    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(
      allCohorts().find((cohort) => cohort.cohortId === "turn_old_a")
    ).toMatchObject({ phase: "unconfirmed" });
  });

  it("CR-03: preserves uncertainty when a report text was accepted but its media send was attempted", async () => {
    reports.find.mockResolvedValueOnce([
      {
        cohortId: "turn_old_a",
        part: "text",
        physicalPart: "text",
        reportRevision: 0,
        state: "accepted",
      },
      {
        cohortId: "turn_old_a",
        part: "media-send:0",
        physicalPart: "media-send:0",
        reportRevision: 0,
        state: "attempted",
      },
    ]);

    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(
      allCohorts().find((cohort) => cohort.cohortId === "turn_old_a")
    ).toMatchObject({ phase: "unconfirmed" });
  });

  it("CR-04: gives a user-directed report after recovered uncertainty a new revision", async () => {
    reports.find.mockResolvedValueOnce([
      {
        cohortId: "turn_old_a",
        part: "text",
        physicalPart: "text",
        reportRevision: 1,
        state: "unconfirmed",
      },
    ]);

    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(
      allCohorts().find((cohort) => cohort.cohortId === "turn_old_a")
    ).toMatchObject({ phase: "unconfirmed", reportRevision: 1 });
    expect(
      beginCohortReport("turn_old_a", {
        callId: "call_user_directed",
        turnId: "turn_user_directed",
      })
    ).toBe(true);
    expect(
      allCohorts().find((cohort) => cohort.cohortId === "turn_old_a")
    ).toMatchObject({ phase: "delivery_pending", reportRevision: 2 });
  });

  it("CR-05: requires a complete, consistent accepted bundle before crediting every member", async () => {
    reports.find.mockResolvedValueOnce([
      {
        bundleCount: 2,
        bundleId: "bundle",
        cohortId: "turn_old_a",
        part: "bundle/bundle/2/text",
        physicalPart: "text",
        reportRevision: 0,
        state: "accepted",
      },
      {
        bundleCount: 3,
        bundleId: "bundle",
        cohortId: "turn_old_b",
        part: "bundle/bundle/3/text",
        physicalPart: "text",
        reportRevision: 0,
        state: "accepted",
      },
    ]);

    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(allCohorts()).toMatchObject([
      { cohortId: "turn_old_a", phase: "unconfirmed" },
      { cohortId: "turn_old_b", phase: "unconfirmed" },
    ]);
  });

  it("CR-06: restores a complete accepted bundle only for its exact members", async () => {
    reports.find.mockResolvedValueOnce([
      {
        bundleCount: 2,
        bundleId: "bundle",
        cohortId: "turn_old_a",
        part: "bundle/bundle/2/text",
        physicalPart: "text",
        reportRevision: 0,
        state: "accepted",
      },
      {
        bundleCount: 2,
        bundleId: "bundle",
        cohortId: "turn_old_b",
        part: "bundle/bundle/2/text",
        physicalPart: "text",
        reportRevision: 0,
        state: "accepted",
      },
    ]);

    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(allCohorts()).toMatchObject([
      { cohortId: "turn_old_a", phase: "delivered" },
      { cohortId: "turn_old_b", phase: "delivered" },
    ]);
  });

  it("CR-07: leaves a first terminal owed when no historical report part exists", async () => {
    reports.find.mockResolvedValueOnce([]);
    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(reportableCohorts()).toHaveLength(2);
  });

  it("CR-08: leaves an initial task that has not terminated in its normal lifecycle", async () => {
    tasks.members.push({
      parentTurnId: "turn_pending",
      settled: false,
      taskId: "task_pending",
      workerName: "worker",
    });
    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });

    expect(
      allCohorts().find((cohort) => cohort.cohortId === "turn_pending")
    ).toMatchObject({ phase: "awaiting_terminal" });
  });

  it("CR-09: does not suppress a task admitted after initial recovery", async () => {
    await reconcileBackgroundTasks({
      rootSessionId: "root",
      workspaceId: "workspace",
    });
    admitTask({
      objectiveRevision: "turn_new",
      parentTurnId: "turn_new",
      taskId: "task_new",
    });
    recordTerminal(
      {
        childSessionId: "child_new",
        parentTurnId: "turn_new",
        status: "completed",
        taskId: "task_new",
        workerName: "worker",
      },
      []
    );

    expect(reportableCohorts()).toMatchObject([
      { cohortId: "turn_new", phase: "must_report" },
    ]);
  });
});
