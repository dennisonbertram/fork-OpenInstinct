import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamicResolveContext } from "eve/tools";
import { toolContextFor } from "@/tests/helpers/tool-context";
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
}));
import messaging from "@/agent/tools/messaging";
import { settleFinalDelivery } from "@/agent/lib/message-delivery";
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
  return resolve({ data: { stepIndex: 0, turnId: "turn_1" } }, context);
}
beforeEach(() => {
  for (const reset of state.resets) reset();
});
describe("final conversation delivery", () => {
  it("blocks another delivery from a retained tool after final and omits next-step tools", async () => {
    const group = await tools();
    if (!group) throw new Error("Missing messaging tools");
    const tool = group.send_message;
    const ctx = {
      ...toolContextFor({ sessionId: "root" }),
      session: { ...context.session, turn: { id: "turn_1", sequence: 1 } },
    };
    await tool.execute(
      { kind: "message", text: "Screenshot result", final: true },
      ctx
    );
    await expect(
      Promise.resolve().then(() =>
        tool.execute({ kind: "message", text: "Screenshot result again" }, ctx)
      )
    ).rejects.toThrow(/already.*final|final.*already/i);
    expect(
      await messaging.events["step.started"]?.(
        { data: { stepIndex: 0, turnId: "turn_1" } },
        context
      )
    ).toBeNull();
  });
  it("does not repeat an unconfirmed provider delivery in the same turn, then opens a new turn", async () => {
    const providerContext = {
      ...context,
      channel: { kind: "channel:sendblue" },
    } satisfies DynamicResolveContext;
    const resolve = messaging.events["step.started"];
    if (!resolve) throw new Error("Missing resolver");
    const group = await resolve(
      { data: { stepIndex: 0, turnId: "turn_1" } },
      providerContext
    );
    if (!group) throw new Error("Missing messaging tools");
    const ctx = {
      ...toolContextFor({ sessionId: "root" }),
      session: { ...context.session, turn: { id: "turn_1", sequence: 1 } },
    };

    await group.send_message.execute(
      { kind: "message", text: "Screenshot result", final: true },
      ctx
    );
    settleFinalDelivery("test-call", false);

    await expect(
      Promise.resolve().then(() =>
        group.send_message.execute(
          { kind: "message", text: "Screenshot result again" },
          ctx
        )
      )
    ).rejects.toThrow(/not confirmed|do not resend/i);
    expect(
      await resolve(
        { data: { stepIndex: 0, turnId: "turn_1" } },
        providerContext
      )
    ).toBeNull();
    const nextTurnTools = await resolve(
      { data: { stepIndex: 0, turnId: "turn_2" } },
      providerContext
    );
    if (!nextTurnTools) throw new Error("Missing next-turn messaging tools");
    expect(
      await nextTurnTools.send_message.execute(
        { kind: "message", text: "Next turn result" },
        {
          ...toolContextFor({ sessionId: "root" }),
          session: {
            ...context.session,
            turn: { id: "turn_2", sequence: 2 },
          },
        }
      )
    ).toEqual({ kind: "message", text: "Next turn result" });
  });
  it("allows progress and separate messages before final, then opens the next turn", async () => {
    const group = await tools();
    if (!group) throw new Error("Missing messaging tools");
    const ctx = {
      ...toolContextFor({ sessionId: "root" }),
      session: { ...context.session, turn: { id: "turn_1", sequence: 1 } },
    };
    await group.send_message.execute(
      { kind: "message", text: "Starting" },
      ctx
    );
    await group.send_message.execute(
      { kind: "message", text: "Question" },
      ctx
    );
    expect(
      await group.send_message.execute(
        { kind: "message", text: "Result", final: true },
        ctx
      )
    ).toEqual({ kind: "message", text: "Result" });
    expect(
      await messaging.events["step.started"]?.(
        { data: { stepIndex: 0, turnId: "turn_2" } },
        context
      )
    ).not.toBeNull();
  });
});

it("removes a legacy turn-scoped messaging registration before resolving the current step", async () => {
  const resolve = messaging.events["turn.started"];
  expect(resolve).toBeTypeOf("function");
  expect(
    await resolve?.({ data: { stepIndex: 0, turnId: "turn_legacy" } }, context)
  ).toBeNull();
});
