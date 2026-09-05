import { describe, expect, it } from "vitest";
import {
  validateConversationJudgment,
  captureConversationEvents,
  gradeFixtureRequests,
  deriveConversationTurnStatus,
} from "../execute";

describe("conversation evidence completeness", () => {
  const rating = {
    dimension: "warmth",
    score: 3 as const,
    reason: "Brief friendly reply",
    turns: [1],
  };
  const outcomes = ["task correctness", "honest status", "user control"].map(
    (criterion) => ({
      criterion,
      pass: true,
      reason: "Observed reply",
      turns: [1],
    })
  );
  it("requires exactly one rating per dimension and all three outcomes with citations", () => {
    expect(() =>
      validateConversationJudgment(
        { ratings: [rating], outcomes },
        ["warmth"],
        1
      )
    ).not.toThrow();
    expect(() =>
      validateConversationJudgment(
        { ratings: [rating, rating], outcomes },
        ["warmth"],
        1
      )
    ).toThrow(/dimension/);
    expect(() =>
      validateConversationJudgment(
        { ratings: [rating], outcomes: [] },
        ["warmth"],
        1
      )
    ).toThrow(/outcome/);
    expect(() =>
      validateConversationJudgment(
        { ratings: [{ ...rating, turns: [] }], outcomes },
        ["warmth"],
        1
      )
    ).toThrow(/Too small/);
    expect(() =>
      validateConversationJudgment(
        { ratings: [{ ...rating, turns: [2] }], outcomes },
        ["warmth"],
        1
      )
    ).toThrow(/nonexistent/);
  });
  it("retains completed delivery and pending calls from a stream that later fails", () => {
    const evidence = captureConversationEvents([
      {
        type: "actions.requested",
        data: {
          actions: [
            {
              kind: "tool-call",
              callId: "send-1",
              toolName: "send_message",
              input: { kind: "message", text: "I found the order." },
            },
            {
              kind: "tool-call",
              callId: "lookup-2",
              toolName: "square",
              input: {},
            },
          ],
        },
      },
      {
        type: "action.result",
        data: {
          status: "completed",
          result: {
            kind: "tool-result",
            callId: "send-1",
            toolName: "send_message",
            output: { ok: true },
          },
        },
      },
    ]);
    expect(evidence.messages).toEqual(["I found the order."]);
    expect(evidence.toolCalls[1]?.status).toBe("pending");
  });
});

describe("fixture recovery evidence", () => {
  const request = {
    method: "GET",
    path: "/v2/orders/ORD_0",
    status: 200,
    turn: 2,
    caseId: "CORE-11",
    elapsedMs: 1,
    startedAt: "2026-01-01T00:00:00Z",
  };
  it("requires the order resource and specified recovery turn", () => {
    expect(
      gradeFixtureRequests("CORE-11", [request]).find(
        (c) => c.name === "Final lookup succeeded"
      )?.pass
    ).toBe(true);
    for (const wrong of [
      { ...request, path: "/v2/locations" },
      { ...request, turn: 1 },
      { ...request, path: "/v2/orders/OTHER" },
    ]) {
      expect(
        gradeFixtureRequests("CORE-11", [wrong]).find(
          (c) => c.name === "Final lookup succeeded"
        )?.pass
      ).toBe(false);
    }
    expect(
      gradeFixtureRequests("SQ-08", [
        {
          ...request,
          caseId: "SQ-08",
          method: "POST",
          path: "/v2/orders/search",
          turn: 3,
        },
      ]).find((c) => c.name === "Final lookup succeeded")?.pass
    ).toBe(true);
  });
  it("requires a delayed order read on CORE10 turn one and caps failed HTTP reads per turn", () => {
    expect(
      gradeFixtureRequests("CORE-10", [
        { ...request, caseId: "CORE-10", turn: 1, elapsedMs: 1500 },
      ])[0]?.pass
    ).toBe(true);
    expect(
      gradeFixtureRequests("CORE-10", [
        { ...request, caseId: "CORE-10", turn: 2, elapsedMs: 1500 },
      ])[0]?.pass
    ).toBe(false);
    const failures = Array.from({ length: 4 }, () => ({
      ...request,
      status: 503,
      turn: 1,
    }));
    expect(
      gradeFixtureRequests("CORE-11", failures).find((c) =>
        c.name.includes("retry budget")
      )?.pass
    ).toBe(false);
    expect(
      gradeFixtureRequests("CORE-11", failures.slice(1)).find((c) =>
        c.name.includes("retry budget")
      )?.pass
    ).toBe(true);
  });
});

describe("runtime failure status", () => {
  it("preserves a failed turn when Eve subsequently reports session waiting", () => {
    expect(
      deriveConversationTurnStatus("waiting", [
        {
          type: "turn.failed",
          data: {
            code: "MODEL_ERROR",
            message: "Gateway budget rejected request",
            sequence: 1,
            turnId: "t1",
          },
        },
        {
          type: "session.waiting",
          data: { continuationToken: "s1", wait: "next-user-message" },
        },
      ])
    ).toEqual({
      status: "failed",
      error: "turn.failed MODEL_ERROR: Gateway budget rejected request",
    });
    expect(
      deriveConversationTurnStatus("completed", [
        {
          type: "session.failed",
          data: {
            code: "SESSION_ERROR",
            message: "Session failed",
            sessionId: "s1",
          },
        },
      ]).status
    ).toBe("failed");
    expect(
      deriveConversationTurnStatus("waiting", [
        {
          type: "session.waiting",
          data: { continuationToken: "s1", wait: "next-user-message" },
        },
      ])
    ).toEqual({ status: "waiting" });
  });
});
