import { beforeEach, describe, expect, it, vi } from "vitest";

type DeliveryState =
  | { readonly callId: string; readonly turnId: string }
  | {
      readonly callId: string;
      readonly status: "pending" | "completed" | "unconfirmed";
      readonly turnId: string;
    }
  | null;

const state = vi.hoisted(() => {
  const initializers = new Map<string, () => DeliveryState>();
  const values = new Map<string, DeliveryState>();
  const request =
    vi.fn<(args: { callId: string; stepIndex: number }) => void>();
  return {
    defineState: (name: string, initial: () => DeliveryState) => {
      initializers.set(name, initial);
      values.set(name, initial());
      return {
        get: () => values.get(name) ?? null,
        update: (update: (current: DeliveryState) => DeliveryState) => {
          values.set(name, update(values.get(name) ?? null));
        },
      };
    },
    reset: () => {
      for (const [name, initial] of initializers) {
        values.set(name, initial());
      }
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
  finalDeliveryStatus,
  hasUnconfirmedProviderAttempt,
  recordUnconfirmedDelivery,
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

  it("does not let a late uncertain progress attempt downgrade a completed final", () => {
    beginFinalDelivery("turn-1", "final-call", true);
    settleFinalDelivery("final-call", true);

    recordUnconfirmedDelivery("turn-1", "progress-call");

    expect(finalDeliveryStatus("turn-1")).toBe("completed");
    expect(hasUnconfirmedProviderAttempt("turn-1")).toBe(true);
  });
});
