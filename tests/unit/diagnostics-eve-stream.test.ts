import { describe, expect, it, vi } from "vitest";
import { readEveSessionMetadata } from "../../scripts/diagnostics/eve-stream";

const since = "2026-09-12T10:00:00.000Z";
const until = "2026-09-12T10:15:00.000Z";
let eventSequence = 0;

describe("bounded Eve metadata reader", () => {
  it("projects only lifecycle and child-session metadata from an owned bounded stream", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("tail", {
          headers: { "x-eve-stream-tail-index": "2" },
        })
      )
      .mockResolvedValueOnce(
        responseFor([
          event("message.received", { message: "PRIVATE_MESSAGE_CANARY" }),
          event("subagent.called", { childSessionId: "ses_child_synthetic" }),
          event("session.completed", { message: "PRIVATE_COMPLETION_CANARY" }),
        ])
      );

    const result = await readEveSessionMetadata({
      origin: "https://app.example.test",
      cookie: "session=synthetic",
      sessionId: "ses_root_synthetic",
      since,
      until,
      fetchImpl,
    });

    expect(result.childSessionIds).toEqual(["ses_child_synthetic"]);
    expect(result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "child_session",
          execution: "delegated",
        }),
        expect.objectContaining({
          kind: "lifecycle",
          execution: "session.completed",
        }),
      ])
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE_MESSAGE_CANARY");
    expect(serialized).not.toContain("PRIVATE_COMPLETION_CANARY");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.redirect === "error")
    ).toBe(true);
  });

  it("returns unavailable when a cookie-bearing stream request is rejected as a redirect", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("tail", {
          headers: { "x-eve-stream-tail-index": "0" },
        })
      )
      .mockRejectedValueOnce(new TypeError("redirect rejected"));

    const result = await readEveSessionMetadata({
      origin: "https://app.example.test",
      cookie: "session=synthetic",
      sessionId: "ses_root_synthetic",
      since,
      until,
      fetchImpl,
    });

    expect(result.gap).toBe("unavailable");
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.redirect === "error")
    ).toBe(true);
  });

  it("keeps forbidden access and event truncation explicit", async () => {
    const forbidden = await readEveSessionMetadata({
      origin: "https://app.example.test",
      cookie: "session=synthetic",
      sessionId: "ses_root_synthetic",
      since,
      until,
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 403 })),
    });
    expect(forbidden.gap).toBe("forbidden");

    const many = Array.from({ length: 129 }, () => event("turn.completed", {}));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("tail", {
          headers: { "x-eve-stream-tail-index": "128" },
        })
      )
      .mockResolvedValueOnce(responseFor(many));
    const truncated = await readEveSessionMetadata({
      origin: "https://app.example.test",
      cookie: "session=synthetic",
      sessionId: "ses_root_synthetic",
      since,
      until,
      fetchImpl,
    });
    expect(truncated.gap).toBe("truncated");
    expect(truncated.observations).toHaveLength(128);
  });

  it("marks an otherwise complete tail as truncated when earlier stream events were omitted", async () => {
    const retainedTail = Array.from({ length: 128 }, () =>
      event("turn.completed", {})
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("tail", {
          headers: { "x-eve-stream-tail-index": "200" },
        })
      )
      .mockResolvedValueOnce(responseFor(retainedTail));

    const result = await readEveSessionMetadata({
      origin: "https://app.example.test",
      cookie: "session=synthetic",
      sessionId: "ses_root_synthetic",
      since,
      until,
      fetchImpl,
    });

    expect(result.observations).toHaveLength(128);
    expect(result.gap).toBe("truncated");
  });

  it("returns the captured historical tail from a stream that stays open", async () => {
    const events = Array.from({ length: 13 }, (_, index) =>
      event(index === 12 ? "session.completed" : "turn.completed", {})
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            events.map((entry) => JSON.stringify(entry)).join("\n")
          )
        );
      },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("tail", {
          headers: { "x-eve-stream-tail-index": "12" },
        })
      )
      .mockResolvedValueOnce(new Response(stream));

    const result = await readEveSessionMetadata({
      origin: "https://app.example.test",
      cookie: "session=synthetic",
      sessionId: "ses_root_synthetic",
      since,
      until,
      fetchImpl,
    });

    expect(result.gap).toBeUndefined();
    expect(result.observations).toHaveLength(13);
    expect(result.observations.at(-1)?.execution).toBe("session.completed");
  });
});

function event(type: string, data: Record<string, string>) {
  eventSequence += 1;
  return {
    type,
    data,
    meta: {
      id: `evt_${String(eventSequence)}`,
      at: "2026-09-12T10:05:00.000Z",
    },
  };
}

function responseFor(events: readonly EveEvent[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`
        )
      );
      controller.close();
    },
  });
  return new Response(body);
}

interface EveEvent {
  readonly type: string;
  readonly data: Record<string, string>;
  readonly meta: { readonly id: string; readonly at: string };
}
