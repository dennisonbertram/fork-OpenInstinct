import { describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import type { MessageStreamEvent } from "eve/client";
import type { EveEvalResult } from "eve/evals";
import {
  beginManifestAttempt,
  createEvalRunManifest,
  fixtureClockFromJson,
  manifestCaseFromResult,
  manifestCostStatus,
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
          event("step.started", "2026-09-04T10:00:00.100Z", {
            modelId: "openai/gpt-5.6-sol",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          }),
          event("step.completed", "2026-09-04T10:00:01.000Z", {
            finishReason: "stop",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
            usage: { costUsd: 0.01 },
          }),
          event("step.completed", "2026-09-04T10:00:02.000Z", {
            finishReason: "stop",
            sequence: 1,
            stepIndex: 1,
            turnId: "turn-1",
          }),
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
    expect(result.costStatus).toBe("unknown");
    expect(result.costUsd).toBeNull();
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
      const manifest = JSON.parse(await readFile(path, "utf8")) as {
        aggregate: { attempts: number };
        provenance: { clock: { fixture: unknown } };
      };
      expect(manifest.aggregate.attempts).toBe(1);
      expect(manifest.provenance.clock.fixture).toEqual({
        asOf: "2099-01-15T15:00:00Z",
        timezone: "America/New_York",
      });
      await expect(manifestCostStatus(path)).resolves.toEqual({
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
});

function event<T extends MessageStreamEvent["type"]>(
  type: T,
  at: string,
  data: Extract<MessageStreamEvent, { type: T }> extends infer Event
    ? Event extends { data: infer Data }
      ? Data
      : never
    : never
) {
  return { data, meta: { at, id: at }, type } as unknown as Extract<
    MessageStreamEvent,
    { type: T }
  >;
}
