import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  let value: {
    callId: string;
    turnId: string;
    status: "pending" | "completed" | "unconfirmed";
  } | null = null;
  const request =
    vi.fn<(args: { callId: string; stepIndex: number }) => void>();
  return {
    defineState: (_name: string, _initial: () => typeof value) => ({
      get: () => value,
      update: (update: (current: typeof value) => typeof value) => {
        value = update(value);
      },
    }),
    reset: () => {
      value = null;
      request.mockReset();
    },
    request,
  };
});

vi.mock("eve/context", () => ({
  defineState: state.defineState,
  requestTurnCompletion: state.request,
}));

const {
  beginFinalDelivery,
  requestFinalDeliveryCompletion,
  settleFinalDelivery,
} = await import("@/agent/lib/message-delivery");

describe("final delivery completion request", () => {
  beforeEach(() => {
    state.reset();
  });

  it("requests completion only for matching accepted delivery", () => {
    beginFinalDelivery("turn-1", "call-1", true);
    settleFinalDelivery("call-1", true);

    requestFinalDeliveryCompletion("call-1", "turn-1", 2);

    expect(state.request).toHaveBeenCalledExactlyOnceWith({
      callId: "call-1",
      stepIndex: 2,
    });
  });

  it.each([
    [
      "pending",
      () => {
        beginFinalDelivery("turn-1", "call-1", true);
      },
    ],
    [
      "unconfirmed",
      () => {
        beginFinalDelivery("turn-1", "call-1", true);
        settleFinalDelivery("call-1", false);
      },
    ],
    [
      "wrong call",
      () => {
        beginFinalDelivery("turn-1", "call-1", true);
        settleFinalDelivery("call-1", true);
      },
    ],
    [
      "stale turn",
      () => {
        beginFinalDelivery("turn-1", "call-1", true);
        settleFinalDelivery("call-1", true);
      },
    ],
  ] as const)(
    "does not request completion for %s delivery state",
    (_name, setup) => {
      setup();
      const callId = _name === "wrong call" ? "other-call" : "call-1";
      const turnId = _name === "stale turn" ? "other-turn" : "turn-1";

      requestFinalDeliveryCompletion(callId, turnId, 2);

      expect(state.request).not.toHaveBeenCalled();
    }
  );

  it("does not request completion for a non-final progress message", () => {
    requestFinalDeliveryCompletion("call-progress", "turn-1", 0);

    expect(state.request).not.toHaveBeenCalled();
  });
});
