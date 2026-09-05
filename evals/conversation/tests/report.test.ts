import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  makeTrialManifest,
  readTrial,
  writeReport,
  writeTrial,
  type BudgetSnapshot,
} from "@/evals/conversation/report";

const directories: string[] = [];
async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "jory-report-test-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});
const budget: BudgetSnapshot = {
  budgetUsd: 10,
  verifiedNativeBudget: null,
  searchHeadroomUsd: null,
  chargedOrReservedUsd: 0,
  poisoned: false,
  requests: [],
};

describe("conversation report evidence", () => {
  it("creates all63 pending independent records", () => {
    const records = makeTrialManifest();
    expect(records).toHaveLength(63);
    expect(new Set(records.map((record) => record.key)).size).toBe(63);
    expect(records.filter((record) => record.pack === "core")).toHaveLength(36);
    expect(records.filter((record) => record.pack === "square")).toHaveLength(
      27
    );
    expect(records.every((record) => record.status === "pending")).toBe(true);
    expect(records[0]?.turns).not.toBe(records[1]?.turns);
  });
  it("preserves failures, blocked records, literal transcripts and evidence boundaries", async () => {
    const directory = await temporaryDirectory();
    const records = makeTrialManifest();
    const first = records[0];
    const second = records[1];
    if (!first || !second) throw new Error("Missing manifest records");
    first.status = "failed";
    first.reason = "Provider stopped";
    second.status = "blocked";
    second.reason = "Budget exhausted";
    first.turns.push({
      user: "<script>alert(1)</script>\n# fake heading",
      turn: 1,
      startedAt: "2026-09-05T10:00:00Z",
      elapsedMs: 42,
      status: "failed",
      text: "hello",
      messages: ["hello\n```\n<script>test</script>"],
      toolCalls: [],
      modelText: "[DONE]",
      reactions: ["👍"],
    });
    await writeTrial(directory, first);
    await writeReport(directory, {
      provenance: { sha: "test-sha", instructionsHash: "unchanged" },
      budget,
      records,
    });
    const markdown = await readFile(join(directory, "report.md"), "utf8");
    expect(markdown).toContain("| core | 36 | 34 | 0 | 0 | 1 | 1 |");
    expect(markdown).toContain("| square | 27 | 27 | 0 | 0 | 0 | 0 |");
    expect(markdown).toContain(
      "    <script>alert(1)</script>\n    # fake heading"
    );
    expect(markdown).toContain("Internal model output");
    expect(markdown).toContain("not visible-response latency");
    expect(markdown).toContain(
      "recipient receipt, and visible-response latency are **unobserved**"
    );
    expect(markdown).toContain("uncalibrated");
    const summary = await readFile(join(directory, "summary.json"), "utf8");
    expect(summary).toContain('"reason": "Budget exhausted"');
    expect(summary).toContain('"reason": "Provider stopped"');
    const sample = await readFile(join(directory, "review-sample.md"), "utf8");
    expect(sample).toContain(first.key);
    expect(sample).toContain(second.key);
    expect(sample).toContain("SQ-");
    expect(sample).toContain("not baseline/candidate pairs");
    expect(
      await readFile(join(directory, "trials", `${first.key}.json`), "utf8")
    ).toContain('"status": "failed"');
  });
  it("separates reported cost from unresolved reservation", async () => {
    const directory = await temporaryDirectory();
    const records = makeTrialManifest();
    const first = records[0];
    if (!first) throw new Error("Missing trial");
    await writeReport(directory, {
      provenance: {},
      records,
      budget: {
        ...budget,
        chargedOrReservedUsd: 0.95,
        requests: [
          {
            id: 0,
            runId: "earlier-run",
            trialKey: first.key,
            stage: "agent",
            model: "test",
            costUsd: 0.7,
            reservedUsd: 0.7,
            status: "reconciled",
          },
          {
            id: 1,
            runId: basename(directory),
            trialKey: first.key,
            stage: "agent",
            model: "test",
            costUsd: 0.05,
            reservedUsd: 0.1,
            status: "reconciled",
          },
          {
            id: 2,
            runId: basename(directory),
            trialKey: first.key,
            stage: "judge",
            model: "test",
            costUsd: null,
            reservedUsd: 0.2,
            status: "uncertain",
          },
        ],
      },
    });
    const markdown = await readFile(join(directory, "report.md"), "utf8");
    expect(markdown).toContain(
      "Provider-reported cost: $0.050000 across 2 requests. Unreconciled reservation: $0.200000."
    );
    expect(markdown).toContain("Earlier runs: $0.700000. This run: $0.250000.");
  });
  it("rejects traversal keys and symlink destinations", async () => {
    const directory = await temporaryDirectory();
    const records = makeTrialManifest();
    const first = records[0];
    if (!first) throw new Error("Missing trial");
    await expect(
      writeTrial(directory, { ...first, key: "../outside" })
    ).rejects.toThrow("Invalid trial key");
    const destination = join(directory, "linked");
    await symlink(directory, destination);
    await expect(writeTrial(destination, first)).rejects.toThrow(
      "not a symlink"
    );
  });
  it("validates persisted records and rejects mismatched identities", async () => {
    const directory = await temporaryDirectory();
    const first = makeTrialManifest()[0];
    if (!first) throw new Error("Missing trial");
    await writeTrial(directory, first);
    expect(await readTrial(directory, first.key)).toEqual(first);
    await writeFile(
      join(directory, "trials", `${first.key}.json`),
      JSON.stringify({ ...first, status: "imaginary" })
    );
    await expect(readTrial(directory, first.key)).rejects.toThrow(
      "Invalid option"
    );
    await writeFile(
      join(directory, "trials", `${first.key}.json`),
      JSON.stringify({ ...first, trial: 2 })
    );
    await expect(readTrial(directory, first.key)).rejects.toThrow("identity");
    await expect(readTrial(directory, "../outside")).rejects.toThrow(
      "Invalid trial key"
    );
  });
  it("renders quality tables with applicable denominators and separate N/A", async () => {
    const directory = await temporaryDirectory();
    const records = makeTrialManifest();
    const first = records[0];
    const second = records[1];
    if (!first || !second) throw new Error("Missing trials");
    first.judge = {
      status: "uncalibrated",
      ratings: [
        { dimension: "personality", score: 4, reason: "Fits tone", turns: [1] },
      ],
    };
    second.judge = {
      status: "uncalibrated",
      ratings: [
        {
          dimension: "personality",
          score: null,
          reason: "No opportunity",
          turns: [1],
        },
      ],
    };
    await writeReport(directory, { provenance: {}, budget, records });
    const markdown = await readFile(join(directory, "report.md"), "utf8");
    expect(markdown).toContain("| personality | 6 | 1 | 1 | 4 | 4.00 |");
    expect(markdown.indexOf("| square | 0 | 0 | 27")).toBeLessThan(
      markdown.indexOf("Advisory quality coverage for core")
    );
    expect(markdown).toContain("## Complete trial evidence");
  });
  it("preserves tool results and failed-turn evidence across disk reloads", async () => {
    const directory = await temporaryDirectory();
    const record = makeTrialManifest()[0];
    if (!record) throw new Error("Missing trial");
    record.status = "failed";
    record.turns.push({
      user: "Check the order",
      turn: 1,
      startedAt: "2026-09-05T10:00:00Z",
      elapsedMs: 100,
      status: "waiting",
      error: "The model request failed",
      text: "",
      messages: [],
      toolCalls: [
        {
          name: "square__RetrieveOrder",
          status: "failed",
          input: { orderId: "synthetic" },
          output: { isError: true, error: { code: "SERVICE_UNAVAILABLE" } },
        },
      ],
    });
    await writeTrial(directory, record);
    const restored = await readTrial(directory, record.key);
    expect(restored).toEqual(record);
    expect(restored.turns[0]?.toolCalls[0]?.output).toEqual({
      isError: true,
      error: { code: "SERVICE_UNAVAILABLE" },
    });
    await writeReport(directory, {
      provenance: {},
      budget,
      records: [restored],
    });
    const markdown = await readFile(join(directory, "report.md"), "utf8");
    expect(markdown).toContain(
      "Turn error (a waiting state does not mean success):"
    );
    expect(markdown).toContain("    The model request failed");
    expect(markdown).toContain('"code": "SERVICE_UNAVAILABLE"');
  });
});
