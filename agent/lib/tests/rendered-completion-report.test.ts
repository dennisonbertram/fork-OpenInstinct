import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});

const policy = vi.hoisted(() => ({ forcing: vi.fn<() => boolean>() }));

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
  requestTurnCompletion: () => undefined,
}));

vi.mock("@/agent/lib/completion-report-activation", () => ({
  completionReportForcingActive: policy.forcing,
}));

import {
  admitTask,
  recordTerminal,
  type BoundedFact,
} from "@/agent/lib/completion-obligations";
import {
  completionReportText,
  reportWithRecordedFacts,
} from "@/agent/lib/completion-report-text";

function settle(taskId: string, turnId: string, facts: BoundedFact[]) {
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
      workerName: "browser",
    },
    facts
  );
}

beforeEach(() => {
  for (const reset of state.resets) reset();
  policy.forcing.mockReturnValue(true);
});

describe("the report the records can vouch for", () => {
  it("RR-01: is available whenever a summary is owed, not only when composition failed", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    // The earlier design produced this text only as a fallback after a failed
    // composition. That left the ordinary path with nothing the records vouch
    // for, which is how a progress note came to stand in for a summary.
    const report = completionReportText("turn_1");

    expect(report).toBeDefined();
    expect(report).toContain("Submitted the order form");
  });

  it("RR-02: a message that reports nothing does not carry the recorded facts", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    // The exact text that reached a real phone in production and was accepted
    // as a completion summary.
    const delivered = reportWithRecordedFacts(
      "turn_1",
      "i'm checking a public time source for Tokyo now."
    );

    expect(delivered).toBeDefined();
    expect(delivered).toContain("i'm checking a public time source for Tokyo");
    // The model keeps its own words, and the records are carried with them
    // rather than replaced by them.
    expect(delivered).toContain("Submitted the order form");
  });

  it("RR-03: a model that already reported the facts is not made to repeat them", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);
    const report = completionReportText("turn_1") ?? "";

    const delivered = reportWithRecordedFacts("turn_1", report);

    expect(delivered).toBe(report);
  });

  it("RR-04: a worker's own word stays attributed when it is carried", () => {
    settle("task_a", "turn_1", [
      { claim: "I completed the purchase", evidence: "worker_assertion" },
    ]);

    const delivered = reportWithRecordedFacts("turn_1", "All done!");

    expect(delivered).toContain("I completed the purchase");
    expect(delivered).toMatch(/worker/iu);
  });

  it("RR-07: a fact of unknown provenance is not carried as the worker's word", () => {
    settle("task_a", "turn_1", [
      { claim: "Something happened on the page", evidence: "unknown" },
    ]);

    const delivered = reportWithRecordedFacts("turn_1", "Done.");

    // Unknown provenance does not establish who said it. Naming a source this
    // does not know would invent one, which is the same mistake as inventing a
    // fact.
    expect(delivered).toContain("Something happened on the page");
    expect(delivered).toContain("no stated source");
    expect(delivered).not.toMatch(/worker[^.]*Something happened on the page/u);
  });

  it("RR-05: a cohort with no recorded facts says so rather than going quiet", () => {
    admitTask({
      objectiveRevision: "objective_of_turn_empty",
      parentTurnId: "turn_empty",
      taskId: "task_empty",
    });
    recordTerminal(
      {
        childSessionId: "task_empty_session",
        parentTurnId: "turn_empty",
        status: "completed",
        taskId: "task_empty",
        workerName: "browser",
      },
      []
    );

    const delivered = reportWithRecordedFacts("turn_empty", "All sorted.");

    expect(delivered).toContain("All sorted.");
    expect(delivered).toContain(
      "no recorded evidence of what the work achieved"
    );
  });

  it("RR-06: deciding whether a report is owed belongs to the caller, not here", () => {
    // This renders one cohort's records and nothing more. Whether a turn owes a
    // summary is the policy's question, and the executor asks it before calling
    // in -- so an ordinary turn never reaches this function at all. That call
    // site is pinned by RP-22 in the messaging suite.
    expect(reportWithRecordedFacts("turn_never_admitted", "Hello.")).toContain(
      "Hello."
    );
  });
});
