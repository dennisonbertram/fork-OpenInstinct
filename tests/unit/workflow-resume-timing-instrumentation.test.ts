import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const expectedRecord = {
  event: "workflow.resume.timing",
  "workflow.resume.phase.producer_prep_ms": 11,
  "workflow.resume.phase.queue_delivery_ms": 23,
  "workflow.resume.phase.resume_setup_ms": 31,
  "workflow.resume.phase.replay_ms": 41,
  "workflow.resume.phase.step_dispatch_ms": 53,
  "workflow.resume.phase.step_claim_ms": 67,
  "workflow.resume.phase.step_prepare_ms": 79,
  "workflow.resume.total_ms": 3593,
  "workflow.resume.trigger": "hook",
} as const;

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
  vi.restoreAllMocks();
});

describe("Workflow resume timing instrumentation", () => {
  it("logs exactly the allowlisted timing metadata through a finalized Workflow tracer", () => {
    const output = execFileSync(
      join(process.cwd(), "node_modules/.bin/tsx"),
      [join(process.cwd(), "tests/unit/workflow-resume-timing.fixture.ts")],
      { encoding: "utf8" }
    );
    const result = z
      .object({ records: z.array(z.string()), reportCount: z.number() })
      .parse(JSON.parse(output));

    expect(result.records).toEqual([JSON.stringify(expectedRecord)]);
    expect(result.reportCount).toBe(0);
  });

  it.each([
    ["wrong span", { ...expectedRecord }, "step.execute untrusted"],
    [
      "missing phase",
      { ...expectedRecord, "workflow.resume.phase.replay_ms": undefined },
      "step.execute turnStep",
    ],
    [
      "NaN phase",
      { ...expectedRecord, "workflow.resume.phase.replay_ms": Number.NaN },
      "step.execute turnStep",
    ],
    [
      "infinite phase",
      { ...expectedRecord, "workflow.resume.phase.replay_ms": Infinity },
      "step.execute turnStep",
    ],
    [
      "negative infinite phase",
      { ...expectedRecord, "workflow.resume.phase.replay_ms": -Infinity },
      "step.execute turnStep",
    ],
    [
      "negative total",
      { ...expectedRecord, "workflow.resume.total_ms": -1 },
      "step.execute turnStep",
    ],
    [
      "hostile trigger",
      { ...expectedRecord, "workflow.resume.trigger": "manual" },
      "step.execute turnStep",
    ],
  ])("does not log %s", async (_case, attributes, name) => {
    vi.resetModules();
    stubRequiredEnvironment();
    vi.stubEnv("WORKFLOW_RESUME_TIMING", "on");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { default: timing } =
      await import("@/agent/instrumentation/workflow-resume-timing");
    if (!("spanProcessors" in timing)) {
      throw new Error("Expected Workflow resume timing processor.");
    }
    const processor = timing.spanProcessors[0];
    if (processor === undefined || processor === "auto") {
      throw new Error("Expected Workflow resume timing processor.");
    }
    processor.onEnd({ name, attributes });

    expect(info).not.toHaveBeenCalled();
  });

  it("does not register a logger while the flag is off", async () => {
    vi.resetModules();
    stubRequiredEnvironment();
    vi.stubEnv("WORKFLOW_RESUME_TIMING", "off");
    const { default: timing } =
      await import("@/agent/instrumentation/workflow-resume-timing");
    expect("spanProcessors" in timing).toBe(false);
  });
});
