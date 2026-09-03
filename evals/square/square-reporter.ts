import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EveEval, EveEvalResult, EveEvalRunSummary } from "eve/evals";
import type { EvalReporter } from "eve/evals/reporters";
import { splitLinqReply } from "@/agent/lib/linq/reply";
import { squareEvalEnv } from "@/evals/square/env";
import { measureWorkerTask } from "@/lib/worker-events";

interface SquareCaseReport {
  readonly id: string;
  readonly costUsd: number | null;
  readonly toolCalls: Record<string, number>;
  readonly bubbles: number;
  readonly durationMs: number;
}

const squareEvalIds = new Set<string>();
const reports = new Map<string, SquareCaseReport>();

function isSquareEval(evaluation: EveEval) {
  return evaluation.tags?.includes("square") ?? false;
}

function elapsedMs(start: string, end: string) {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function summarize(result: EveEvalResult): SquareCaseReport {
  const durationMs = elapsedMs(result.startedAt, result.completedAt);
  const metrics = measureWorkerTask(result.result.events, durationMs);
  const toolCalls = result.result.derived.toolCalls.reduce<
    Record<string, number>
  >((counts, call) => {
    counts[call.name] = (counts[call.name] ?? 0) + 1;
    return counts;
  }, {});
  const bubbles = splitLinqReply(result.result.finalMessage ?? "").length;
  return {
    bubbles,
    costUsd: metrics.costUsd,
    durationMs: metrics.durationMs,
    id: result.id,
    toolCalls,
  };
}

function formatToolCalls(toolCalls: Record<string, number>) {
  const entries = Object.entries(toolCalls).map(
    ([name, count]) => `${name}×${String(count)}`
  );
  return entries.length === 0 ? "—" : entries.join(", ");
}

function formatCost(costUsd: number | null) {
  return costUsd === null ? "—" : `$${costUsd.toFixed(6)}`;
}

/**
 * Reports Square eval gym results: cost, tool calls, and iMessage bubble
 * count per case (R8, AE6, KTD3). Only processes evals tagged "square", so
 * it ignores browser benchmark evals sharing the same eve run.
 */
export const squareEvalReporter: EvalReporter = {
  async onEvalComplete(result) {
    if (!squareEvalIds.has(result.id)) return;
    reports.set(result.id, summarize(result));
  },
  async onRunComplete(summary: EveEvalRunSummary) {
    if (squareEvalIds.size === 0) return;
    const cases = summary.results
      .filter((result) => squareEvalIds.has(result.id))
      .map((result) => reports.get(result.id) ?? summarize(result));

    const directory = join(process.cwd(), ".eve", "square-evals");
    await mkdir(directory, { recursive: true });
    const payload = `${JSON.stringify(
      { cases, completedAt: summary.completedAt, startedAt: summary.startedAt },
      null,
      2
    )}\n`;
    const timestamp = summary.startedAt.replaceAll(":", "-");
    await writeFile(join(directory, `${timestamp}.json`), payload, "utf8");
    await writeFile(join(directory, "latest.json"), payload, "utf8");

    const summaryPath = squareEvalEnv.GITHUB_STEP_SUMMARY;
    if (!summaryPath) return;
    const rows = cases
      .map(
        (c) =>
          `| ${c.id} | ${formatCost(c.costUsd)} | ${formatToolCalls(c.toolCalls)} | ${String(c.bubbles)} |`
      )
      .join("\n");
    const table = `\n## Square eval gym\n\n| Case | Cost | Tool calls | Bubbles |\n| --- | --- | --- | --- |\n${rows}\n`;
    await appendFile(summaryPath, table, "utf8");
  },
  async onRunStart(evaluations) {
    squareEvalIds.clear();
    reports.clear();
    for (const evaluation of evaluations) {
      if (isSquareEval(evaluation)) squareEvalIds.add(evaluation.id);
    }
  },
};
