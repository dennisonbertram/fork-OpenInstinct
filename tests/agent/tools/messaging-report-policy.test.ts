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
import { deliveryToolChoiceForInteractiveTurn } from "@/agent/lib/delivery-guard";
import {
  admitTask,
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
async function tools() {
  const resolve = messaging.events["step.started"];
  if (!resolve) throw new Error("Missing resolver");
  const group = await resolve({ data: { turnId: "turn_1" } }, context);
  if (!group) throw new Error("Missing messaging tools");
  return group;
}
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

    await expect(
      Promise.resolve().then(() =>
        reaction.execute({ type: "thumbs_up" }, executorContext())
      )
    ).rejects.toThrow(/owed a written summary/);
  });

  it("RP-04a: a non-final message is rejected while a report is owed", async () => {
    policy.owed.mockReturnValue(true);
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
    const group = await tools();
    const text = "The upload finished; the log confirms it landed.";
    expect(
      group.send_message.execute(
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
