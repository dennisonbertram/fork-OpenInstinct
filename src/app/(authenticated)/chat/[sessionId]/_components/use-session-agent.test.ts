/* oxlint-disable vitest/require-mock-type-parameters, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, typescript/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion, typescript/no-invalid-void-type, eslint/no-unmodified-loop-condition, eslint/no-await-in-loop, react-hooks/rules-of-hooks, anti-slop/no-runtime-typeof, typescript/no-unsafe-call, typescript/unbound-method -- This controlled hook harness executes effects and records state without a DOM; the client stream is the boundary under test. */
import type { MessageStreamEvent } from "eve/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  states: [] as unknown[],
  attach: vi.fn(),
  readHistory: vi.fn(),
  stream: vi.fn(),
  send: vi.fn(),
  respond: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = mocks.states.length;
    mocks.states.push(initial);
    return [
      initial,
      (update: unknown) => {
        mocks.states[index] =
          typeof update === "function" ? update(mocks.states[index]) : update;
      },
    ];
  },
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => {
    mocks.effects.push(effect);
  },
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("eve/client", () => ({
  Client: class {
    sessions = { attach: mocks.attach };
  },
  isCurrentTurnBoundaryEvent: (streamEvent: MessageStreamEvent) =>
    ["session.waiting", "session.completed", "session.failed"].includes(
      streamEvent.type
    ),
  defaultMessageReducer: () => ({
    initial: () => ({ messages: [] }),
    reduce: (state: unknown) => state,
  }),
}));
vi.mock("../_lib/session-history", () => ({
  readLatestSessionHistory: mocks.readHistory,
  readOlderSessionHistory: vi.fn(),
}));
import { useSessionAgent } from "./use-session-agent";

function event(type: string, id: string): MessageStreamEvent {
  return {
    type,
    data: {},
    meta: { id, at: "2026-09-05T13:00:00Z" },
  } as MessageStreamEvent;
}
function controlledStream() {
  const queue: MessageStreamEvent[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let failure: Error | undefined;
  return {
    push(value: MessageStreamEvent) {
      queue.push(value);
      wake?.();
    },
    fail(cause: Error) {
      failure = cause;
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *iterate({ signal }: { signal?: AbortSignal } = {}) {
      signal?.addEventListener(
        "abort",
        () => {
          closed = true;
          wake?.();
        },
        { once: true }
      );
      while (!closed) {
        if (failure) throw failure;
        const next = queue.shift();
        if (next) yield next;
        else
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
      }
    },
  };
}
async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}
function mount() {
  const agent = useSessionAgent("root");
  const cleanups = mocks.effects.map((effect) => effect());
  return {
    agent,
    reconnectEffect: () => {
      const index = mocks.effects.length - 1;
      cleanups[index]?.();
      cleanups[index] = mocks.effects[index]?.();
    },
    unmount: () => {
      cleanups.forEach((cleanup) => cleanup?.());
    },
  };
}
function history() {
  return mocks.states[0] as { events: MessageStreamEvent[]; endIndex: number };
}

describe("mounted session observer", () => {
  beforeEach(() => {
    mocks.effects = [];
    mocks.states = [];
    vi.clearAllMocks();
    mocks.readHistory.mockResolvedValue({
      events: [event("session.waiting", "idle")],
      startIndex: 0,
      endIndex: 1,
    });
    mocks.attach.mockReturnValue({
      stream: mocks.stream,
      send: mocks.send,
      respond: mocks.respond,
    });
    mocks.send.mockResolvedValue({});
    mocks.respond.mockResolvedValue({});
  });
  it("receives a delayed parent turn after waiting without refresh", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { unmount } = mount();
    await flush();
    stream.push(event("turn.started", "later-turn"));
    stream.push(event("session.waiting", "later-done"));
    await flush();
    expect(history().events.map((item) => item.meta.id)).toEqual([
      "idle",
      "later-turn",
      "later-done",
    ]);
    unmount();
  });
  it("allows approval responses while the observer remains connected and records each event once", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    const response = agent.respond([
      { requestId: "child-approval", optionId: "approve" },
    ]);
    await flush();
    expect(mocks.respond).toHaveBeenCalledWith(
      [{ requestId: "child-approval", optionId: "approve" }],
      expect.anything()
    );
    stream.push(event("turn.started", "approved"));
    stream.push(event("turn.started", "approved"));
    stream.push(event("session.waiting", "approved-done"));
    await flush();
    await response;
    expect(history().endIndex).toBe(3);
    expect(history().events).toHaveLength(3);
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    const send = agent.send("Next task");
    await flush();
    expect(mocks.send).toHaveBeenCalledWith("Next task", expect.anything());
    stream.push(event("session.waiting", "next-done"));
    await flush();
    await send;
    unmount();
  });
  it("allows steering an active turn without another observer", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    const first = agent.send("Original task");
    await flush();
    const steer = agent.send("Correction", { turnPolicy: "steer" });
    await flush();
    expect(mocks.send).toHaveBeenCalledWith("Correction", {
      turnPolicy: "steer",
    });
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    stream.push(event("session.waiting", "steered-done"));
    await flush();
    await Promise.all([first, steer]);
    unmount();
  });
  it("releases a failed approval request for a retry", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    mocks.respond.mockRejectedValueOnce(new Error("Temporary request failure"));
    await expect(
      agent.respond([{ requestId: "approval", optionId: "approve" }])
    ).rejects.toThrow("Temporary request failure");
    const retry = agent.respond([
      { requestId: "approval", optionId: "approve" },
    ]);
    await flush();
    expect(mocks.respond).toHaveBeenCalledTimes(2);
    stream.push(event("session.waiting", "retry-done"));
    await flush();
    await retry;
    unmount();
  });
  it("cancels a waiting send without cancelling the independent observer", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    const controller = new AbortController();
    const result = agent.send("Task", { signal: controller.signal });
    void result.catch(() => undefined);
    await flush();
    controller.abort(new Error("Stop waiting"));
    await expect(result).rejects.toThrow("Stop waiting");
    const streamOptions = mocks.stream.mock.calls[0]?.[0] as
      | { signal: AbortSignal }
      | undefined;
    expect(streamOptions?.signal.aborted).toBe(false);
    unmount();
  });
  it("keeps an OAuth operation pending across its interim waiting boundary", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    let settled = false;
    const result = agent.send("Connect service").then(() => {
      settled = true;
      return undefined;
    });
    await flush();
    stream.push({
      ...event("authorization.required", "auth"),
      data: { name: "service", webhookUrl: "https://example.com/callback" },
    } as MessageStreamEvent);
    stream.push(event("session.waiting", "oauth-wait"));
    await flush();
    expect(settled).toBe(false);
    stream.push({
      ...event("authorization.completed", "auth-done"),
      data: { name: "service" },
    } as MessageStreamEvent);
    stream.push(event("session.waiting", "oauth-done"));
    await flush();
    await result;
    expect(settled).toBe(true);
    unmount();
  });
  it("rejects an approval before POST when its observer has failed", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    stream.fail(new Error("Stream disconnected"));
    await flush();
    const response = agent.respond([
      { requestId: "approval", optionId: "approve" },
    ]);
    void response.catch(() => undefined);
    await flush();
    expect(mocks.respond).not.toHaveBeenCalled();
    await expect(response).rejects.toThrow("Reconnect");
    unmount();
  });
  it("can reconnect a failed observer and then approve with an observed completion", async () => {
    const failed = controlledStream();
    mocks.stream.mockImplementation(failed.iterate);
    const { agent, reconnectEffect, unmount } = mount();
    await flush();
    failed.fail(new Error("Disconnected"));
    await flush();
    await agent.resume();
    const restored = controlledStream();
    mocks.stream.mockImplementation(restored.iterate);
    reconnectEffect();
    await flush();
    const approval = agent.respond([
      { requestId: "approval", optionId: "approve" },
    ]);
    await flush();
    expect(mocks.respond).toHaveBeenCalledOnce();
    restored.push(event("session.waiting", "reconnected-done"));
    await flush();
    await approval;
    expect(history().events.at(-1)?.meta.id).toBe("reconnected-done");
    expect(mocks.readHistory).toHaveBeenCalledTimes(1);
    unmount();
  });
  it("delivers a new instruction while an OAuth operation is parked", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { agent, unmount } = mount();
    await flush();
    const original = agent.send("Connect service");
    void original.catch(() => undefined);
    await flush();
    stream.push({
      ...event("authorization.required", "park-auth"),
      data: { name: "service", webhookUrl: "https://example.com/callback" },
    } as MessageStreamEvent);
    stream.push(event("session.waiting", "park-wait"));
    await flush();
    const next = agent.send("Cancel that and use another service");
    void next.catch(() => undefined);
    await flush();
    expect(mocks.send).toHaveBeenCalledWith(
      "Cancel that and use another service",
      { turnPolicy: "steer" }
    );
    stream.push({
      ...event("authorization.completed", "park-end"),
      data: { name: "service" },
    } as MessageStreamEvent);
    stream.push(event("session.waiting", "park-done"));
    await flush();
    await Promise.all([original, next]);
    unmount();
  });
  it("aborts its sole stream on unmount", async () => {
    const stream = controlledStream();
    mocks.stream.mockImplementation(stream.iterate);
    const { unmount } = mount();
    await flush();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    const options = mocks.stream.mock.calls[0]?.[0] as { signal: AbortSignal };
    unmount();
    expect(options.signal.aborted).toBe(true);
  });
});
