import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("WORKFLOW_RESUME_TIMING", "on");

const { default: agentRunsInstrumentation } =
  await import("@/agent/instrumentation/agent-runs");

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
const SYNTHETIC_SECRET = "SYNTHETIC_SECRET_SENTINEL";

interface ExportedSpan {
  attributes?: { key: string; value: unknown }[];
  events?: { name?: string; attributes?: unknown }[];
  links?: { attributes?: { key: string; value: unknown }[] }[];
  name?: string;
  status?: { message?: string };
}

interface ReportedSpans {
  resourceSpans: {
    resource?: { attributes?: { key: string; value: unknown }[] };
    scopeSpans?: { spans?: ExportedSpan[] }[];
  }[];
}

type RequestContextGlobal = typeof globalThis & {
  [REQUEST_CONTEXT]?: {
    get(): { telemetry: { reportSpans(payload: ReportedSpans): void } };
  };
};

function syntheticSpan() {
  return {
    name: "workflow.resume",
    spanContext: () => ({
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      traceFlags: 1,
      isRemote: false,
    }),
    parentSpanId: undefined,
    traceId: "11111111111111111111111111111111",
    spanId: "2222222222222222",
    traceFlags: 1,
    startTime: [1, 0],
    endTime: [1, 1_000_000],
    duration: [0, 1_000_000],
    attributes: {
      "workflow.resume.total_ms": 3593,
      "workflow.resume.phase.replay_ms": 41,
      "workflow.resume.trigger": "hook",
      "workflow.replay.load.source": "event_load",
      "workflow.events.pages_loaded": 2,
      "workflow.queue.deserialize_time_ms": 3,
      "agent.model.id": "synthetic-model",
      "agent.channel.delivery.outcome": "completed",
      "error.type": "SyntheticError",
      "gen_ai.prompt": SYNTHETIC_SECRET,
      "gen_ai.output.messages": SYNTHETIC_SECRET,
      "gen_ai.usage.input_tokens": 999,
      authorization: SYNTHETIC_SECRET,
      "eve.session.id": "synthetic-session",
    },
    events: [
      {
        name: "exception",
        time: [1, 0],
        attributes: { detail: SYNTHETIC_SECRET },
      },
      {
        name: "step.completed",
        time: [1, 0],
        attributes: { detail: SYNTHETIC_SECRET },
      },
    ],
    links: [
      {
        attributes: { "eve.link.type": "workflow.delivery" },
        context: {
          traceId: "33333333333333333333333333333333",
          spanId: "4444444444444444",
          traceFlags: 1,
          isRemote: false,
        },
      },
    ],
    status: { code: 2, message: SYNTHETIC_SECRET },
    resource: { attributes: { "service.name": "synthetic-service" } },
    instrumentationScope: { name: "synthetic" },
    kind: 0,
  };
}

afterEach(() => {
  // SAFETY: this test owns the synthetic Vercel request-context slot.
  const requestContextGlobal = globalThis as RequestContextGlobal;
  requestContextGlobal[REQUEST_CONTEXT] = undefined;
});

describe("Agent Runs instrumentation", () => {
  it("exports timing and delivery/model metadata while dropping synthetic content", async () => {
    let received: ReportedSpans | undefined;
    // SAFETY: this test owns the synthetic Vercel request-context slot.
    const requestContextGlobal = globalThis as RequestContextGlobal;
    requestContextGlobal[REQUEST_CONTEXT] = {
      get() {
        return {
          telemetry: {
            reportSpans(payload: ReportedSpans) {
              received = payload;
            },
          },
        };
      },
    };

    const processor =
      "spanProcessors" in agentRunsInstrumentation
        ? agentRunsInstrumentation.spanProcessors[0]
        : undefined;
    if (processor === undefined || processor === "auto") {
      throw new Error("Expected Agent Runs span processor.");
    }
    processor.onEnd(syntheticSpan());
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(received).toBeDefined();
    if (!received) throw new Error("Expected the synthetic span report.");
    // SAFETY: the real exporter always reports a resourceSpans array after the
    // defined processor has accepted a sampled synthetic span above.
    const exportedSpan = received.resourceSpans[0]?.scopeSpans?.[0]?.spans?.[0];
    expect(exportedSpan).toBeDefined();

    const attributes = Object.fromEntries(
      (exportedSpan?.attributes ?? []).map((entry) => [entry.key, entry.value])
    );
    const serialized = JSON.stringify(received);

    expect(serialized).not.toContain(SYNTHETIC_SECRET);
    expect(attributes["workflow.resume.total_ms"]).toEqual({ intValue: 3593 });
    expect(attributes["workflow.resume.phase.replay_ms"]).toEqual({
      intValue: 41,
    });
    expect(attributes["workflow.resume.trigger"]).toEqual({
      stringValue: "hook",
    });
    expect(attributes["agent.model.id"]).toEqual({
      stringValue: "synthetic-model",
    });
    expect(attributes["agent.channel.delivery.outcome"]).toEqual({
      stringValue: "completed",
    });
    expect(attributes["error.type"]).toEqual({
      stringValue: "SyntheticError",
    });
    expect(Object.keys(attributes).toSorted()).toEqual([
      "agent.channel.delivery.outcome",
      "agent.model.id",
      "error.type",
      "workflow.events.pages_loaded",
      "workflow.queue.deserialize_time_ms",
      "workflow.replay.load.source",
      "workflow.resume.phase.replay_ms",
      "workflow.resume.total_ms",
      "workflow.resume.trigger",
    ]);
    expect(exportedSpan?.name).toBe("workflow.resume");
    expect(exportedSpan?.events).toHaveLength(1);
    expect(exportedSpan?.events?.[0]?.name).toBe("step.completed");
    expect(exportedSpan?.events?.[0]?.attributes).toEqual([]);
    expect(received.resourceSpans[0]?.resource?.attributes).toContainEqual({
      key: "service.name",
      value: { stringValue: "synthetic-service" },
    });
    expect(exportedSpan?.links?.[0]?.attributes).toContainEqual({
      key: "eve.link.type",
      value: { stringValue: "workflow.delivery" },
    });
    expect(exportedSpan?.status?.message).toBeUndefined();
  });
});
