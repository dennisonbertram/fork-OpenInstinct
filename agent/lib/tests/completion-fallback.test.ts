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
import { completionFallbackText } from "@/agent/lib/completion-fallback";
import { recordUnconfirmedDelivery } from "@/agent/lib/message-delivery";

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

describe("the one bounded fallback when a summary could not be composed", () => {
  it("FB-01: says the summary could not be prepared and what is actually known", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    const text = completionFallbackText("turn_1");

    expect(text).toBeDefined();
    expect(text).toContain("could not");
    expect(text).toContain("Submitted the order form");
  });

  it("FB-02: there is exactly one fallback per obligation", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    expect(completionFallbackText("turn_1")).toBeDefined();
    // A second bounded fallback is a second message about the same failure.
    expect(completionFallbackText("turn_1")).toBeUndefined();
  });

  it("FB-03: once a request may have reached a provider there is no fallback", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);
    recordUnconfirmedDelivery("turn_1", "call_1");

    // The user may already have a message. Adding a fallback would be a second
    // one, and the fallback cannot know whether the first arrived.
    expect(completionFallbackText("turn_1")).toBeUndefined();
  });

  it("FB-04: with nothing corroborated it says so rather than inventing detail", () => {
    settle("task_a", "turn_1", []);

    const text = completionFallbackText("turn_1");

    expect(text).toBeDefined();
    expect(text).toContain("no");
    expect(text?.length).toBeLessThan(400);
  });

  it("FB-05: a worker's own word is not stated as a finding", () => {
    settle("task_a", "turn_1", [
      { claim: "Definitely completed the purchase", evidence: "worker_assertion" },
    ]);

    const text = completionFallbackText("turn_1");

    // The claim may appear, but never as something this session observed. An
    // uncorroborated claim reported flatly is how a worker's word becomes a
    // fact the user believes.
    expect(text).toBeDefined();
    if (text?.includes("Definitely completed the purchase")) {
      expect(text).toMatch(/reported|unverified|said|not confirmed/i);
    }
  });

  it("FB-06: the text is bounded however much evidence there is", () => {
    settle(
      "task_a",
      "turn_1",
      Array.from({ length: 8 }, (_, index) => ({
        claim: `Step ${String(index)} ${"x".repeat(500)}`,
        evidence: "observed" as const,
      }))
    );

    const text = completionFallbackText("turn_1");

    expect(text).toBeDefined();
    expect(text?.length).toBeLessThan(1200);
  });

  it("FB-07: a turn that owes nothing gets no fallback", () => {
    // Nothing settled, so there is no obligation and nothing to apologise for.
    expect(completionFallbackText("turn_1")).toBeUndefined();
  });

  it("FB-08: with enforcement off there is no fallback either", () => {
    policy.forcing.mockReturnValue(false);
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    expect(completionFallbackText("turn_1")).toBeUndefined();
  });
});
