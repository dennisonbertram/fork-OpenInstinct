import { trace } from "@opentelemetry/api";
import { z } from "zod";

const INSTRUMENTATION_REGISTRY = Symbol.for(
  "eve.harness-instrumentation-providers"
);
const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
const records: string[] = [];
let reportCount = 0;

async function main() {
  // eslint-disable-next-line no-restricted-properties -- isolated executable fixture sets synthetic startup environment before loading instrumentation.
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
  Object.defineProperty(globalThis, VERCEL_REQUEST_CONTEXT, {
    configurable: true,
    value: {
      get: () => ({
        headers: new Headers({ host: "synthetic.vercel.app" }),
        telemetry: { reportSpans: () => (reportCount += 1) },
        waitUntil: () => undefined,
      }),
    },
  });
  console.info = (...args: Parameters<typeof console.info>) => {
    const message = z.string().safeParse(args[0]);
    if (message.success) records.push(message.data);
  };

  const providers =
    await import("../../node_modules/eve/dist/src/instrumentation/providers.js");
  const { default: agentRuns } =
    await import("../../agent/instrumentation/agent-runs");
  const { default: otel } = await import("../../agent/instrumentation/otel");
  const { default: timing } =
    await import("../../agent/instrumentation/workflow-resume-timing");
  providers.seedInstrumentationProviders();
  await providers.registerInstrumentationProvider({
    agentName: "synthetic",
    slot: "agent-runs",
    value: agentRuns,
  });
  await providers.registerInstrumentationProvider({
    agentName: "synthetic",
    slot: "otel",
    value: otel,
  });
  await providers.registerInstrumentationProvider({
    agentName: "synthetic",
    slot: "workflow-resume-timing",
    value: timing,
  });
  providers.finalizeInstrumentationProviders({ serviceName: "synthetic" });

  const span = trace.getTracer("workflow").startSpan("step.execute turnStep", {
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
      secret: "must-not-log",
    },
  });
  span.end();
  await providers.shutdownInstrumentationProviders();

  process.stdout.write(JSON.stringify({ records, reportCount }));
}

void main();
