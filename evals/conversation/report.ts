/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- Provenance is authored run metadata; values are serialized as data, never executed. */
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { startBudgetGateway } from "@/evals/conversation/budget";
import {
  conversationCases,
  type ConversationCase,
} from "@/evals/conversation/cases";

const turnRecordSchema = z.object({
  user: z.string(),
  turn: z.number().int().positive(),
  startedAt: z.string(),
  elapsedMs: z.number().nonnegative(),
  sessionId: z.string().optional(),
  status: z.string(),
  error: z.string().optional(),
  text: z.string(),
  messages: z.array(z.string()),
  toolCalls: z.array(
    z.object({
      name: z.string(),
      input: z.unknown().optional(),
      output: z.json().optional(),
      status: z.string(),
    })
  ),
  modelText: z.string().optional(),
  events: z.array(z.unknown()).optional(),
  reactions: z.array(z.string()).optional(),
  clientContext: z.unknown().optional(),
});
const judgeSchema = z.object({
  status: z.enum(["pending", "uncalibrated", "error", "ungraded"]),
  ratings: z
    .array(
      z.object({
        dimension: z.string(),
        score: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.null(),
        ]),
        reason: z.string(),
        turns: z.array(z.number().int().positive()),
      })
    )
    .optional(),
  outcomes: z
    .array(
      z.object({
        criterion: z.string(),
        pass: z.boolean().nullable(),
        reason: z.string(),
        turns: z.array(z.number().int().positive()),
      })
    )
    .optional(),
  error: z.string().optional(),
});
const trialRecordSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]+$/u),
  caseId: z.string(),
  variant: z.string(),
  pack: z.enum(["core", "square"]),
  trial: z.number().int().min(1).max(3),
  status: z.enum(["pending", "running", "completed", "failed", "blocked"]),
  reason: z.string().optional(),
  turns: z.array(turnRecordSchema),
  checks: z.array(
    z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })
  ),
  judge: judgeSchema,
});
export type TrialRecord = z.infer<typeof trialRecordSchema>;
export type BudgetSnapshot = ReturnType<
  Awaited<ReturnType<typeof startBudgetGateway>>["snapshot"]
>;
export interface ConversationReport {
  provenance: Record<string, unknown>;
  budget: BudgetSnapshot;
  records: readonly TrialRecord[];
}

export function makeTrialManifest(
  cases: readonly ConversationCase[] = conversationCases
): TrialRecord[] {
  return cases.flatMap((c) =>
    [1, 2, 3].map((trial) => ({
      key: `${c.id}-${c.variant}-${String(trial)}`,
      caseId: c.id,
      variant: c.variant,
      pack: c.pack,
      trial,
      status: "pending",
      turns: [],
      checks: [],
      judge: { status: "pending" },
    }))
  );
}

async function ensureDirectory(path: string) {
  await mkdir(path, { recursive: true });
  const state = await lstat(path);
  if (!state.isDirectory() || state.isSymbolicLink())
    throw new Error("Report destination must be a directory, not a symlink");
}
async function atomicWrite(directory: string, name: string, content: string) {
  if (!/^[a-zA-Z0-9_.-]+$/u.test(name))
    throw new Error("Invalid report filename");
  await ensureDirectory(directory);
  const temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await rename(temporary, join(directory, name));
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function writeTrial(
  outputDir: string,
  record: TrialRecord
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]+$/u.test(record.key))
    throw new Error("Invalid trial key");
  await ensureDirectory(outputDir);
  await atomicWrite(
    join(outputDir, "trials"),
    `${record.key}.json`,
    JSON.stringify(record, null, 2) + "\n"
  );
}
export async function readTrial(
  outputDir: string,
  key: string
): Promise<TrialRecord> {
  if (!/^[a-zA-Z0-9_-]+$/u.test(key)) throw new Error("Invalid trial key");
  const path = join(outputDir, "trials", `${key}.json`);
  const state = await lstat(path);
  if (!state.isFile() || state.isSymbolicLink())
    throw new Error("Trial record must be a regular file, not a symlink");
  const parsed = trialRecordSchema.parse(
    JSON.parse(await readFile(path, "utf8"))
  );
  if (
    parsed.key !== key ||
    parsed.key !== `${parsed.caseId}-${parsed.variant}-${String(parsed.trial)}`
  )
    throw new Error("Trial record identity does not match its filename");
  return parsed;
}
const literal = (value: string) =>
  value
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
const cell = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("\n", " ");
const usd = (value: number) => `$${value.toFixed(6)}`;
function costFor(record: TrialRecord, budget: BudgetSnapshot, runId: string) {
  const rows = budget.requests.filter(
    (row) => row.trialKey === record.key && row.runId === runId
  );
  return {
    reportedUsd: rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
    reservedUnknownUsd: rows
      .filter((row) => row.costUsd === null)
      .reduce((sum, row) => sum + row.reservedUsd, 0),
    requests: rows.length,
  };
}
function trialMarkdown(
  record: TrialRecord,
  budget: BudgetSnapshot,
  runId: string
): string {
  const costs = costFor(record, budget, runId);
  const result = [
    `### ${cell(record.key)}`,
    "",
    `Execution: ${record.status}. Judge: ${record.judge.status}; automated quality judgments are uncalibrated.`,
    "",
    `Provider-reported cost: ${usd(costs.reportedUsd)} across ${String(costs.requests)} requests. Unreconciled reservation: ${usd(costs.reservedUnknownUsd)}.`,
    "",
    "Delivery: completed message requests are shown below. Channel acceptance, visible web rendering, recipient receipt, and visible-response latency are **unobserved**.",
    "",
  ];
  if (record.reason)
    result.push("Execution reason:", "", literal(record.reason), "");
  if (record.turns.length === 0)
    result.push("No conversation turns were captured.", "");
  for (const turn of record.turns) {
    result.push(
      `#### Turn ${String(turn.turn)}`,
      "",
      `Runner status: ${cell(turn.status)}. Started: ${cell(turn.startedAt)}. Runner-observed elapsed time: ${String(turn.elapsedMs)} ms (not visible-response latency).`,
      "",
      "User:",
      "",
      literal(turn.user),
      ""
    );
    if (turn.error)
      result.push(
        "Turn error (a waiting state does not mean success):",
        "",
        literal(turn.error),
        ""
      );
    for (const [index, message] of turn.messages.entries())
      result.push(
        `Completed message request ${String(index + 1)}:`,
        "",
        literal(message),
        ""
      );
    if (turn.messages.length === 0)
      result.push("No completed text-message request captured.", "");
    for (const reaction of turn.reactions ?? [])
      result.push("Reaction request:", "", literal(reaction), "");
    if (turn.modelText)
      result.push(
        "Internal model output (may contain completion markers; not a delivered message):",
        "",
        literal(turn.modelText),
        ""
      );
    if (turn.toolCalls.length)
      result.push(
        "Tool evidence (synthetic isolated execution):",
        "",
        literal(JSON.stringify(turn.toolCalls, null, 2)),
        ""
      );
  }
  result.push("Deterministic content and boundary checks:", "");
  if (record.checks.length === 0)
    result.push("Ungraded; no checks captured.", "");
  else
    for (const check of record.checks)
      result.push(
        `- ${check.pass ? "PASS" : "FAIL"}: ${cell(check.name)}. ${cell(check.detail)}`
      );
  result.push("", "Automated semantic outcomes (uncalibrated):", "");
  if (!record.judge.outcomes?.length)
    result.push("No semantic outcome judgments available.");
  for (const outcome of record.judge.outcomes ?? [])
    result.push(
      `- ${outcome.pass === null ? "UNOBSERVED" : outcome.pass ? "PASS" : "FAIL"}: ${cell(outcome.criterion)}; turns ${outcome.turns.map(String).join(", ")}. ${cell(outcome.reason)}`
    );
  result.push("", "Automated quality ratings (uncalibrated, advisory):", "");
  if (!record.judge.ratings?.length)
    result.push("No quality ratings available.");
  for (const rating of record.judge.ratings ?? [])
    result.push(
      `- ${cell(rating.dimension)}: ${rating.score === null ? "N/A" : String(rating.score)}; turns ${rating.turns.map(String).join(", ")}. ${cell(rating.reason)}`
    );
  if (record.judge.error)
    result.push("", "Judge error:", "", literal(record.judge.error));
  result.push(
    "",
    "Human review: pending. No human calibration or preference agreement measured.",
    ""
  );
  return result.join("\n");
}
function counts(records: readonly TrialRecord[]) {
  return ["pending", "running", "completed", "failed", "blocked"].map(
    (status) =>
      String(records.filter((record) => record.status === status).length)
  );
}
function reviewRecords(records: readonly TrialRecord[]) {
  const ordered = [...records].toSorted((a, b) => a.key.localeCompare(b.key));
  const selected: TrialRecord[] = [];
  const add = (record: TrialRecord | undefined) => {
    if (record && !selected.some((existing) => existing.key === record.key))
      selected.push(record);
  };
  // Include both packs and each observed execution status before filling a stable scenario spread.
  for (const pack of ["core", "square"] as const)
    for (const status of [
      "failed",
      "blocked",
      "completed",
      "running",
      "pending",
    ] as const)
      add(
        ordered.find(
          (record) => record.pack === pack && record.status === status
        )
      );
  for (const pack of ["core", "square"] as const)
    add(
      ordered.find(
        (record) =>
          record.pack === pack && record.checks.some((check) => !check.pass)
      )
    );
  for (const record of ordered) {
    if (selected.length >= 12) break;
    if (!selected.some((existing) => existing.caseId === record.caseId))
      add(record);
  }
  return selected;
}
const runCost = (rows: BudgetSnapshot["requests"]) =>
  rows.reduce((sum, row) => sum + (row.costUsd ?? row.reservedUsd), 0);
export async function writeReport(
  outputDir: string,
  report: ConversationReport
): Promise<void> {
  const { records, budget, provenance } = report;
  if (new Set(records.map((record) => record.key)).size !== records.length)
    throw new Error("Duplicate trial records");
  await ensureDirectory(outputDir);
  const header = [
    "# Jory conversation baseline",
    "",
    "This is an exploratory baseline. Execution completion does not imply task correctness, delivery, or quality success. Automated judgments are uncalibrated; human review is pending.",
    "",
    "## Execution counts",
    "",
    "| Pack | Scheduled | Pending | Running | Completed | Failed | Blocked |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const pack of ["core", "square"] as const) {
    const group = records.filter((record) => record.pack === pack);
    header.push(
      `| ${pack} | ${String(group.length)} | ${counts(group).join(" | ")} |`
    );
  }
  header.push(
    `| total | ${String(records.length)} | ${counts(records).join(" | ")} |`,
    "",
    "## Cost and provenance",
    "",
    `Authorized cap: ${usd(budget.budgetUsd)}. Charged or conservatively reserved: ${usd(budget.chargedOrReservedUsd)}. Budget accounting blocked by uncertainty: ${String(budget.poisoned)}. Unreconciled reservations are not measured provider charges.`,
    "",
    literal(JSON.stringify(provenance, null, 2)),
    "",
    ""
  );
  header.push(
    "## Content checks and quality coverage",
    "",
    "These counts remain separate from execution status. Passing deterministic assertions is not a complete semantic correctness judgment.",
    "",
    "| Pack | All observed checks pass | Any check fails | No checks | Uncalibrated judges | Judge errors | Pending/ungraded judges |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const pack of ["core", "square"] as const) {
    const group = records.filter((record) => record.pack === pack);
    const tally = [
      group.filter(
        (record) =>
          record.checks.length > 0 && record.checks.every((check) => check.pass)
      ).length,
      group.filter((record) => record.checks.some((check) => !check.pass))
        .length,
      group.filter((record) => record.checks.length === 0).length,
      group.filter((record) => record.judge.status === "uncalibrated").length,
      group.filter((record) => record.judge.status === "error").length,
      group.filter((record) =>
        ["pending", "ungraded"].includes(record.judge.status)
      ).length,
    ];
    header.push(`| ${pack} | ${tally.map(String).join(" | ")} |`);
  }
  for (const pack of ["core", "square"] as const) {
    const group = records.filter((record) => record.pack === pack);
    const ratings = group.flatMap((record) => record.judge.ratings ?? []);
    header.push(
      "",
      `Advisory quality coverage for ${pack} (${String(group.length)} scheduled trials):`,
      ""
    );
    if (ratings.length === 0)
      header.push("No dimension ratings available.", "");
    else {
      header.push(
        "| Dimension | Applicable trials | Rated trials | N/A | Missing | Mean (uncalibrated) |",
        "| --- | ---: | ---: | ---: | ---: | ---: |"
      );
      for (const dimension of [
        ...new Set(ratings.map((rating) => rating.dimension)),
      ].toSorted()) {
        const applicable = group.filter((record) =>
          conversationCases.some(
            (c) =>
              c.id === record.caseId &&
              c.variant === record.variant &&
              c.dimensions.includes(dimension)
          )
        ).length;
        const matching = ratings.filter(
          (rating) => rating.dimension === dimension
        );
        const values = matching.flatMap((rating) =>
          rating.score === null ? [] : [rating.score]
        );
        const mean =
          values.length > 0
            ? (
                values.reduce((sum, score) => sum + score, 0) / values.length
              ).toFixed(2)
            : "N/A";
        header.push(
          `| ${cell(dimension)} | ${String(applicable)} | ${String(values.length)} | ${String(matching.length - values.length)} | ${String(Math.max(0, applicable - matching.length))} | ${mean} |`
        );
      }
      header.push("");
    }
  }
  header.push("", "## Complete trial evidence", "");
  const previous = budget.requests.filter(
    (row) => row.runId !== basename(outputDir)
  );
  const current = budget.requests.filter(
    (row) => row.runId === basename(outputDir)
  );
  header.push(
    "",
    `Cumulative goal spending/reservations: ${usd(budget.chargedOrReservedUsd)}. Earlier runs: ${usd(runCost(previous))}. This run: ${usd(runCost(current))}. Trial-level costs below include this run only.`,
    ""
  );
  const review = reviewRecords(records);
  await atomicWrite(
    outputDir,
    "summary.json",
    JSON.stringify(
      {
        ...report,
        delivery: {
          messageRequests: "see trial evidence",
          channelAcceptance: "unobserved",
          visibleRendering: "unobserved",
          recipientReceipt: "unobserved",
          visibleLatency: "unobserved",
        },
        humanReview: "pending",
        judgeCalibration: "uncalibrated",
      },
      null,
      2
    ) + "\n"
  );
  await atomicWrite(
    outputDir,
    "report.md",
    header.join("\n") +
      records
        .map((record) => trialMarkdown(record, budget, basename(outputDir)))
        .join("\n")
  );
  await atomicWrite(
    outputDir,
    "review-sample.md",
    [
      "# Conversations for human review",
      "",
      "Deterministic sample: both packs, observed execution statuses, content-check failures, then distinct scenarios in key order. This is not a selection of only successful or highest-rated answers. Full evidence remains in report.md and summary.json.",
      "",
      "This baseline contains no candidate revision, so these are single-conversation review examples, not baseline/candidate pairs. Rate warmth, effort, continuity, composition, personality when applicable, and respect for attention. Note the turns supporting each judgment. Delivery timing beyond the runner is unobserved.",
      "",
      ...review.map((record) =>
        trialMarkdown(record, budget, basename(outputDir))
      ),
    ].join("\n")
  );
}
