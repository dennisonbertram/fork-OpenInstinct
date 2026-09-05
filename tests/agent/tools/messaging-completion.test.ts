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
  return resolve({ data: { turnId: "turn_1" } }, context);
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
        { data: { turnId: "turn_1" } },
        context
      )
    ).toBeNull();
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
        { data: { turnId: "turn_2" } },
        context
      )
    ).not.toBeNull();
  });
});
