import { describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import type { MessageStreamEvent } from "eve/client";
import type { EveEvalResult } from "eve/evals";
import {
  beginManifestAttempt,
  createEvalRunManifest,
  fixtureClockFromJson,
  manifestCaseFromResult,
  manifestCostStatus,
  readEvalRunManifest,
  recordManifestCase,
} from "@/evals/run-manifest";

describe("eval run manifest", () => {
  it("keeps observed model IDs while marking partial cost and delivery timing unknown", () => {
    const result = manifestCaseFromResult({
      assertions: [],
      completedAt: "2026-09-04T10:00:03.000Z",
      id: "agent/conversation/0000",
      result: {
        derived: {
          inputRequests: [],
          messageCount: 1,
          parked: false,
          reasoningBlockCount: 0,
          subagentCallCount: 0,
          subagentCalls: [],
          toolCallCount: 0,
          toolCalls: [],
        },
        events: [
          stepStartedEvent("2026-09-04T10:00:00.100Z"),
          stepStartedEvent("2026-09-04T10:00:00.200Z", 1),
          stepCompletedEvent("2026-09-04T10:00:01.000Z", 0, 0.01),
        ],
        finalMessage: "Done.",
        output: null,
        status: "completed",
        traceContexts: [],
      },
      startedAt: "2026-09-04T10:00:00.000Z",
      verdict: "passed",
    });

    expect(result.modelIds).toEqual(["openai/gpt-5.6-sol"]);
    expect(result.cost.actor).toEqual({
      knownCostUsd: 0.01,
      status: "partial",
    });
    expect(result.cost.total).toEqual({
      knownCostUsd: 0.01,
      status: "unknown",
    });
    expect(result.timing).toEqual({
      finalDeliveryMs: null,
      firstDeliveredBubbleMs: null,
      status: "not-observable-from-eve-events",
      totalEvalMs: 3_000,
    });
  });

  it("treats an attempt with no reporter result as unknown cost", async () => {
    const path = await createEvalRunManifest({
      caseDirectory: "evals/agent",
      effectiveArguments: ["--tag", "smoke"],
      estimatedCostUsd: 0.25,
      fixtureClock: {
        asOf: "2099-01-15T15:00:00Z",
        timezone: "America/New_York",
      },
      judgeModel: "openai/gpt-5.4-mini",
      maxConcurrency: 1,
      maxCostUsd: 1,
      mode: "agent",
      reasoning: "low",
      repetitions: 2,
      repositoryRoot: process.cwd(),
      requestedModel: null,
      timeoutMs: 180_000,
    });
    try {
      await beginManifestAttempt(path);
      const manifest = await readEvalRunManifest(path);
      expect(manifest.aggregate.attempts).toBe(1);
      expect(manifest.provenance.clock.fixture).toEqual({
        asOf: "2099-01-15T15:00:00Z",
        timezone: "America/New_York",
      });
      expect(manifest.configuration).toMatchObject({
        budget: { estimatedCostUsd: 0.25, maxCostUsd: 1 },
        effectiveArguments: ["--tag", "smoke"],
        maxConcurrency: 1,
        timeoutMs: 180_000,
      });
      await expect(manifestCostStatus(path)).resolves.toEqual({
        actorCostUnaccountable: true,
        attemptsStarted: 1,
        knownActorCostUsd: 0,
        knownCostUsd: 0,
        unknown: true,
      });
    } finally {
      await rm(path, { force: true });
    }
  });

  it("reads the fixture's pinned as-of timestamp and timezone", () => {
    expect(
      fixtureClockFromJson({
        clock: {
          asOf: "2099-01-15T15:00:00Z",
          timezone: "America/New_York",
        },
      })
    ).toEqual({
      asOf: "2099-01-15T15:00:00Z",
      timezone: "America/New_York",
    });
  });

  it("retains concurrent per-case completions in one attempt", async () => {
    const path = await createEvalRunManifest({
      caseDirectory: "evals/agent",
      effectiveArguments: ["--tag", "smoke"],
      estimatedCostUsd: 0.25,
      fixtureClock: null,
      judgeModel: "openai/gpt-5.4-mini",
      maxConcurrency: 8,
      maxCostUsd: 1,
      mode: "square",
      reasoning: "low",
      repetitions: 1,
      repositoryRoot: process.cwd(),
      requestedModel: null,
      timeoutMs: 180_000,
    });
    try {
      const attemptId = await beginManifestAttempt(path);
      await Promise.all([
        recordManifestCase(
          path,
          attemptId,
          completedResult("square/square/0000")
        ),
        recordManifestCase(
          path,
          attemptId,
          completedResult("square/square/0001")
        ),
      ]);
      const manifest = await readEvalRunManifest(path);
      expect(
        manifest.attempts[0]?.cases.map((item) => item.id).toSorted()
      ).toEqual(["square/square/0000", "square/square/0001"]);
    } finally {
      await rm(path, { force: true });
    }
  });
});

function completedResult(id: string): EveEvalResult {
  return {
    assertions: [],
    completedAt: "2026-09-04T10:00:01.000Z",
    id,
    result: {
      derived: {
        inputRequests: [],
        messageCount: 0,
        parked: false,
        reasoningBlockCount: 0,
        subagentCallCount: 0,
        subagentCalls: [],
        toolCallCount: 0,
        toolCalls: [],
      },
      events: [],
      finalMessage: "Done.",
      output: null,
      status: "completed",
      traceContexts: [],
    },
    startedAt: "2026-09-04T10:00:00.000Z",
    verdict: "passed",
  };
}

function stepStartedEvent(
  at: string,
  stepIndex = 0
): Extract<MessageStreamEvent, { type: "step.started" }> {
  return {
    data: {
      modelId: "openai/gpt-5.6-sol",
      sequence: stepIndex,
      stepIndex,
      turnId: "turn-1",
    },
    meta: { at, id: at },
    type: "step.started",
  };
}

function stepCompletedEvent(
  at: string,
  sequence: number,
  costUsd?: number
): Extract<MessageStreamEvent, { type: "step.completed" }> {
  const data: Extract<MessageStreamEvent, { type: "step.completed" }>["data"] =
    {
      finishReason: "stop",
      sequence,
      stepIndex: sequence,
      turnId: "turn-1",
    };
  if (costUsd !== undefined) data.usage = { costUsd };
  return {
    data,
    meta: { at, id: at },
    type: "step.completed",
  };
}
