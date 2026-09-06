import { afterEach, describe, expect, it, vi } from "vitest";

const REGISTRY = Symbol.for("eve.harness-instrumentation-providers");

function stubRequiredEnvironment() {
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@example.com/database");
  vi.stubEnv("KERNEL_API_KEY", "test-kernel-key");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "test-auth-secret-0123456789abcdefghijklmnop"
  );
  vi.stubEnv("BETTER_AUTH_URL", "https://example.com");
  vi.stubEnv(
    "SECRET_ENCRYPTION_KEY",
    "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(globalThis, REGISTRY, {
    configurable: true,
    value: new Map(),
    writable: true,
  });
});

describe("Agent Runs instrumentation registry", () => {
  it("removes the seeded Agent Runs provider when the gate is off", async () => {
    vi.resetModules();
    stubRequiredEnvironment();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("WORKFLOW_RESUME_TIMING", "off");
    Object.defineProperty(globalThis, REGISTRY, {
      configurable: true,
      value: new Map(),
      writable: true,
    });

    const providers =
      await import("../../node_modules/eve/dist/src/instrumentation/providers.js");
    providers.seedInstrumentationProviders();
    expect(providers.getInstrumentationProviders()).toHaveLength(1);

    const { default: authoredProvider } =
      await import("@/agent/instrumentation/agent-runs");
    await providers.registerInstrumentationProvider({
      agentName: "synthetic",
      slot: "agent-runs",
      value: authoredProvider,
    });
    const { default: authoredOtel } =
      await import("@/agent/instrumentation/otel");
    await providers.registerInstrumentationProvider({
      agentName: "synthetic",
      slot: "otel",
      value: authoredOtel,
    });

    expect(providers.getInstrumentationProviders()).toEqual([]);
    const { collectOtelPipeline } =
      await import("../../node_modules/eve/dist/src/tracing/otel-declaration.js");
    expect(collectOtelPipeline([]).declared).toBe(false);
  });

  it("replaces the seeded provider with the configured processor when on", async () => {
    vi.resetModules();
    stubRequiredEnvironment();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("WORKFLOW_RESUME_TIMING", "on");
    Object.defineProperty(globalThis, REGISTRY, {
      configurable: true,
      value: new Map(),
      writable: true,
    });

    const providers =
      await import("../../node_modules/eve/dist/src/instrumentation/providers.js");
    providers.seedInstrumentationProviders();
    const { default: authoredProvider } =
      await import("@/agent/instrumentation/agent-runs");
    await providers.registerInstrumentationProvider({
      agentName: "synthetic",
      slot: "agent-runs",
      value: authoredProvider,
    });
    const { default: authoredOtel } =
      await import("@/agent/instrumentation/otel");
    await providers.registerInstrumentationProvider({
      agentName: "synthetic",
      slot: "otel",
      value: authoredOtel,
    });

    const registered = providers.getInstrumentationProviders();
    expect(registered).toHaveLength(2);
    const { collectOtelPipeline } =
      await import("../../node_modules/eve/dist/src/tracing/otel-declaration.js");
    const collected = collectOtelPipeline(
      registered.map(({ provider }) => provider)
    );
    expect(collected.declared).toBe(true);
    expect(collected.pipeline.spanProcessors).toHaveLength(1);
  });
});
