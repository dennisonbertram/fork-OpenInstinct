import type { MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import {
  getLatestTurnFailure,
  getLatestTurnFailureDiagnostic,
  getLatestTurnOutcome,
} from "./turn-failure";

describe("turn failures", () => {
  it("keeps a terminal session failure visible after reload", () => {
    const failure = {
      data: {
        code: "SESSION_FAILED",
        message: "not visible",
        sessionId: "session-1",
      },
      meta: { at: "2026-09-05T12:00:00.000Z", id: "session-failed" },
      type: "session.failed",
    } satisfies MessageStreamEvent;

    expect(getLatestTurnOutcome([failure])).toBe("session-failed");
  });

  it("keeps a parked failed child visibly failed", () => {
    const events = [
      {
        data: {
          code: "CHILD_FAILED",
          message: "Child failed.",
          sequence: 1,
          turnId: "child-turn",
        },
        meta: { at: "2026-08-27T20:00:00.000Z", id: "failed" },
        type: "turn.failed",
      },
      {
        data: { continuationToken: "", wait: "next-user-message" },
        meta: { at: "2026-08-27T20:00:01.000Z", id: "waiting" },
        type: "session.waiting",
      },
    ] satisfies MessageStreamEvent[];

    expect(getLatestTurnFailure(events)).toBe("Child failed.");
  });
});

describe("developer failure diagnostic", () => {
  const failure = {
    type: "turn.failed",
    meta: { at: "2026-09-05T12:00:00.000Z", id: "failure" },
    data: {
      code: "MODEL_CALL_FAILED",
      message: "insufficient_funds SECRET_SENTINEL",
      details: { statusCode: 402 },
      sequence: 1,
      turnId: "turn-1",
    },
  } satisfies MessageStreamEvent;

  it("does not infer billing from status or unstructured provider text", () => {
    expect(getLatestTurnFailureDiagnostic([failure])).toBeUndefined();
  });

  it("clears a recognized billing diagnostic when a new request arrives", () => {
    const events = [
      {
        ...failure,
        data: {
          ...failure.data,
          details: { upstreamType: "insufficient_funds" },
        },
      },
      {
        type: "message.received",
        meta: { at: "2026-09-05T12:01:00.000Z", id: "next" },
        data: { turnId: "turn-2", sequence: 0, message: "Try again" },
      },
    ] satisfies MessageStreamEvent[];
    expect(getLatestTurnFailureDiagnostic(events)).toBeUndefined();
  });
});
