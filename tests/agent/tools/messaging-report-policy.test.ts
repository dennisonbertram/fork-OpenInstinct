import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { DynamicResolveContext } from "eve/tools";
import { toolContextFor } from "@/tests/helpers/tool-context";
const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});
const policy = vi.hoisted(() => ({ owed: vi.fn<() => boolean>() }));
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
}));
vi.mock("@/agent/lib/completion-report-activation", () => ({
  completionReportForcingActive: policy.owed,
}));
import messaging from "@/agent/tools/messaging";
import {
  beginFinalDelivery,
  recordUnconfirmedDelivery,
  settleFinalDelivery,
} from "@/agent/lib/message-delivery";
import { deliveryToolChoiceForInteractiveTurn } from "@/agent/lib/delivery-guard";
import {
  admitTask,
  cohortFor,
  recordTerminal,
  reportableCohorts,
} from "@/agent/lib/completion-obligations";
import {
  bindReportAttempt,
  reportPolicyForTurn,
} from "@/agent/lib/completion-report-policy";
import type { completionReportForcingActive } from "@/agent/lib/completion-report-activation";
/** The shape a message-kind send_message call returns. */
const deliveredMessageSchema = z.object({
  kind: z.literal("message"),
  text: z.string(),
});

const context = {
  channel: { kind: "http" },
  session: {
    id: "root",
    auth: { current: null, initiator: null },
  },
  messages: [],
} satisfies DynamicResolveContext;
async function tools(resolveContext: DynamicResolveContext = context) {
  const resolve = messaging.events["step.started"];
  if (!resolve) throw new Error("Missing resolver");
  const group = await resolve({ data: { turnId: "turn_1" } }, resolveContext);
  if (!group) throw new Error("Missing messaging tools");
  return group;
}

/**
 * A channel whose provider confirms separately, so submitting a message is not
 * the same event as the provider accepting it.
 */
const providerContext = {
  ...context,
  channel: { kind: "channel:linq" },
} satisfies DynamicResolveContext;
// The reaction tool's union input schema leaves its `execute` signature
// unresolvable to the type checker, so parse the resolved set the same way the
// channel delivery tests do to get a callable shape.
const dynamicToolSetSchema = z.record(
  z.string(),
  z
    .object({
      description: z.string(),
      execute: z
        .function()
        .input([z.unknown(), z.unknown()])
        .output(z.unknown()),
      inputSchema: z.unknown(),
    })
    .loose()
);
/** The reaction tool, or a clear failure when the resolver withheld it. */
async function reactionTool() {
  const parsed = dynamicToolSetSchema.parse(await tools());
  const reaction = parsed.react_to_message;
  if (!reaction) {
    throw new Error("react_to_message missing from the resolved tools");
  }
  return reaction;
}
function executorContext() {
  return {
    ...toolContextFor({ sessionId: "root" }),
    session: { ...context.session, turn: { id: "turn_1", sequence: 1 } },
  };
}
beforeEach(() => {
  for (const reset of state.resets) reset();
  policy.owed.mockReturnValue(false);
});

/** One cohort that has genuinely settled and therefore owes a written summary. */
function owedCohort(turnId: string, taskId: string) {
  admitTask({ objectiveRevision: turnId, parentTurnId: turnId, taskId });
  recordTerminal(
    {
      childSessionId: `${taskId}_session`,
      childTurnId: `${taskId}_turn`,
      parentTurnId: turnId,
      status: "completed",
      taskId,
      workerName: "worker",
    },
    [{ claim: "The worker finished the upload.", evidence: "observed" }]
  );
}
describe("delivery tool choice for an interactive turn", () => {
  it("RP-01: an owed report forces send_message on a linq turn with no delivery yet", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: undefined,
        reportOwed: true,
      })
    ).toEqual({ type: "tool", toolName: "send_message" });
  });
  it("RP-02: without an owed report the turn still requires a tool but names none", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: undefined,
        reportOwed: false,
      })
    ).toEqual({ type: "required" });
  });
  it("RP-08: an owed report does not override a settled delivery, a scheduled report, or a non-interactive channel", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: "completed",
        mode: undefined,
        reportOwed: true,
      })
    ).toBeUndefined();
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: "scheduled-report",
        reportOwed: true,
      })
    ).toBeUndefined();
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "http",
        deliveryStatus: undefined,
        mode: undefined,
        reportOwed: true,
      })
    ).toBeUndefined();
  });
});
describe("messaging tools while a completion report is owed", () => {
  it("RP-03: the resolver drops react_to_message but keeps send_message", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp03");
    const group = await tools();
    expect("react_to_message" in group).toBe(false);
    expect("send_message" in group).toBe(true);
  });
  it("RP-03b: a reaction called anyway while a report is owed throws and names the written summary", async () => {
    // Resolved while nothing was owed, so the reaction was legitimately
    // offered. The obligation arrives afterwards; the executor must check the
    // live state rather than what was true when the tool was built.
    const reaction = await reactionTool();
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp03b");

    await expect(
      Promise.resolve().then(() =>
        reaction.execute({ type: "thumbs_up" }, executorContext())
      )
    ).rejects.toThrow(/owed a written summary/);
  });

  it("RP-04a: a non-final message is rejected while a report is owed", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp04a");
    const group = await tools();
    await expect(
      Promise.resolve().then(() =>
        group.send_message.execute(
          { kind: "message", text: "Still working on it", final: false },
          executorContext()
        )
      )
    ).rejects.toThrow(/final: true/);
  });
  it("RP-04b: a standalone link is rejected while a report is owed", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp04b");
    const group = await tools();
    await expect(
      Promise.resolve().then(() =>
        group.send_message.execute(
          {
            kind: "link",
            url: "https://example.com/report",
            final: true,
          },
          executorContext()
        )
      )
    ).rejects.toThrow(/standalone link/);
  });
  it("RP-04c: an attachment with no text is rejected while a report is owed", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp04c");
    const group = await tools();
    await expect(
      Promise.resolve().then(() =>
        group.send_message.execute(
          {
            kind: "message",
            attachments: [
              { kind: "image", url: "https://example.com/shot.png" },
            ],
            final: true,
          },
          executorContext()
        )
      )
    ).rejects.toThrow(/needs text/);
  });
  it("RP-06: a final message with text satisfies the owed report and is delivered", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp06");
    const group = await tools();
    const text = "The upload finished; the log confirms it landed.";
    // Parsed rather than asserted: the executor returns the tool's union, and
    // this is the shape a message-kind call produces.
    const delivered = deliveredMessageSchema.parse(
      await group.send_message.execute(
        { kind: "message", text, final: true },
        executorContext()
      )
    );

    // The model's words are kept. What changed is that the records now travel
    // with them rather than depending on the model to carry them.
    expect(delivered.kind).toBe("message");
    expect(delivered.text).toContain(text);
    expect(delivered.text).toContain("The worker finished the upload.");
  });
  it("RP-07: with no report owed the reaction tool is still offered and succeeds", async () => {
    const group = await tools();
    expect("react_to_message" in group).toBe(true);
    const reaction = await reactionTool();
    await expect(
      Promise.resolve().then(() =>
        reaction.execute({ type: "thumbs_up" }, executorContext())
      )
    ).resolves.toEqual({ type: "thumbs_up" });
  });
});
/** The real activation function, not the mock the rest of this file uses. */
async function realActivation() {
  const activation = await vi.importActual<{
    completionReportForcingActive: typeof completionReportForcingActive;
  }>("@/agent/lib/completion-report-activation");
  return activation.completionReportForcingActive;
}

describe("forcing follows what is owed, and nothing else", () => {
  it("RP-31: a cohort that genuinely owes a report activates forcing", async () => {
    const forcingActive = await realActivation();

    expect(
      admitTask({
        taskId: "task_rp",
        parentTurnId: "turn_rp",
        objectiveRevision: "turn_rp",
      }).admitted
    ).toBe(true);
    const outcome = recordTerminal(
      {
        taskId: "task_rp",
        parentTurnId: "turn_rp",
        childSessionId: "child_session",
        childTurnId: "child_turn",
        workerName: "worker",
        status: "completed",
      },
      [{ claim: "The worker finished the upload.", evidence: "observed" }]
    );

    // The obligation is real: the cohort settled and owes a summary.
    expect(outcome.cohortBecameReportable).toBe(true);
    expect(reportableCohorts()).toHaveLength(1);
    expect(forcingActive()).toBe(true);
  });

  it("RP-32: forcing is off whenever nothing is owed, which is every ordinary turn", async () => {
    const forcingActive = await realActivation();

    // Nothing has settled, so there is no obligation and no reason to constrain
    // the turn. This is what "ordinary turns are unchanged" rests on, and it is
    // structural rather than a promise: activation is derived from the
    // obligation, so it cannot be on while nothing is owed.
    expect(reportableCohorts()).toEqual([]);
    expect(forcingActive()).toBe(false);

    // An admitted task that has not reported yet is not an obligation either --
    // there is nothing to summarise until it settles.
    admitTask({
      objectiveRevision: "turn_rp",
      parentTurnId: "turn_rp",
      taskId: "task_rp",
    });
    expect(forcingActive()).toBe(false);
  });

  it("RP-33: an ordinary turn running on the live activation is untouched", async () => {
    // The production function drives the whole path here, not a boolean handed to
    // the assertion. An earlier version of this case called `vi.importActual` and
    // then resolved tools through the mock, which `beforeEach` sets to false -- so
    // it passed no matter what the real activation did, and would have kept
    // passing with report enforcement removed entirely.
    policy.owed.mockImplementation(await realActivation());

    // Nothing has settled, so nothing is owed.
    const group = await tools(providerContext);

    // The three things a user would actually notice. A reaction is still offered.
    expect("react_to_message" in group).toBe(true);
    // The turn is not steered into send_message.
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: undefined,
        reportOwed: reportPolicyForTurn().kind === "must_report",
      })
    ).toEqual({ type: "required" });
    // And the message goes out exactly as written, with nothing appended.
    expect(
      await group.send_message.execute(
        { final: true, kind: "message", text: "Sure, on it." },
        executorContext()
      )
    ).toEqual({ kind: "message", text: "Sure, on it." });
  });

  it("RP-34: a turn with settled work behind it, on the live activation, carries the records", async () => {
    policy.owed.mockImplementation(await realActivation());
    owedCohort("turn_1", "task_a");

    const group = await tools(providerContext);

    // The reaction is withheld, because a reaction cannot report settled work.
    expect("react_to_message" in group).toBe(false);
    const delivered = deliveredMessageSchema.parse(
      await group.send_message.execute(
        { final: true, kind: "message", text: "Here you go." },
        executorContext()
      )
    );
    // And the records travel with the message, through the production activation
    // rather than a mock that was told to say yes.
    expect(delivered.text).toContain("Here you go.");
    // The report no longer names the cohort or task id -- see
    // completion-report-text.ts -- so what travels with the message is the
    // plain outcome and the worker's own claim instead.
    expect(delivered.text).toContain("Finished.");
    expect(delivered.text).toContain("The worker finished the upload.");
  });
});

describe("the policy follows what is actually owed, not only the switch", () => {
  it("RP-09: forcing with nothing owed leaves an ordinary turn alone", async () => {
    // The switch being on does not mean this turn owes anything. A session that
    // never started background work is an ordinary conversation, and taking the
    // reaction away from it would make every turn answer in sentences.
    policy.owed.mockReturnValue(true);

    const group = await tools();
    expect("react_to_message" in group).toBe(true);

    const reaction = await reactionTool();
    await expect(
      Promise.resolve().then(() =>
        reaction.execute({ type: "thumbs_up" }, executorContext())
      )
    ).resolves.toEqual({ type: "thumbs_up" });
  });

  it("RP-10: a settled cohort both removes the reaction and is bound by the send", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_a");

    // A provider channel, so the obligation is observable while acceptance is
    // still outstanding rather than settled the moment the tool returns.
    const group = await tools(providerContext);
    expect("react_to_message" in group).toBe(false);

    const text = "The upload finished; the log confirms it landed.";
    await group.send_message.execute(
      { final: true, kind: "message", text },
      executorContext()
    );

    // The obligation now names the exact attempt that owes it, so a later
    // channel result can settle this cohort and no other.
    const cohort = cohortFor("turn_1");
    expect(cohort?.phase).toBe("delivery_pending");
    expect(cohort?.report?.turnId).toBe("turn_1");
    expect(cohort?.report?.callId).toBe(executorContext().callId);
  });

  it("RP-11: a cohort still awaiting its terminal is not bound by a final message", async () => {
    // Work is running, so nothing is owed yet. A final message in this turn is
    // an ordinary answer, and binding it would record a summary of work that
    // has not reported. The earlier version of this case asserted a rejection
    // the per-turn delivery guard already produced, so it proved nothing.
    policy.owed.mockReturnValue(true);
    admitTask({
      objectiveRevision: "turn_1",
      parentTurnId: "turn_1",
      taskId: "task_running",
    });

    const group = await tools();
    await group.send_message.execute(
      { final: true, kind: "message", text: "Starting on that now." },
      executorContext()
    );

    expect(cohortFor("turn_1")?.phase).toBe("awaiting_terminal");
    expect(cohortFor("turn_1")?.report).toBeUndefined();
  });

  it("RP-13: a settled cohort changes nothing while enforcement is off", async () => {
    // The other half of RP-09. Both conditions have to hold, so a real
    // obligation with the switch off is still an ordinary turn, and nothing is
    // bound. This is what keeps the mechanism inert before activation.
    policy.owed.mockReturnValue(false);
    owedCohort("turn_1", "task_rp13");
    expect(reportableCohorts()).toHaveLength(1);

    const group = await tools();
    expect("react_to_message" in group).toBe(true);
    await group.send_message.execute(
      { final: true, kind: "message", text: "Done." },
      executorContext()
    );

    expect(cohortFor("turn_1")?.phase).toBe("must_report");
    expect(cohortFor("turn_1")?.report).toBeUndefined();
  });

  it("RP-12: one send answers every owed cohort, and carries all of their records", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_a");
    owedCohort("turn_2", "task_b");

    const group = await tools(providerContext);
    const delivered = deliveredMessageSchema.parse(
      await group.send_message.execute(
        {
          final: true,
          kind: "message",
          text: "The first request finished; the log confirms it.",
        },
        executorContext()
      )
    );

    // One message accounts for the whole backlog. Answering one cohort per turn
    // forced a summary on every turn until the backlog drained, which is how
    // turns 13 and 14 both came out as forced reports in the live session.
    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_2")?.phase).toBe("delivery_pending");
    expect(reportableCohorts()).toEqual([]);
    // And binding without reporting would be worse than leaving it owed, so the
    // message names both -- by ordinal, since the report no longer carries a
    // cohort or task id (see completion-report-text.ts).
    expect(delivered.text).toMatch(/first request/iu);
    expect(delivered.text).toMatch(/second request/iu);
    expect(
      delivered.text.match(/The worker finished the upload\./gu)?.length
    ).toBe(2);
  });
});

describe("the message that reached a real phone", () => {
  it("RP-21: the exact production progress note cannot be delivered without the records", async () => {
    // 2026-09-11, session wrun_41M270VCEE0GJ0MK899TKWFBHN turn_13. A summary was
    // owed. The model's first send was rejected for not being final; its second
    // set final: true on this text and was accepted, so it stood in for the
    // completion report. It reports nothing about the settled work, and it
    // describes work that was never started -- no worker ran in that turn.
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_prod");

    const group = await tools(providerContext);
    const delivered = await group.send_message.execute(
      {
        final: true,
        kind: "message",
        text: "i'm checking a public time source for Tokyo now.",
      },
      executorContext()
    );

    const { text } = deliveredMessageSchema.parse(delivered);
    // The model keeps its words. What it no longer decides is whether the
    // records reach the user.
    expect(text).toContain("i'm checking a public time source for Tokyo");
    expect(text).toContain("The worker finished the upload.");
  });

  it("RP-22: an ordinary turn's message is delivered exactly as the model wrote it", async () => {
    policy.owed.mockReturnValue(true);
    // Nothing settled, so nothing is owed and nothing is added.
    const group = await tools(providerContext);

    const delivered = await group.send_message.execute(
      { final: true, kind: "message", text: "Sure, on it." },
      executorContext()
    );

    expect(delivered).toEqual({ kind: "message", text: "Sure, on it." });
  });
});

describe("settling the report the channel actually carried", () => {
  async function bindOneReport(taskId: string) {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", taskId);
    const group = await tools(providerContext);
    await group.send_message.execute(
      {
        final: true,
        kind: "message",
        text: "The upload finished; the log confirms it landed.",
      },
      executorContext()
    );
    return executorContext().callId;
  }

  it("RP-14: provider acceptance settles the bound cohort as delivered", async () => {
    const callId = await bindOneReport("task_rp14");
    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");

    settleFinalDelivery(callId, true);

    expect(cohortFor("turn_1")?.phase).toBe("delivered");
    expect(reportableCohorts()).toEqual([]);
  });

  it("RP-15: a provider that never confirmed leaves the report unconfirmed", async () => {
    const callId = await bindOneReport("task_rp15");

    recordUnconfirmedDelivery("turn_1", callId);
    settleFinalDelivery(callId, false);

    // The send may have landed, so this is not a failure and not a success.
    // Nothing may resend it, which is why the cohort does not go back to owed.
    expect(cohortFor("turn_1")?.phase).toBe("unconfirmed");
    expect(reportableCohorts()).toEqual([]);
  });

  it("RP-16: a result for a different call cannot settle this report", async () => {
    await bindOneReport("task_rp16");

    settleFinalDelivery("some-other-call", true);

    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");
  });

  it("RP-17: a channel with no separate acceptance settles at submission", async () => {
    // Web chat has no provider step to wait for, so the delivery state is
    // already complete when the tool returns. Leaving the cohort pending here
    // would leave an obligation nothing can ever settle.
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_rp17");
    const group = await tools();
    await group.send_message.execute(
      { final: true, kind: "message", text: "Finished; the log confirms it." },
      executorContext()
    );

    expect(cohortFor("turn_1")?.phase).toBe("delivered");
  });
});

describe("an obligation cannot be stranded by the delivery record", () => {
  async function bindOneReport(taskId: string) {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", taskId);
    const group = await tools(providerContext);
    await group.send_message.execute(
      {
        final: true,
        kind: "message",
        text: "The upload finished; the log confirms it landed.",
      },
      executorContext()
    );
    return executorContext().callId;
  }

  it("RP-18: a late provider result still settles its own obligation", async () => {
    const callId = await bindOneReport("task_rp18");
    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");

    // A later turn starts its own delivery, which replaces the single tracked
    // record. The first turn's provider result then arrives.
    beginFinalDelivery("turn_2", "a-later-call", true);

    settleFinalDelivery(callId, true);

    // Before this fix the result found no matching delivery record and did
    // nothing, leaving the obligation delivery_pending for the rest of the
    // session: not delivered, not owed, and invisible to reportableCohorts.
    expect(cohortFor("turn_1")?.phase).toBe("delivered");
  });

  it("RP-19: an unconfirmed provider attempt settles the obligation on its own", async () => {
    const callId = await bindOneReport("task_rp19");

    // Recorded without a following settle. Both channels do follow it with one
    // today, but an obligation that depends on a caller remembering a second
    // call is one a caller can strand.
    recordUnconfirmedDelivery("turn_1", callId);

    expect(cohortFor("turn_1")?.phase).toBe("unconfirmed");
  });

  it("RP-20: a result for a call that owes nothing still settles nothing", async () => {
    await bindOneReport("task_rp20");

    settleFinalDelivery("a-call-that-holds-no-obligation", true);

    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");
  });
});

describe("a backlog is answered once, not once per turn", () => {
  it("RP-23: one report covers every cohort that is owed", async () => {
    // Observed live: turns 13 and 14 both owed a summary, because each turn
    // discharged one cohort and the rest stayed owed. A session with settled
    // work behind it was forced to answer in sentences on every turn until the
    // backlog drained. One message about everything that settled is what a
    // person wants, and it is also the only option that reports all of it.
    policy.owed.mockReturnValue(true);
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");
    owedCohort("turn_c", "task_c");

    const group = await tools(providerContext);
    await group.send_message.execute(
      { final: true, kind: "message", text: "Here is where things got to." },
      executorContext()
    );

    // Every owed cohort is bound to this one attempt.
    expect(cohortFor("turn_a")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_b")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_c")?.phase).toBe("delivery_pending");
    expect(reportableCohorts()).toEqual([]);
  });

  it("RP-24: the message carries every owed cohort's records, not just the first", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");

    const group = await tools(providerContext);
    const delivered = deliveredMessageSchema.parse(
      await group.send_message.execute(
        { final: true, kind: "message", text: "Done." },
        executorContext()
      )
    );

    // Binding a cohort without reporting it would be worse than leaving it
    // owed: the obligation would be discharged by a message that never
    // mentioned it. Named by ordinal now, since the report no longer carries a
    // cohort or task id (see completion-report-text.ts).
    expect(delivered.text).toMatch(/first request/iu);
    expect(delivered.text).toMatch(/second request/iu);
    expect(
      delivered.text.match(/The worker finished the upload\./gu)?.length
    ).toBe(2);
  });

  it("RP-25: settling that one attempt settles every cohort it bound", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");

    const group = await tools(providerContext);
    await group.send_message.execute(
      { final: true, kind: "message", text: "Done." },
      executorContext()
    );
    settleFinalDelivery(executorContext().callId, true);

    // Otherwise the backlog is bound but never cleared, which is the worst of
    // the three states: not delivered, not owed, invisible.
    expect(cohortFor("turn_a")?.phase).toBe("delivered");
    expect(cohortFor("turn_b")?.phase).toBe("delivered");
  });

  it("RP-26: a provider that never confirmed leaves every bound cohort unconfirmed", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");

    const group = await tools(providerContext);
    await group.send_message.execute(
      { final: true, kind: "message", text: "Done." },
      executorContext()
    );
    settleFinalDelivery(executorContext().callId, false);

    expect(cohortFor("turn_a")?.phase).toBe("unconfirmed");
    expect(cohortFor("turn_b")?.phase).toBe("unconfirmed");
    // And none of them goes back to owed: the send may have landed.
    expect(reportableCohorts()).toEqual([]);
  });
});

describe("binding the whole backlog, or none of it", () => {
  it("RP-27: a cohort that refuses leaves none of the others bound", () => {
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");
    // Another call in this turn already holds turn_b.
    expect(
      bindReportAttempt({
        callId: "other-call",
        cohortIds: ["turn_b"],
        turnId: "turn_1",
      })
    ).toEqual(["turn_b"]);

    const bound = bindReportAttempt({
      callId: "test-call",
      cohortIds: ["turn_a", "turn_b"],
      turnId: "turn_1",
    });

    // Nothing taken, and said so. A partial bind would leave turn_a discharged
    // by a message this call is about to refuse to send -- settled work with no
    // report and no obligation left to produce one.
    expect(bound).toEqual([]);
    expect(cohortFor("turn_a")?.phase).toBe("must_report");
    expect(cohortFor("turn_a")?.report).toBeUndefined();
    expect(reportableCohorts().map((cohort) => cohort.cohortId)).toEqual([
      "turn_a",
    ]);
  });

  it("RP-28: releasing what it took does not disturb the cohort another call holds", () => {
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");
    bindReportAttempt({
      callId: "other-call",
      cohortIds: ["turn_b"],
      turnId: "turn_1",
    });

    bindReportAttempt({
      callId: "test-call",
      cohortIds: ["turn_a", "turn_b"],
      turnId: "turn_1",
    });

    // The other call's attempt is still live and still its own: releasing a
    // partial bind must not hand it someone else's obligation or reopen one
    // that is already being delivered.
    expect(cohortFor("turn_b")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_b")?.report?.callId).toBe("other-call");
  });
});

describe("a refused bind writes nothing at all", () => {
  it("RP-29: a cohort this same call already holds keeps the binding it has", () => {
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");
    // This call already holds turn_a from an earlier bind in the same turn.
    expect(
      bindReportAttempt({
        callId: "test-call",
        cohortIds: ["turn_a"],
        turnId: "turn_1",
      })
    ).toEqual(["turn_a"]);
    // And another call holds turn_b.
    bindReportAttempt({
      callId: "other-call",
      cohortIds: ["turn_b"],
      turnId: "turn_1",
    });

    expect(
      bindReportAttempt({
        callId: "test-call",
        cohortIds: ["turn_a", "turn_b"],
        turnId: "turn_1",
      })
    ).toEqual([]);

    // turn_a accepts a re-announcement from its own call without changing, so
    // there is nothing to undo. An earlier version undid it anyway by setting it
    // back to owing a report, which left this call's live attempt unable to
    // settle the cohort it was delivering.
    expect(cohortFor("turn_a")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_a")?.report?.callId).toBe("test-call");
  });

  it("RP-30: a cohort bound out of an unconfirmed send is not rewritten to owing one", () => {
    owedCohort("turn_a", "task_a");
    owedCohort("turn_b", "task_b");
    // turn_a's earlier send was never confirmed by the provider.
    bindReportAttempt({
      callId: "earlier-call",
      cohortIds: ["turn_a"],
      turnId: "turn_0",
    });
    settleFinalDelivery("earlier-call", false);
    expect(cohortFor("turn_a")?.phase).toBe("unconfirmed");
    // And turn_b is held by someone else, so this bind must fail.
    bindReportAttempt({
      callId: "other-call",
      cohortIds: ["turn_b"],
      turnId: "turn_1",
    });

    expect(
      bindReportAttempt({
        callId: "test-call",
        cohortIds: ["turn_a", "turn_b"],
        turnId: "turn_1",
      })
    ).toEqual([]);

    // Still unconfirmed, with its earlier attempt intact. "Put it back to owing
    // a report" would be a phase it was never in, and would lose the record that
    // a send may already have reached the user.
    expect(cohortFor("turn_a")?.phase).toBe("unconfirmed");
    expect(cohortFor("turn_a")?.report?.callId).toBe("earlier-call");
  });
});
