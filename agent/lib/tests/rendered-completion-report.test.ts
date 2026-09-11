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
import { completionCapacity } from "@/agent/lib/completion-obligations";
import { stripImageArtifactMarkdownReferences } from "@/agent/lib/browser-image-artifact/markdown";

function settle(
  taskId: string,
  turnId: string,
  facts: BoundedFact[],
  status: "completed" | "failed" | "cancelled" = "completed"
) {
  admitTask({
    objectiveRevision: `objective_of_${turnId}`,
    parentTurnId: turnId,
    taskId,
  });
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
    const report = completionReportText(["turn_1"]);

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
      ["turn_1"],
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
    const report = completionReportText(["turn_1"]) ?? "";

    const delivered = reportWithRecordedFacts(["turn_1"], report);

    expect(delivered).toBe(report);
  });

  it("RR-04: a worker's own word stays attributed when it is carried", () => {
    settle("task_a", "turn_1", [
      { claim: "I completed the purchase", evidence: "worker_assertion" },
    ]);

    const delivered = reportWithRecordedFacts(["turn_1"], "All done!");

    expect(delivered).toContain("I completed the purchase");
    expect(delivered).toMatch(/worker/iu);
  });

  it("RR-07: a fact of unknown provenance is not carried as the worker's word", () => {
    settle("task_a", "turn_1", [
      { claim: "Something happened on the page", evidence: "unknown" },
    ]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Done.");

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

    const delivered = reportWithRecordedFacts(["turn_empty"], "All sorted.");

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
    expect(
      reportWithRecordedFacts(["turn_never_admitted"], "Hello.")
    ).toContain("Hello.");
  });
});

describe("what an outside review found the renderer still hid", () => {
  it("RR-08: a failed task is reported as failed, not as its last checkpoint", () => {
    // The renderer read only terminal.facts and never the terminal's status, so
    // a failed task whose facts held an observed checkpoint rendered as
    // "Confirmed: Opened the form." with no failure anywhere in the message.
    settle(
      "task_a",
      "turn_1",
      [{ claim: "Opened the form", evidence: "observed" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(["turn_1"], "All done.");

    expect(delivered).toMatch(/failed|did not finish|unsuccessful/iu);
  });

  it("RR-09: a later task's failure is not squeezed out by earlier successes", () => {
    // Three facts was the whole budget, so a fourth task that failed vanished
    // and the cohort still settled as delivered.
    settle("task_1", "turn_1", [{ claim: "Step one", evidence: "observed" }]);
    settle("task_2", "turn_1", [{ claim: "Step two", evidence: "observed" }]);
    settle("task_3", "turn_1", [{ claim: "Step three", evidence: "observed" }]);
    settle(
      "task_4",
      "turn_1",
      [{ claim: "The checkout never loaded", evidence: "observed" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(["turn_1"], "Finished.");

    expect(delivered).toMatch(/failed|did not finish|unsuccessful/iu);
  });

  it("RR-10: a claim is not cut where its decisive qualification lives", () => {
    // A 165-character worker message that ends in the outcome. Cutting at 120
    // kept the preparation and dropped "The payment failed and no order was
    // placed", while the module's own docstring claimed faithful reproduction.
    // Longer than the per-claim cap on purpose, so it is actually shortened.
    const claim = `Filled in the delivery address, selected standard shipping, reviewed the basket, ${"checked each line item, ".repeat(
      12
    )}and submitted. The payment failed and no order was placed.`;
    settle("task_a", "turn_1", [{ claim, evidence: "observed" }]);

    const delivered = reportWithRecordedFacts(
      ["turn_1"],
      "Here is where it got to."
    );

    // Shortened from the middle, so the outcome at the end survives. A worker
    // puts the decision last; cutting the tail keeps the setup and loses it.
    expect(claim.length).toBeGreaterThan(240);
    expect(delivered).toContain("The payment failed and no order was placed");
  });

  it("RR-13: claims that did not fit are counted, not dropped in silence", () => {
    settle("task_a", "turn_1", [
      { claim: "One", evidence: "observed" },
      { claim: "Two", evidence: "observed" },
      { claim: "Three", evidence: "observed" },
      { claim: "Four", evidence: "observed" },
      { claim: "Five", evidence: "observed" },
    ]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Done.");

    // Saying how many were left out is what stops the shown list being read as
    // the whole of what the records hold.
    expect(delivered).toContain("2 further recorded claims are not shown");
  });

  it("RR-11: a report hidden in image markup is not treated as delivered", () => {
    // The channel strips artifact markdown before sending, so a report placed
    // inside an image reference reaches nobody. Substring inclusion in
    // model-controlled text is not proof the user will see it.
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);
    const report = completionReportText(["turn_1"]) ?? "";

    const delivered = reportWithRecordedFacts(
      ["turn_1"],
      `i'm checking now. ![${report}](/artifacts/00000000-0000-4000-8000-000000000000)`
    );

    const stripped = stripImageArtifactMarkdownReferences(delivered);
    expect(stripped).toContain("Submitted the order form");
  });

  it("RR-12: a message at the channel's limit stays deliverable", () => {
    // Input and channel output both cap text at 20,000 characters. Appending
    // pushed a valid message past it, the channel rejected the result before
    // sending, and the obligation had already been bound -- so nothing was sent
    // and the turn could send nothing else.
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    const delivered = reportWithRecordedFacts(["turn_1"], "x".repeat(20_000));

    expect(delivered.length).toBeLessThanOrEqual(20_000);
    expect(delivered).toContain("Submitted the order form");
  });
});

describe("the uncertainty the report has to carry", () => {
  it("RR-14: a dispatched action with no confirmation is stated as unknown", () => {
    // Plan 014 step 3: root synthesis must identify partial work, uncertainty
    // and the exact user action. recoveryProgress already decides all three and
    // had no caller, so the report listed facts and said nothing about what was
    // still unknown -- the single most important thing after a dispatch that
    // was never confirmed.
    settle(
      "task_a",
      "turn_1",
      [{ claim: "Dispatched the submission", evidence: "executor_receipt" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(
      ["turn_1"],
      "Here's where it got to."
    );

    expect(delivered).toMatch(/never confirmed|cannot establish|unknown/iu);
    // And never as a claim that it was undone.
    expect(delivered).not.toMatch(/rolled back|reversed|undone/iu);
  });

  it("RR-15: work that stopped short says so rather than implying nothing ran", () => {
    settle("task_a", "turn_1", [
      { claim: "Checked the first page", evidence: "observed" },
    ]);
    settle(
      "task_b",
      "turn_1",
      [{ claim: "The report page never loaded", evidence: "observed" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(["turn_1"], "Partly there.");

    expect(delivered).toMatch(
      /stopped before finishing|not the same as proof/iu
    );
  });

  it("RR-16: a corroborated completion carries no invented uncertainty", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Done.");

    // Nothing is unresolved here, and saying otherwise would be its own untruth.
    expect(delivered).not.toMatch(/never confirmed|stopped before finishing/iu);
  });
});

describe("what a second review found still wrong with shortening", () => {
  it("RR-17: a claim is never altered, because altering it can reverse it", () => {
    // Codex Astra's reproduction. Middle truncation removed exactly the middle
    // three characters of a 241-character claim, and a natural sentence with
    // "not" there became its own opposite -- "The order was not submitted"
    // rendered as "The order was … submitted", still labelled confirmed.
    const head = "a".repeat(119);
    const tail = "b".repeat(119);
    const claim = `${head}not${tail}`;
    settle("task_a", "turn_1", [{ claim, evidence: "observed" }]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Here it is.");

    // Either the claim appears exactly as recorded, or it does not appear at
    // all and is counted as omitted. A partial claim is the one thing that must
    // never happen, because a reader cannot tell it was shortened.
    const whole = delivered.includes(claim);
    const counted = /further recorded claims are not shown/u.test(delivered);
    expect(whole || counted).toBe(true);
    expect(delivered).not.toContain(`${head}…${tail}`);
  });

  it("RR-18: shortening never splits a character in half", () => {
    const claim = "😀".repeat(200);
    settle("task_a", "turn_1", [{ claim, evidence: "observed" }]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Done.");

    // Lone surrogates render as replacement symbols. Slicing UTF-16 code units
    // produces them whenever a cut lands inside a pair.
    expect(delivered.isWellFormed()).toBe(true);
  });

  it("RR-19: a failure is never the outcome that gets cut off", () => {
    // A report that outgrows the channel's limit was sliced from the end, so a
    // failure recorded last vanished while the successes stayed.
    for (let index = 0; index < 7; index += 1) {
      settle(`task_ok_${String(index)}`, "turn_1", [
        {
          claim: `${"padding ".repeat(400)}step ${String(index)}`,
          evidence: "observed",
        },
      ]);
    }
    settle(
      "task_late_failure",
      "turn_1",
      [{ claim: "The checkout never loaded", evidence: "observed" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(
      ["turn_1"],
      "Here is where it got to."
    );

    expect(delivered.length).toBeLessThanOrEqual(20_000);
    expect(delivered).toContain("task_late_failure");
    expect(delivered).toMatch(/failed/iu);
  });
});

describe("the rules that mutation showed were not actually pinned", () => {
  it("RR-20: a claim too long for the budget is omitted whole, never shortened", () => {
    // Over the claim budget on purpose. The earlier version of this case used a
    // 241-character claim, which fits, so nothing was ever omitted and a
    // mutation that shortened claims survived.
    const claim = `${"a".repeat(2500)}not${"b".repeat(2500)}`;
    settle("task_a", "turn_1", [{ claim, evidence: "observed" }]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Here it is.");

    expect(delivered).toContain("1 further recorded claims are not shown");
    // No fragment of it appears. A reader cannot tell a fragment was shortened,
    // and a fragment can say the opposite of what was recorded.
    expect(delivered).not.toContain("a".repeat(200));
  });

  it("RR-21: a task that did not complete is named before the ones that did", () => {
    settle("task_first_ok", "turn_1", [
      { claim: "Step one", evidence: "observed" },
    ]);
    settle(
      "task_late_fail",
      "turn_1",
      [{ claim: "The checkout never loaded", evidence: "observed" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(["turn_1"], "Here it is.");

    // Order is what keeps a failure safe from any length limit: bad news first
    // survives a cut, bad news last does not.
    expect(delivered.indexOf("task_late_fail")).toBeLessThan(
      delivered.indexOf("task_first_ok")
    );
  });

  it("RR-22: a model message that cannot fit is dropped whole, not cut", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);
    const written = `START-OF-MODEL-TEXT ${"x".repeat(20_000)}`;

    const delivered = reportWithRecordedFacts(["turn_1"], written);

    expect(delivered.length).toBeLessThanOrEqual(20_000);
    expect(delivered).toContain("Submitted the order form");
    // Dropped rather than cut, for the same reason a claim is: half a sentence
    // reads as a whole one.
    expect(delivered).not.toContain("START-OF-MODEL-TEXT");
  });
});

describe("one message answering several owed cohorts", () => {
  /** The largest backlog the records allow: capacity cohorts, each full. */
  function fullBacklog() {
    const ids: string[] = [];
    for (let cohort = 0; cohort < completionCapacity.openCohorts; cohort += 1) {
      const turnId = `turn_${String(cohort)}`;
      ids.push(turnId);
      for (let task = 0; task < completionCapacity.tasksPerCohort; task += 1) {
        settle(`task_${String(cohort)}_${String(task)}`, turnId, [
          {
            claim: `${"padding ".repeat(80)}cohort ${String(cohort)} task ${String(task)}`,
            evidence: "observed",
          },
        ]);
      }
    }
    return ids;
  }

  it("RR-23: the largest records the capacity permits still fit the channel", () => {
    // The worst case the state machine allows, built deliberately rather than
    // approximated: every cohort, every task, every fact, ids at the longest the
    // admission schema accepts, and claims large enough that any three overrun
    // the budget. An earlier version of this test used short ids and produced
    // 3,770 characters, so it passed with the budget check removed entirely and
    // proved nothing about the limit.
    //
    // Two separate ways this message went over 20,000: rendering each cohort
    // separately and joining them (35,462), and outcomes built from 150-character
    // ids (20,310 before a single claim). The channel rejects an oversized send
    // after the obligations are already bound, so the cohorts end up pending with
    // nothing delivered.
    const ids: string[] = [];
    for (let cohort = 0; cohort < completionCapacity.openCohorts; cohort += 1) {
      const turnId = `turn_${String(cohort)}_${"c".repeat(150)}`;
      ids.push(turnId);
      for (let task = 0; task < completionCapacity.tasksPerCohort; task += 1) {
        settle(
          `task_${String(cohort)}_${String(task)}_${"t".repeat(150)}`,
          turnId,
          Array.from(
            { length: completionCapacity.factsPerTask },
            (_unused, fact) => ({
              claim: longClaim(`cohort ${String(cohort)} fact ${String(fact)}`),
              evidence: "executor_receipt" as const,
            })
          ),
          "cancelled"
        );
      }
    }

    const delivered = reportWithRecordedFacts(
      ids,
      "Here is where things got to."
    );

    expect(delivered.length).toBeLessThanOrEqual(20_000);
    // And the outcomes, which are never dropped, are still all there.
    expect(delivered.match(/was cancelled/gu)?.length ?? 0).toBe(
      completionCapacity.openCohorts * completionCapacity.tasksPerCohort
    );
  });

  it("RR-24: no cohort is dropped to make the message fit", () => {
    // Appending cohort by cohort kept only the last four and discarded the
    // earlier reports as though they were expendable model text. An obligation
    // discharged by a message that never mentions it is worse than one left
    // owed.
    const ids = fullBacklog();

    const delivered = reportWithRecordedFacts(ids, "Done.");

    // Every task, not merely every cohort id: checking only that each cohort is
    // mentioned would pass while seven of its eight outcomes went missing.
    for (let cohort = 0; cohort < completionCapacity.openCohorts; cohort += 1) {
      expect(delivered).toContain(`turn_${String(cohort)}`);
      for (let task = 0; task < completionCapacity.tasksPerCohort; task += 1) {
        expect(delivered).toContain(
          `task_${String(cohort)}_${String(task)} finished`
        );
      }
    }
  });

  it("RR-25: a failure anywhere in the batch outranks every success", () => {
    settle("task_ok", "turn_early", [
      { claim: "Checked the first page", evidence: "observed" },
    ]);
    settle(
      "task_bad",
      "turn_late",
      [{ claim: "The checkout never loaded", evidence: "observed" }],
      "failed"
    );

    const delivered = reportWithRecordedFacts(
      ["turn_early", "turn_late"],
      "Here it is."
    );

    // Across the whole batch, not within each cohort: bad news last is bad news
    // a length limit can remove.
    expect(delivered.indexOf("task_bad")).toBeLessThan(
      delivered.indexOf("task_ok")
    );
  });

  it("RR-26: every outcome says which request it belongs to", () => {
    settle("task_one", "turn_first", [
      { claim: "Ordered the part", evidence: "observed" },
    ]);
    settle("task_two", "turn_second", [
      { claim: "Cancelled the other", evidence: "observed" },
    ]);

    const delivered = reportWithRecordedFacts(
      ["turn_first", "turn_second"],
      "Both done."
    );

    // The pairing, not the presence. Asserting that both ids appear somewhere
    // passes even if the two outcomes are attributed to each other's request,
    // which is exactly the confusion the tagging is meant to remove.
    expect(delivered).toContain("turn_first/task_one finished");
    expect(delivered).toContain("turn_second/task_two finished");
  });

  it("RR-27: an empty batch leaves the model's message alone", () => {
    expect(reportWithRecordedFacts([], "Sure, on it.")).toBe("Sure, on it.");
  });
});

/** A claim large enough that a few of them overrun the message budget. */
function longClaim(label: string) {
  return `${label}: ${"detail ".repeat(280)}`;
}

describe("the claim budget is spent once for the whole message", () => {
  it("RR-28: claims that are each small enough but too large together are counted, not crammed in", () => {
    // Three claims of 2,000 characters each pass any per-claim limit and still
    // overrun a 4,000-character budget together. A budget checked per claim
    // rather than against what has already been spent lets the message grow
    // with the number of requests, which is the failure this whole batch change
    // exists to prevent.
    settle("task_a", "turn_a", [
      { claim: longClaim("first"), evidence: "observed" },
    ]);
    settle("task_b", "turn_b", [
      { claim: longClaim("second"), evidence: "observed" },
    ]);
    settle("task_c", "turn_c", [
      { claim: longClaim("third"), evidence: "observed" },
    ]);

    const report = completionReportText(["turn_a", "turn_b", "turn_c"]);

    // Whatever did not fit is counted rather than silently absent, and the
    // claims section stays inside its budget.
    expect(report).toContain("further recorded claims are not shown here");
    expect(report?.length ?? 0).toBeLessThan(6_000);
  });
});

describe("what the channel would change on the way out", () => {
  it("RR-29: a claim the channel would rewrite is omitted and counted, never sent", () => {
    // The channel strips artifact image markdown before sending. Carrying this
    // claim whole would deliver "The order was  submitted" -- the opposite of
    // what was recorded, with nothing to tell the reader it changed.
    settle("task_a", "turn_a", [
      {
        claim:
          "The order was ![not](/artifacts/00000000-0000-4000-8000-000000000000) submitted",
        evidence: "observed",
      },
      { claim: "The cart held three items", evidence: "observed" },
    ]);

    const report = completionReportText(["turn_a"]) ?? "";

    expect(report).not.toContain("The order was");
    expect(report).toContain("The cart held three items");
    expect(report).toContain("1 further recorded claims are not shown here");
  });

  it("RR-30: an uncertain outcome says which request it belongs to", () => {
    // Two requests in one message, one of them holding an action that must not
    // be repeated. Untagged, the reader cannot tell which.
    settle("task_done", "turn_safe", [
      { claim: "The page was read", evidence: "observed" },
    ]);
    settle(
      "task_dispatched",
      "turn_risky",
      [{ claim: "Submitted the form", evidence: "worker_assertion" }],
      "failed"
    );

    const report = completionReportText(["turn_safe", "turn_risky"]) ?? "";

    // The sentence about an unconfirmed dispatch must arrive attached to the
    // request that holds it, not floating between two of them.
    expect(report).toContain(
      "turn_risky: Part of this objective stopped before finishing"
    );
    // And only that request carries it: the other one finished, so attaching the
    // same doubt to it would invent one the records do not support.
    expect(report).not.toContain("turn_safe: Part of this objective stopped");
  });
});
