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
import type { completionReportForcingActive } from "@/agent/lib/completion-report-activation";
const context = {
  channel: { kind: "http" },
  session: {
    id: "root",
    auth: { current: null, initiator: null },
  },
  messages: [],
} satisfies DynamicResolveContext;
async function tools(
  resolveContext: DynamicResolveContext = context
) {
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
    expect(
      await group.send_message.execute(
        { kind: "message", text, final: true },
        executorContext()
      )
    ).toEqual({ kind: "message", text });
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
describe("forcing stays inactive in production", () => {
  it("a cohort that genuinely owes a report still does not activate forcing", async () => {
    const activation = await vi.importActual<{
      completionReportForcingActive: typeof completionReportForcingActive;
    }>("@/agent/lib/completion-report-activation");

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

    // Forcing is still off, so nothing a user sees changes yet. Plan 007 binds
    // settlement and Plan 009 supplies the evidence before this flips.
    expect(activation.completionReportForcingActive()).toBe(false);
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

    const group = await tools();
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

  it("RP-12: one send answers one cohort, and the other stays owed", async () => {
    policy.owed.mockReturnValue(true);
    owedCohort("turn_1", "task_a");
    owedCohort("turn_2", "task_b");

    const group = await tools();
    await group.send_message.execute(
      {
        final: true,
        kind: "message",
        text: "The first request finished; the log confirms it.",
      },
      executorContext()
    );

    // A written summary accounts for one cohort. The second is still owed, so
    // the obligation survives into the next turn rather than being absorbed.
    expect(cohortFor("turn_1")?.phase).toBe("delivery_pending");
    expect(reportableCohorts().map((cohort) => cohort.cohortId)).toEqual([
      "turn_2",
    ]);
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
