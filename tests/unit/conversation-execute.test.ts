import { describe, expect, it } from "vitest";
import {
  validateConversationJudgment,
  captureConversationEvents,
  gradeFixtureRequests,
  deriveConversationTurnStatus,
} from "@/evals/conversation/execute";

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
  it.each([
    { kind: "message", text: "Final answer", final: true },
    { kind: "message", text: "Progress update", final: false },
    { kind: "message", text: "Legacy answer" },
    { kind: "link", url: "https://example.test", final: true },
    {
      kind: "message",
      attachments: [{ kind: "image", url: "https://example.test/image.png" }],
      final: true,
    },
  ])(
    "retains valid message inputs including completion controls: %j",
    (input) => {
      const evidence = captureConversationEvents([
        {
          type: "actions.requested",
          data: {
            actions: [
              {
                kind: "tool-call",
                callId: "send-1",
                toolName: "send_message",
                input,
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
              output: { kind: "message", text: "submitted" },
            },
          },
        },
      ]);
      expect(evidence.messages).toHaveLength(1);
      expect(evidence.messages[0]).not.toContain("final");
    }
  );
  it("retains native load-skill input when its result arrives", () => {
    const evidence = captureConversationEvents([
      {
        type: "actions.requested",
        data: {
          actions: [
            {
              kind: "load-skill",
              callId: "skill-1",
              input: { skill: "email" },
            },
            {
              kind: "unknown-action",
              callId: "unknown-1",
              input: { ignored: true },
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
            callId: "skill-1",
            toolName: "load_skill",
            output: { loaded: true },
          },
        },
      },
    ]);
    expect(evidence.toolCalls).toEqual([
      {
        name: "load_skill",
        input: { skill: "email" },
        output: { loaded: true },
        status: "completed",
      },
    ]);
  });
  it("captures the CORE04 clarification event without inventing a completed message", () => {
    const prompt =
      "What’s changing tomorrow, and does the team need to do anything differently? Pick a tone too, if you’d like.";
    const options = [
      {
        id: "direct",
        label: "Direct and practical",
        description:
          "A concise, straightforward update with what’s changing and any action needed.",
        style: "primary",
      },
      {
        id: "warm",
        label: "Warm and appreciative",
        description:
          "A warmer note that acknowledges the adjustment and thanks the team.",
        style: "default",
      },
    ];
    const event = {
      type: "input.requested",
      data: {
        requests: [
          {
            kind: "question",
            display: "select",
            requestId: "question-1",
            prompt,
            options,
            allowFreeform: true,
            action: {
              kind: "tool-call",
              callId: "question-1",
              toolName: "ask_question",
              input: { prompt, options, allowFreeform: true },
            },
          },
        ],
      },
    };
    const evidence = captureConversationEvents([event, event]);
    expect(evidence.inputRequests).toEqual([
      {
        requestId: "question-1",
        prompt,
        options,
        display: "select",
        allowFreeform: true,
      },
    ]);
    expect(evidence.toolCalls).toEqual([
      {
        name: "ask_question",
        input: { prompt, options, allowFreeform: true },
        status: "pending",
      },
    ]);
    expect(evidence.messages).toEqual([]);
    expect(evidence.text).toBe("");
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

it("captures authorization event identity separately from questions and successful actions", () => {
  const data = {
    attemptId: "attempt-1",
    name: "square",
    description: "Connect Square",
    turnId: "turn-1",
    stepIndex: 2,
    sequence: 1,
    authorization: {
      url: "https://example.invalid/square/authorize",
      displayName: "Square",
      userCode: "SYNTHETIC",
      instructions: "Sign in",
      expiresAt: "2026-11-02T00:00:00Z",
      internal: "omit",
    },
    webhookUrl: "http://localhost/internal-callback",
  };
  const event = { type: "authorization.required", data };
  const capture = captureConversationEvents([
    event,
    event,
    { ...event, data: { ...data, attemptId: "attempt-2" } },
    { type: "input.requested", data: { requests: [] } },
    {
      type: "authorization.completed",
      data: { ...data, outcome: "declined", reason: "User declined" },
    },
    {
      type: "authorization.completed",
      data: { ...data, outcome: "declined", reason: "User declined" },
    },
    { type: "authorization.required", data: { name: "invalid shape" } },
  ]);
  expect(capture.authorizationRequests).toHaveLength(2);
  expect(capture.authorizationRequests[0]?.authorization).toEqual({
    url: "https://example.invalid/square/authorize",
    displayName: "Square",
    userCode: "SYNTHETIC",
    instructions: "Sign in",
    expiresAt: "2026-11-02T00:00:00Z",
  });
  expect(capture.authorizationRequests[0]).not.toHaveProperty("webhookUrl");
  expect(capture.authorizationRequests[0]).not.toHaveProperty("outcome");
  expect(capture.authorizationOutcomes).toHaveLength(1);
  expect(capture.authorizationOutcomes[0]?.outcome).toBe("declined");
  expect(capture.messages).toEqual([]);
  expect(capture.toolCalls).toEqual([]);
  expect(capture.inputRequests).toEqual([]);
  const noAttempt = { ...data, attemptId: undefined };
  expect(
    captureConversationEvents([
      { type: "authorization.required", data: noAttempt },
      { type: "authorization.required", data: noAttempt },
      { type: "authorization.required", data: { ...noAttempt, sequence: 2 } },
    ]).authorizationRequests
  ).toHaveLength(2);
});
