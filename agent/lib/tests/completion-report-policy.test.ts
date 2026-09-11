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
  recordTerminal,
  settleCohortReport,
} from "@/agent/lib/completion-obligations";
import { reportPartIdentityFor } from "@/agent/lib/completion-report-policy";

beforeEach(() => {
  for (const reset of state.resets) reset();
});

function owedCohort(turnId: string, taskId: string) {
  admitTask({
    objectiveRevision: `objective_of_${turnId}`,
    parentTurnId: turnId,
    taskId,
  });
  recordTerminal(
    {
      childSessionId: `${taskId}_session`,
      parentTurnId: turnId,
      status: "completed",
      taskId,
      workerName: "worker",
    },
    [{ claim: "The worker finished the upload.", evidence: "observed" }]
  );
}

const place = {
  rootSessionId: "root-session",
  workspaceId: "workspace-1",
};

describe("reportPartIdentityFor", () => {
  it("PI-01: names the cohort and revision the bound attempt belongs to", () => {
    owedCohort("turn_1", "task_a");
    beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" });

    expect(
      reportPartIdentityFor({
        ...place,
        callId: "call_1",
        part: "text",
        turnId: "turn_1",
      })
    ).toEqual({
      cohortId: "turn_1",
      part: "text",
      reportRevision: 0,
      rootSessionId: "root-session",
      workspaceId: "workspace-1",
    });
  });

  it("PI-02: an ordinary message that answers no obligation has no identity", () => {
    // Nothing is bound, so there is nothing to claim durably. A channel must
    // send this the way it always did rather than invent a report part for it.
    expect(
      reportPartIdentityFor({
        ...place,
        callId: "call_1",
        part: "text",
        turnId: "turn_1",
      })
    ).toBeUndefined();
  });

  it("PI-03: a different call in the same turn is not this attempt", () => {
    owedCohort("turn_1", "task_a");
    beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" });

    expect(
      reportPartIdentityFor({
        ...place,
        callId: "another-call",
        part: "text",
        turnId: "turn_1",
      })
    ).toBeUndefined();
  });

  it("PI-04: a later turn's attempt carries the later revision", () => {
    owedCohort("turn_1", "task_a");
    beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" });
    settleCohortReport("turn_1", false);
    beginCohortReport("turn_1", { callId: "call_2", turnId: "turn_2" });

    // The revision is what keeps this claim off the row of the attempt that may
    // already have reached the provider.
    expect(
      reportPartIdentityFor({
        ...place,
        callId: "call_2",
        part: "text",
        turnId: "turn_2",
      })?.reportRevision
    ).toBe(1);
  });

  it("PI-05: each physical effect of one report gets its own identity", () => {
    owedCohort("turn_1", "task_a");
    beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" });

    const parts = (["text", "media-upload:0", "media-send:0"] as const).map(
      (part) =>
        reportPartIdentityFor({
          ...place,
          callId: "call_1",
          part,
          turnId: "turn_1",
        })
    );

    // Same cohort and revision, different parts. Nothing else may differ, or
    // two effects of one report would land on unrelated durable rows.
    expect(parts.map((identity) => identity?.part)).toEqual([
      "text",
      "media-upload:0",
      "media-send:0",
    ]);
    expect(new Set(parts.map((identity) => identity?.cohortId)).size).toBe(1);
    expect(
      new Set(parts.map((identity) => identity?.reportRevision)).size
    ).toBe(1);
  });
});
