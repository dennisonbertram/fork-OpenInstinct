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

/** cohortId and taskId in a shape nobody would mistake for a natural sentence. */
const rawIdPattern = /turn_\S|task_\S/u;

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
    expect(delivered).toMatch(/according to the worker/iu);
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
    expect(delivered).toContain("the source is unknown");
    expect(delivered).not.toMatch(
      /according to the worker[^.]*Something happened on the page/iu
    );
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

describe("no internal identifier ever reaches the rendered text", () => {
  it("RR-31: a single request's report names no cohort or task id", () => {
    settle("task_f13d217eb04bc1ab7c152c78", "turn_0", [
      {
        claim: 'Verified the exact page heading: "Example Domain"',
        evidence: "observed",
      },
    ]);

    const report = completionReportText(["turn_0"]) ?? "";

    expect(report).not.toMatch(rawIdPattern);
    expect(report).toContain(
      'Verified the exact page heading: "Example Domain"'
    );
  });

  it("RR-32: several requests are told apart by ordinal, never by id", () => {
    settle("task_one", "turn_first_request", [
      { claim: "Ordered the part", evidence: "observed" },
    ]);
    settle("task_two", "turn_second_request", [
      { claim: "Cancelled the other", evidence: "observed" },
    ]);

    const report =
      completionReportText(["turn_first_request", "turn_second_request"]) ?? "";

    expect(report).not.toMatch(rawIdPattern);
    expect(report).toMatch(/first request|second request/iu);
  });

  it("RR-33: the delivered message stays id-free even carried alongside the model's own text", () => {
    settle("task_a", "turn_1", [
      { claim: "Submitted the order form", evidence: "observed" },
    ]);

    const delivered = reportWithRecordedFacts(["turn_1"], "All done!");

    expect(delivered).not.toMatch(rawIdPattern);
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
    const counted = /further recorded claims? (is|are) not shown/u.test(
      delivered
    );
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
    // A batch of seven finished tasks and one late failure, all belonging to
    // the same request. Bad news must survive regardless of how much padding
    // the earlier claims carry, and it must be named before the successes.
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
    expect(delivered).toMatch(/failed/iu);
    // Bad news first: the failure is named before any of the successes are.
    expect(delivered.indexOf("failed")).toBeLessThan(
      delivered.indexOf("finished")
    );
  });
});

describe("the rules that mutation showed were not actually pinned", () => {
  it("RR-20: a claim too long for the budget is omitted whole, never shortened", () => {
    // Far larger than the whole report body's 900-character bound, so it can
    // never be shown whole and must be omitted rather than shortened.
    const claim = `${"a".repeat(2500)}not${"b".repeat(2500)}`;
    settle("task_a", "turn_1", [{ claim, evidence: "observed" }]);

    const delivered = reportWithRecordedFacts(["turn_1"], "Here it is.");

    expect(delivered).toContain("1 further recorded claim is not shown here");
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
    expect(delivered.indexOf("failed")).toBeLessThan(
      delivered.indexOf("finished")
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

describe("the automatic report body stays inside its 900-character bound", () => {
  /** The largest backlog the records allow: capacity cohorts, each full. */
  function fullBacklog(status: "completed" | "cancelled" = "completed") {
    const ids: string[] = [];
    for (let cohort = 0; cohort < completionCapacity.openCohorts; cohort += 1) {
      const turnId = `turn_${String(cohort)}`;
      ids.push(turnId);
      for (let task = 0; task < completionCapacity.tasksPerCohort; task += 1) {
        settle(
          `task_${String(cohort)}_${String(task)}`,
          turnId,
          [
            {
              claim: `${"padding ".repeat(80)}cohort ${String(cohort)} task ${String(task)}`,
              evidence:
                status === "cancelled" ? "executor_receipt" : "observed",
            },
          ],
          status
        );
      }
    }
    return ids;
  }

  it("RR-23: the largest records the capacity permits still fit the whole-body bound", () => {
    // The worst case the state machine allows: every cohort, every task, huge
    // claims. The old renderer produced 35,462 characters here by joining
    // per-cohort text, and 20,310 from ids alone before a single claim was
    // added. Aggregating by outcome rather than by id is what keeps this case
    // small: eight requests produce eight sentences, not sixty-four lines.
    const ids = fullBacklog("cancelled");

    const report = completionReportText(ids) ?? "";

    expect(report.length).toBeLessThanOrEqual(900);
    // The outcome is never dropped to make room: every request's cancellation
    // is still named.
    expect(
      report.match(/were cancelled|was cancelled/gu)?.length
    ).toBeGreaterThan(0);
    expect(report).not.toMatch(rawIdPattern);

    const delivered = reportWithRecordedFacts(
      ids,
      "Here is where things got to."
    );
    expect(delivered.length).toBeLessThanOrEqual(20_000);
  });

  it("RR-24: no request's outcome is dropped to make the message fit", () => {
    // Appending cohort by cohort used to keep only the last four and discard
    // the rest as though they were expendable model text. Now every request
    // contributes exactly one outcome sentence, so all eight must appear.
    const ids = fullBacklog("completed");

    const report = completionReportText(ids) ?? "";

    expect(report.length).toBeLessThanOrEqual(900);
    const finishedMentions = report.match(/tasks? finished/gu)?.length ?? 0;
    expect(finishedMentions).toBe(completionCapacity.openCohorts);
    expect(report).not.toMatch(rawIdPattern);
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

    // Across the whole batch, not within each request: bad news last is bad
    // news a length limit can remove.
    expect(delivered.indexOf("failed")).toBeLessThan(
      delivered.indexOf("finished")
    );
  });

  it("RR-26: each request's outcome tracks that request, not its position in the argument list", () => {
    // Three tasks all finish for one request, one task fails for the other, so
    // the two requests read differently and a pairing mistake is visible in the
    // text. The failing request must lead even though it is named second here.
    settle("task_a", "turn_first", [
      { claim: "Step one", evidence: "observed" },
    ]);
    settle("task_b", "turn_first", [
      { claim: "Step two", evidence: "observed" },
    ]);
    settle("task_c", "turn_first", [
      { claim: "Step three", evidence: "observed" },
    ]);
    settle(
      "task_bad",
      "turn_second",
      [{ claim: "The checkout never loaded", evidence: "observed" }],
      "failed"
    );

    const report = completionReportText(["turn_first", "turn_second"]) ?? "";

    // Named for when it was asked -- the failing one was the second request --
    // while still being placed first in the text so a limit cannot bury it.
    expect(report).toContain("The second request failed.");
    expect(report).toMatch(/first request: all 3 tasks finished/iu);
    expect(report.indexOf("failed")).toBeLessThan(report.indexOf("finished"));
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
    // Three claims of roughly 2,000 characters each pass any per-claim limit
    // and still overrun the whole report body's 900-character bound together.
    settle("task_a", "turn_a", [
      { claim: longClaim("first"), evidence: "observed" },
    ]);
    settle("task_b", "turn_b", [
      { claim: longClaim("second"), evidence: "observed" },
    ]);
    settle("task_c", "turn_c", [
      { claim: longClaim("third"), evidence: "observed" },
    ]);

    const report = completionReportText(["turn_a", "turn_b", "turn_c"]) ?? "";

    // Whatever did not fit is counted rather than silently absent, and the
    // whole report stays inside its bound.
    expect(report).toMatch(/further recorded claims? (is|are) not shown here/u);
    expect(report.length).toBeLessThanOrEqual(900);
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
    expect(report).toContain("1 further recorded claim is not shown here");
  });

  it("RR-30: an uncertain outcome names which request it belongs to, by ordinal, never by id", () => {
    // Two requests in one message, one of them holding an action that must not
    // be repeated. Untagged, the reader cannot tell which; tagged by id, the
    // reader learns nothing useful and something they should never see.
    settle("task_done", "turn_safe", [
      { claim: "The page was read", evidence: "observed" },
    ]);
    // An executor receipt on a task that did not complete is what makes the
    // disposition `uncertain_effect`. With a worker_assertion here the fixture
    // produced the generic stopped-before-finishing text instead, so this case
    // named the unconfirmed dispatch it was protecting but never created one.
    settle(
      "task_dispatched",
      "turn_risky",
      [{ claim: "Submitted the form", evidence: "executor_receipt" }],
      "failed"
    );

    const report = completionReportText(["turn_safe", "turn_risky"]) ?? "";

    // turn_risky is the only one with an unfinished task, so it leads the text.
    // It was asked second, so it is "the second request" -- the sentence about
    // the unconfirmed dispatch must attach to the request the user actually
    // made second, not to whichever one sorted first.
    expect(report).toContain(
      "For the second request: An action was dispatched and its outcome was never confirmed"
    );
    // And only once, not repeated for the request that finished cleanly.
    expect(
      report.match(
        /An action was dispatched and its outcome was never confirmed/gu
      )?.length
    ).toBe(1);
    expect(report).not.toMatch(rawIdPattern);
  });
});

describe("uncertainty shared by several requests is stated once", () => {
  it("RR-35: a request is numbered by when it was asked, not by where it sorts", () => {
    // Failures are shown first so a length limit cannot hide them, and requests
    // are named by ordinal now that ids are gone. Those two rules collided: the
    // ordinal was taken from the position AFTER the failure sort, so a request
    // the user made second was described to them as "the first request".
    //
    // The label reads as a plain fact about their own conversation, so getting
    // it wrong is not cosmetic -- it points the user at the wrong request. No
    // case caught this; it was found by printing what the message would say.
    settle("task_first", "turn_first", [
      { claim: "Ordered the part", evidence: "observed" },
    ]);
    settle(
      "task_second",
      "turn_second",
      [{ claim: "The checkout never loaded", evidence: "observed" }],
      "failed"
    );

    const report = completionReportText(["turn_first", "turn_second"]) ?? "";

    // Named for when it was asked...
    expect(report).toContain("The second request failed");
    expect(report).toContain("The first request finished");
    // ...while the failure still comes first in the text.
    expect(report.indexOf("failed")).toBeLessThan(report.indexOf("finished"));
  });

  it("RR-36: a mixed-status batch still fits the 900-character body", () => {
    // RR-23 cancels every task, which renders one short sentence per request. A
    // mixed batch renders three counts per request instead. An outside review
    // reproduced 948 characters against this 900 bound with the exact
    // (failed, cancelled, completed) split below: outcomes and uncertainty spent
    // the whole budget, then the claim-omission notice was appended anyway
    // because every claim had already been dropped.
    const splits: [number, number, number][] = [
      [1, 2, 5],
      [1, 7, 0],
      [4, 4, 0],
      [3, 5, 0],
      [2, 0, 6],
      [6, 1, 1],
      [0, 4, 4],
      [0, 2, 6],
    ];
    const ids = splits.map(([failed, cancelled, completed], cohort) => {
      const turnId = `turn_${String(cohort)}`;
      const statuses: ("completed" | "failed" | "cancelled")[] = [
        ...Array.from<"failed">({ length: failed }).fill("failed"),
        ...Array.from<"cancelled">({ length: cancelled }).fill("cancelled"),
        ...Array.from<"completed">({ length: completed }).fill("completed"),
      ];
      statuses.forEach((status, task) => {
        settle(
          `task_${String(cohort)}_${String(task)}`,
          turnId,
          [
            {
              claim: "x".repeat(2000),
              evidence:
                cohort === 2 || cohort === 7 ? "executor_receipt" : "observed",
            },
          ],
          status
        );
      });
      return turnId;
    });

    const report = completionReportText(ids) ?? "";

    expect(report.length).toBeLessThanOrEqual(900);
    // And the omission is still declared rather than dropped to make room.
    expect(report).toMatch(/not shown here/u);
  });

  it("RR-38: the verb agrees with the count in a mixed request", () => {
    // "6 tasks failed; 1 task were cancelled; 1 task finished" reached a real
    // message. Every assertion about this sentence checked which words appeared,
    // so none of them noticed it does not read as English. Found by printing the
    // message instead of the test output.
    settle(
      "task_f1",
      "turn_mixed",
      [{ claim: "First attempt", evidence: "observed" }],
      "failed"
    );
    settle(
      "task_c1",
      "turn_mixed",
      [{ claim: "Second attempt", evidence: "observed" }],
      "cancelled"
    );
    settle("task_d1", "turn_mixed", [
      { claim: "Third attempt", evidence: "observed" },
    ]);

    const report = completionReportText(["turn_mixed"]) ?? "";

    expect(report).toContain("1 task was cancelled");
    expect(report).not.toContain("1 task were cancelled");
    expect(report).toContain("1 task failed");
    expect(report).toContain("1 task finished");
  });

  it("RR-37: a request is numbered among every request, not among the reportable ones", () => {
    // The policy hands this function only the cohorts that are ready. If the
    // user's first request is still running, the second and third were being
    // called "the first request" and "the second request" -- a label that reads
    // as a plain fact about their own conversation and names the wrong one.
    admitTask({
      objectiveRevision: "turn_running",
      parentTurnId: "turn_running",
      taskId: "task_still_going",
    });
    settle("task_two", "turn_second", [
      { claim: "Ordered the part", evidence: "observed" },
    ]);
    settle("task_three", "turn_third", [
      { claim: "Cancelled the other", evidence: "observed" },
    ]);

    // Only the settled two are reportable, and they are requests two and three.
    const report = completionReportText(["turn_second", "turn_third"]) ?? "";

    expect(report).toContain("The second request");
    expect(report).toContain("The third request");
    expect(report).not.toContain("The first request");
  });

  it("RR-34: requests with the same unresolved disposition share one sentence", () => {
    // Two requests that both dispatched an action nothing corroborated. The
    // sentence describing that is fixed text from recoveryProgress -- it does
    // not vary with which request it is about -- so repeating it verbatim for
    // each request would just be the same sentence twice.
    settle(
      "task_one",
      "turn_one",
      [
        {
          claim: "Dispatched the first submission",
          evidence: "executor_receipt",
        },
      ],
      "failed"
    );
    settle(
      "task_two",
      "turn_two",
      [
        {
          claim: "Dispatched the second submission",
          evidence: "executor_receipt",
        },
      ],
      "failed"
    );

    const report = completionReportText(["turn_one", "turn_two"]) ?? "";

    expect(report.match(/was never confirmed/gu)?.length).toBe(1);
    expect(report).toMatch(/for all 2 requests/iu);
  });
});
