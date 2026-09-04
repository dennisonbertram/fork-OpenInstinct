import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { MessageStreamEvent } from "eve/client";
import type { EveEval, EveEvalResult, EveEvalRunSummary } from "eve/evals";

type StepCompletedEvent = Extract<
  MessageStreamEvent,
  { type: "step.completed" }
>;
type StepStartedEvent = Extract<MessageStreamEvent, { type: "step.started" }>;
type MessageReceivedEvent = Extract<
  MessageStreamEvent,
  { type: "message.received" }
>;

function stepCompletedEvent(at: string, costUsd: number): StepCompletedEvent {
  return {
    data: {
      finishReason: "stop",
      sequence: 0,
      stepIndex: 0,
      turnId: "t1",
      usage: { costUsd },
    },
    meta: { at, id: at },
    type: "step.completed",
  };
}

function stepStartedEvent(at: string, modelId: string): StepStartedEvent {
  return {
    data: { modelId, sequence: 0, stepIndex: 0, turnId: "t1" },
    meta: { at, id: at },
    type: "step.started",
  };
}

function messageReceivedEvent(at: string): MessageReceivedEvent {
  return {
    data: { message: "hi", sequence: 0, turnId: "t1" },
    meta: { at, id: at },
    type: "message.received",
  };
}

function makeCase(id: string, toolNames: readonly string[]): EveEvalResult {
  const events: MessageStreamEvent[] = [
    messageReceivedEvent("2026-09-03T10:00:00.000Z"),
    stepStartedEvent("2026-09-03T10:00:00.100Z", "openai/gpt-5.6-sol"),
    stepCompletedEvent("2026-09-03T10:00:01.000Z", 0.01),
    stepCompletedEvent("2026-09-03T10:00:02.000Z", 0.02),
  ];
  return {
    assertions: [],
    completedAt: "2026-09-03T10:00:03.000Z",
    id,
    result: {
      derived: {
        inputRequests: [],
        messageCount: 1,
        parked: false,
        reasoningBlockCount: 0,
        subagentCallCount: 0,
        subagentCalls: [],
        toolCallCount: toolNames.length,
        toolCalls: toolNames.map((name) => ({
          input: {},
          name,
          output: undefined,
          status: "completed",
          turnIndex: 0,
        })),
      },
      events,
      finalMessage: "Here's your answer.\n\nAnything else?",
      output: null,
      status: "completed",
      traceContexts: [],
    },
    startedAt: "2026-09-03T10:00:00.000Z",
    verdict: "passed",
  };
}

function evaluation(id: string, tags: readonly string[]): EveEval {
  return { _tag: "EveEval", id, tags, test: () => undefined };
}

const artifactSchema = z.object({
  cases: z.array(
    z.object({
      bubbles: z.number(),
      costUsd: z.number().nullable(),
      id: z.string(),
      modelIds: z.array(z.string()),
      toolCalls: z.record(z.string(), z.number()),
    })
  ),
});

const targetStub = {
  capabilities: { devRoutes: false },
  kind: "local" as const,
  url: "http://127.0.0.1",
};

describe("squareEvalReporter", () => {
  let directory: string;
  let originalCwd: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "square-reporter-"));
    originalCwd = process.cwd();
    process.chdir(directory);
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("writes observed model IDs, cost, and tool calls per case to the JSON artifact", async () => {
    const { squareEvalReporter } = await import("../square-reporter");

    const evaluations = [
      evaluation("square/square/0000", ["square"]),
      evaluation("browser/browser/0000", ["browser"]),
    ];
    await squareEvalReporter.onRunStart(evaluations, targetStub);

    const squareResult = makeCase("square/square/0000", [
      "square__SearchOrders",
      "square__SearchOrders",
      "send_message",
      "send_message",
    ]);
    const browserResult = makeCase("browser/browser/0000", ["kernel__click"]);
    await squareEvalReporter.onEvalComplete(squareResult);
    await squareEvalReporter.onEvalComplete(browserResult);

    const summary: EveEvalRunSummary = {
      completedAt: "2026-09-03T10:00:03.000Z",
      errored: 0,
      failed: 0,
      passed: 2,
      results: [squareResult, browserResult],
      scored: 0,
      skipped: 0,
      startedAt: "2026-09-03T10:00:00.000Z",
      target: targetStub,
    };

    await squareEvalReporter.onRunComplete(summary);

    const raw = await readFile(
      join(directory, ".eve", "square-evals", "latest.json"),
      "utf8"
    );
    const parsed = artifactSchema.parse(JSON.parse(raw));

    expect(parsed.cases).toHaveLength(1);
    const [square] = parsed.cases;
    expect(square?.id).toBe("square/square/0000");
    expect(square?.costUsd).toBeCloseTo(0.03);
    expect(square?.modelIds).toEqual(["openai/gpt-5.6-sol"]);
    expect(square?.toolCalls).toEqual({
      send_message: 2,
      square__SearchOrders: 2,
    });
    expect(square?.bubbles).toBe(2);
  });

  it("omits duration from the GITHUB_STEP_SUMMARY table", async () => {
    const summaryPath = join(directory, "summary.md");
    vi.stubEnv("GITHUB_STEP_SUMMARY", summaryPath);
    const { squareEvalReporter } = await import("../square-reporter");

    const evaluations = [evaluation("square/square/0000", ["square"])];
    await squareEvalReporter.onRunStart(evaluations, targetStub);
    const result = makeCase("square/square/0000", ["square__SearchOrders"]);
    await squareEvalReporter.onEvalComplete(result);

    const summary: EveEvalRunSummary = {
      completedAt: "2026-09-03T10:00:03.000Z",
      errored: 0,
      failed: 0,
      passed: 1,
      results: [result],
      scored: 0,
      skipped: 0,
      startedAt: "2026-09-03T10:00:00.000Z",
      target: targetStub,
    };

    await squareEvalReporter.onRunComplete(summary);

    const table = await readFile(summaryPath, "utf8");
    expect(table).toContain("Cost");
    expect(table).toContain("Tool calls");
    expect(table).toContain("Bubbles");
    expect(table).not.toContain("Duration");
    expect(table).not.toContain("duration");
  });
});
