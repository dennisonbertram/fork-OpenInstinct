import { context, trace } from "@opentelemetry/api";

const INSTRUMENTATION_REGISTRY = Symbol.for(
  "eve.harness-instrumentation-providers"
);
const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
const secret = "SYNTHETIC_SECRET_SENTINEL";

interface ReportedSpanBatch {
  resourceSpans?: unknown[];
}

type RequestContextGlobal = typeof globalThis & {
  [VERCEL_REQUEST_CONTEXT]?: {
    get(): { telemetry: { reportSpans(payload: ReportedSpanBatch): void } };
  };
};

async function main() {
  // eslint-disable-next-line no-restricted-properties -- isolated executable fixture must set its synthetic startup environment before importing the provider.
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnop",
    BETTER_AUTH_URL: "https://example.com",
    DATABASE_URL: "postgresql://user:password@example.com/database",
    KERNEL_API_KEY: "test-kernel-key",
    NODE_ENV: "production",
    SECRET_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
    VERCEL_ENV: "production",
    WORKFLOW_RESUME_TIMING: "on",
  });

  Object.defineProperty(globalThis, INSTRUMENTATION_REGISTRY, {
    configurable: true,
    value: new Map(),
    writable: true,
  });

  const reported: ReportedSpanBatch[] = [];
  // SAFETY: this fixture owns the synthetic Vercel request-context slot.
  const requestContextGlobal = globalThis as RequestContextGlobal;
  requestContextGlobal[VERCEL_REQUEST_CONTEXT] = {
    get() {
      return {
        headers: new Headers({ host: "synthetic.vercel.app" }),
        telemetry: {
          reportSpans(payload) {
            reported.push(payload);
          },
        },
        waitUntil() {
          return undefined;
        },
      };
    },
  };

  const providers =
    await import("../../node_modules/eve/dist/src/instrumentation/providers.js");
  const { default: agentRunsInstrumentation } =
    await import("../../agent/instrumentation/agent-runs");
  const { default: otelInstrumentation } =
    await import("../../agent/instrumentation/otel");

  providers.seedInstrumentationProviders();
  await providers.registerInstrumentationProvider({
    agentName: "synthetic",
    slot: "agent-runs",
    value: agentRunsInstrumentation,
  });
  await providers.registerInstrumentationProvider({
    agentName: "synthetic",
    slot: "otel",
    value: otelInstrumentation,
  });
  providers.finalizeInstrumentationProviders({ serviceName: "synthetic" });

  const parent = trace.getTracer("eve.agent").startSpan("ai.eve.turn", {
    attributes: { "agent.session.id": "synthetic-session" },
  });
  await context.with(trace.setSpan(context.active(), parent), async () => {
    const workflow = trace.getTracer("workflow");
    // Eve 0.49.0 attaches resume phases to this framework-owned outer step
    // span. Its compiled runtime emits `step.execute ${pe$15(stepName)}`.
    const known = workflow.startSpan("step.execute turnStep", {
      attributes: {
        "workflow.resume.phase.producer_prep_ms": 11,
        "workflow.resume.phase.queue_delivery_ms": 23,
        "workflow.resume.phase.resume_setup_ms": 31,
        "workflow.resume.phase.replay_ms": 41,
        "workflow.resume.phase.step_dispatch_ms": 53,
        "workflow.resume.phase.step_claim_ms": 67,
        "workflow.resume.phase.step_prepare_ms": 79,
        "workflow.resume.total_ms": 3593,
        "workflow.resume.trigger": "hook",
        secret,
      },
      links: [
        {
          attributes: { "eve.link.type": "workflow.delivery" },
          context: parent.spanContext(),
        },
      ],
    });
    known.addEvent("workflow.hook_received.create.start", { secret });
    known.setStatus({ code: 2, message: secret });
    known.end();

    const unknown = workflow.startSpan(`workflow.${secret}`, {
      attributes: { "workflow.resume.total_ms": 1 },
    });
    unknown.end();

    const hostileWorkflowSuffix = workflow.startSpan(`workflow.run ${secret}`, {
      attributes: { "workflow.resume.total_ms": 1 },
    });
    hostileWorkflowSuffix.end();

    const hostileStepSuffix = workflow.startSpan(`step.execute ${secret}`, {
      attributes: { "workflow.resume.total_ms": 1 },
    });
    hostileStepSuffix.end();
  });
  parent.end();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await providers.shutdownInstrumentationProviders();

  process.stdout.write(JSON.stringify(reported));
}

void main();
