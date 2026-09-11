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
  beginCohortReport,
  recordTerminal,
  settleCohortReport,
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

  it("FB-02: composing the text twice without sending it is not a duplicate", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    // Composing is not sending. An earlier version consumed the one allowance
    // here, so a caller that composed and then abandoned delivery left settled
    // work with no report at all and no way to produce one.
    const first = completionFallbackText("turn_1");
    expect(first).toBeDefined();
    expect(completionFallbackText("turn_1")).toBe(first);
  });

  it("FB-09: once the fallback has been delivered, there is no second one", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);
    expect(completionFallbackText("turn_1")).toBeDefined();

    // Delivering it settles the obligation through the ordinary path, and a
    // settled obligation owes nothing. That is what stops a second message,
    // rather than a separate counter that can be spent without sending.
    beginCohortReport("turn_1", { callId: "call_1", turnId: "turn_1" });
    settleCohortReport("turn_1", true);

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

  it("FB-04: with no evidence at all it says that, rather than inventing detail", () => {
    settle("task_a", "turn_1", []);

    const text = completionFallbackText("turn_1");

    expect(text).toBeDefined();
    // Asserted as a whole sentence. An earlier version of this case looked for
    // "no", which the word "not" in the first line satisfies, so it passed even
    // when the absence of evidence went unmentioned.
    expect(text).toContain("no recorded evidence of what the work achieved");
  });

  it("FB-05: a worker's own word is not stated as a finding", () => {
    settle("task_a", "turn_1", [
      {
        claim: "Definitely completed the purchase",
        evidence: "worker_assertion",
      },
    ]);

    const text = completionFallbackText("turn_1");

    // The claim may appear, but never as something this session observed. An
    // uncorroborated claim reported flatly is how a worker's word becomes a
    // fact the user believes. So the attribution is asserted as adjacent to the
    // claim, not merely present somewhere in the message.
    expect(text).toContain(
      "Definitely completed the purchase (reported by the worker, not confirmed)"
    );
    expect(text).not.toContain("Confirmed: Definitely completed the purchase");
  });

  it("FB-06: the text is bounded in both length and number of facts", () => {
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
    // Claims are carried whole now -- shortening one can reverse it -- so the
    // bound is on how many are named, with the rest counted rather than cut.
    const named = (text?.match(/Step \d/g) ?? []).length;
    expect(named).toBe(3);
    expect(text).toContain("further recorded claims are not shown");
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

describe("what the fallback may and may not assert", () => {
  it("FB-10: a fact of unknown provenance is not attributed to the worker", () => {
    settle("task_a", "turn_1", [
      { claim: "Something happened on the page", evidence: "unknown" },
    ]);

    const text = completionFallbackText("turn_1");

    // Unknown provenance does not establish that a worker reported it. Saying
    // so would invent a source, which is the same mistake as inventing a fact.
    expect(text).toContain("Something happened on the page");
    expect(text).not.toMatch(
      /worker[^.]*Something happened|Reported by the worker[^.]*Something happened/u
    );
  });

  it("FB-11: a worker's own claim is still attributed to the worker", () => {
    settle("task_a", "turn_1", [
      { claim: "I completed the purchase", evidence: "worker_assertion" },
    ]);

    expect(completionFallbackText("turn_1")).toContain(
      "I completed the purchase (reported by the worker, not confirmed)"
    );
  });

  it("FB-12: nothing is claimed about whether anything was retried", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    const text = completionFallbackText("turn_1");

    // Nothing here inspects whether the composition or the work was retried, so
    // saying "I have not tried again" asserted a history no record establishes.
    expect(text).not.toMatch(/tried again|retried|no retry/iu);
    // What is established is that this is not a success claim.
    expect(text).toMatch(/not.*claim.*succeed/iu);
  });

  it("FB-13: the fact budget is shared, not one allowance per section", () => {
    settle("task_a", "turn_1", [
      { claim: "Confirmed one", evidence: "observed" },
      { claim: "Confirmed two", evidence: "observed" },
      { claim: "Confirmed three", evidence: "observed" },
      { claim: "Asserted one", evidence: "worker_assertion" },
      { claim: "Asserted two", evidence: "worker_assertion" },
      { claim: "Asserted three", evidence: "worker_assertion" },
    ]);

    const text = completionFallbackText("turn_1") ?? "";

    // Three each is six, which is twice the declared ceiling. The budget is one
    // number for the whole message.
    const named = (text.match(/Confirmed \w+|Asserted \w+/gu) ?? []).length;
    expect(named).toBeLessThanOrEqual(3);
  });
});
