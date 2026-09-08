import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.stubEnv("WORKFLOW_RESUME_TIMING", "on");

const { default: agentRunsInstrumentation } =
  await import("@/agent/instrumentation/agent-runs");

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
const SYNTHETIC_SECRET = "SYNTHETIC_SECRET_SENTINEL";

interface ReportedSpans {
  resourceSpans: {
    resource?: { attributes?: { key: string; value: unknown }[] };
    scopeSpans?: {
      spans?: {
        attributes?: { key: string; value: unknown }[];
        events?: { name?: string; attributes?: unknown }[];
        links?: { attributes?: { key: string; value: unknown }[] }[];
        name?: string;
        status?: { code?: number; message?: string };
      }[];
    }[];
  }[];
}

const exportedSpanSchema = z
  .object({
    attributes: z
      .array(z.object({ key: z.string(), value: z.unknown() }))
      .optional(),
    events: z
      .array(
        z.object({
          attributes: z.unknown().optional(),
          name: z.string().optional(),
        })
      )
      .optional(),
    links: z
      .array(
        z.object({
          attributes: z
            .array(z.object({ key: z.string(), value: z.unknown() }))
            .optional(),
        })
      )
      .optional(),
    name: z.string().optional(),
    status: z
      .object({ code: z.number().optional(), message: z.string().optional() })
      .optional(),
  })
  .loose();

const reportedSpansSchema = z.array(
  z.object({
    resourceSpans: z.array(
      z.object({
        resource: z
          .object({
            attributes: z
              .array(z.object({ key: z.string(), value: z.unknown() }))
              .optional(),
          })
          .optional(),
        scopeSpans: z
          .array(z.object({ spans: z.array(exportedSpanSchema).optional() }))
          .optional(),
      })
    ),
  })
);

type RequestContextGlobal = typeof globalThis & {
  [REQUEST_CONTEXT]?: {
    get(): { telemetry: { reportSpans(payload: ReportedSpans): void } };
  };
};

function syntheticSpan() {
  return {
    name: "step.execute turnStep",
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
  it("exports only named generated Workflow spans through the registered pipeline", () => {
    const output = execFileSync(
      join(process.cwd(), "node_modules/.bin/tsx"),
      [
        join(
          process.cwd(),
          "tests/unit/eve-agent-runs-generated-export.fixture.ts"
        ),
      ],
      { encoding: "utf8" }
    );
    const exported = reportedSpansSchema.parse(JSON.parse(output));
    const serialized = JSON.stringify(exported);
    const spans = exported.flatMap((batch) =>
      batch.resourceSpans.flatMap(
        (resourceSpan) =>
          resourceSpan.scopeSpans?.flatMap(
            (scopeSpan) => scopeSpan.spans ?? []
          ) ?? []
      )
    );

    expect(spans.map((span) => span.name)).toContain("step.execute turnStep");
    expect(spans.map((span) => span.name)).not.toContain(
      `workflow.${SYNTHETIC_SECRET}`
    );
    expect(spans.map((span) => span.name)).not.toContain(
      `workflow.run ${SYNTHETIC_SECRET}`
    );
    expect(spans.map((span) => span.name)).not.toContain(
      `step.execute ${SYNTHETIC_SECRET}`
    );
    expect(serialized).not.toContain(SYNTHETIC_SECRET);
    const turnStep = spans.find(
      (span) => span.name === "step.execute turnStep"
    );
    const turnStepAttributes = Object.fromEntries(
      (turnStep?.attributes ?? []).map((attribute) => [
        attribute.key,
        attribute.value,
      ])
    );

    expect(turnStepAttributes).toMatchObject({
      "workflow.resume.phase.producer_prep_ms": { intValue: 11 },
      "workflow.resume.phase.queue_delivery_ms": { intValue: 23 },
      "workflow.resume.phase.replay_ms": { intValue: 41 },
      "workflow.resume.phase.resume_setup_ms": { intValue: 31 },
      "workflow.resume.phase.step_claim_ms": { intValue: 67 },
      "workflow.resume.phase.step_dispatch_ms": { intValue: 53 },
      "workflow.resume.phase.step_prepare_ms": { intValue: 79 },
      "workflow.resume.total_ms": { intValue: 3593 },
      "workflow.resume.trigger": { stringValue: "hook" },
    });
    expect(turnStep?.events).toEqual([
      expect.objectContaining({
        attributes: [],
        name: "workflow.hook_received.create.start",
      }),
    ]);
    expect(turnStep?.links?.[0]?.attributes).toEqual([
      {
        key: "eve.link.type",
        value: { stringValue: "workflow.delivery" },
      },
    ]);
    expect(turnStep?.status).toEqual({ code: 2 });
    expect(
      exported.flatMap((batch) =>
        batch.resourceSpans.flatMap(
          (resourceSpan) =>
            resourceSpan.resource?.attributes?.map(
              (attribute) => attribute.key
            ) ?? []
        )
      )
    ).toEqual(
      expect.arrayContaining([
        "cloud.provider",
        "deployment.environment.name",
        "process.runtime.name",
        "service.name",
      ])
    );
  });

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
    expect(exportedSpan?.name).toBe("step.execute turnStep");
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
