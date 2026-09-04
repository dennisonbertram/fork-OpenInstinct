import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { MessageStreamEvent } from "eve/client";
import type { EveEvalResult, EveEvalRunSummary } from "eve/evals";
import { z } from "zod";

const stepUsageSchema = z.object({
  usage: z.object({ costUsd: z.number().nonnegative() }).optional(),
});
const fixtureDocumentSchema = z.object({
  clock: z.object({ asOf: z.string(), timezone: z.string() }),
});
interface FixtureJson {
  readonly clock?: unknown;
}

type EvalRunMode = "agent" | "square";
const summarySchema = z.object({
  errored: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
const manifestCaseSchema = z.object({
  completedAt: z.string(),
  cost: z.object({
    actor: z.object({
      knownCostUsd: z.number().nonnegative(),
      status: z.enum(["measured", "partial", "unknown"]),
    }),
    judge: z.object({
      knownCostUsd: z.null(),
      status: z.enum(["not-observable-from-eve-events", "not-used"]),
    }),
    total: z.object({
      knownCostUsd: z.number().nonnegative(),
      status: z.enum(["measured", "unknown"]),
    }),
  }),
  id: z.string(),
  modelIds: z.array(z.string()),
  startedAt: z.string(),
  timing: z.object({
    finalDeliveryMs: z.number().nonnegative().nullable(),
    firstDeliveredBubbleMs: z.number().nonnegative().nullable(),
    status: z.literal("not-observable-from-eve-events"),
    totalEvalMs: z.number().nonnegative(),
  }),
  verdict: z.string(),
});
const manifestAttemptSchema = z.object({
  cases: z.array(manifestCaseSchema),
  completedAt: z.string().nullable(),
  exitCode: z.number().int().nullable(),
  id: z.string(),
  startedAt: z.string(),
  summary: summarySchema.nullable(),
  terminal: z.enum(["running", "completed", "failed", "interrupted"]),
});
const manifestSchema = z.object({
  aggregate: z.object({
    attempts: z.number().int().nonnegative(),
    cases: summarySchema.extend({ incomplete: z.number().int().nonnegative() }),
    cost: z.object({
      knownCostUsd: z.number().nonnegative(),
      status: z.enum(["measured", "unknown"]),
    }),
    timing: z.object({
      p50TotalEvalMs: z.number().nonnegative().nullable(),
      p95TotalEvalMs: z.number().nonnegative().nullable(),
    }),
  }),
  attempts: z.array(manifestAttemptSchema),
  configuration: z.object({
    budget: z.object({
      estimatedCostUsd: z.number().positive(),
      maxCostUsd: z.number().positive(),
    }),
    effectiveArguments: z.array(z.string()),
    judge: z.object({
      configuredModel: z.string().nullable(),
      observedModelIds: z.array(z.string()),
    }),
    maxConcurrency: z.number().int().positive(),
    mode: z.enum(["agent", "square"]),
    reasoning: z.object({
      configured: z.string(),
      observed: z.null(),
      status: z.literal("not-observable-from-eve-events"),
    }),
    repetitions: z.number().int().positive(),
    selection: z.object({
      filters: z.array(z.string()),
      observedCaseIds: z.array(z.string()),
      requestedModel: z.string().nullable(),
    }),
    timeoutMs: z.number().int().positive(),
  }),
  provenance: z.object({
    cases: z.object({ paths: z.array(z.string()), sha256: z.string() }),
    clock: z.object({
      fixture: z.object({ asOf: z.string(), timezone: z.string() }).nullable(),
      host: z.literal("wall-clock"),
    }),
    git: z.object({ dirty: z.boolean(), sha: z.string().nullable() }),
    runtime: z.object({
      eve: z.string().nullable(),
      lockfileSha256: z.string().nullable(),
      node: z.string(),
    }),
  }),
  schemaVersion: z.literal(2),
  startedAt: z.string(),
});
type ManifestCase = z.infer<typeof manifestCaseSchema>;
type ManifestAttempt = z.infer<typeof manifestAttemptSchema>;
export type EvalRunManifest = z.infer<typeof manifestSchema>;
export interface CreateEvalRunManifestOptions {
  readonly caseDirectory: string;
  readonly effectiveArguments: readonly string[];
  readonly estimatedCostUsd: number;
  readonly fixtureClock: {
    readonly asOf: string;
    readonly timezone: string;
  } | null;
  readonly judgeModel: string | null;
  readonly maxConcurrency: number;
  readonly maxCostUsd: number;
  readonly mode: EvalRunMode;
  readonly reasoning: string;
  readonly repetitions: number;
  readonly repositoryRoot: string;
  readonly requestedModel: string | null;
  readonly timeoutMs: number;
}
const manifestQueues = new Map<string, Promise<void>>();

export async function createEvalRunManifest(
  options: CreateEvalRunManifestOptions
) {
  const startedAt = new Date().toISOString();
  const manifest: EvalRunManifest = {
    aggregate: aggregateFor([]),
    attempts: [],
    configuration: {
      budget: {
        estimatedCostUsd: options.estimatedCostUsd,
        maxCostUsd: options.maxCostUsd,
      },
      effectiveArguments: [...options.effectiveArguments],
      judge: { configuredModel: options.judgeModel, observedModelIds: [] },
      maxConcurrency: options.maxConcurrency,
      mode: options.mode,
      reasoning: {
        configured: options.reasoning,
        observed: null,
        status: "not-observable-from-eve-events",
      },
      repetitions: options.repetitions,
      selection: {
        filters: [...options.effectiveArguments],
        observedCaseIds: [],
        requestedModel: options.requestedModel,
      },
      timeoutMs: options.timeoutMs,
    },
    provenance: {
      cases: await hashCaseDirectory(
        options.repositoryRoot,
        options.caseDirectory
      ),
      clock: { fixture: options.fixtureClock, host: "wall-clock" },
      git: await gitProvenance(options.repositoryRoot),
      runtime: {
        eve: await installedEveVersion(options.repositoryRoot),
        lockfileSha256: await fileSha256(
          options.repositoryRoot,
          "pnpm-lock.yaml"
        ),
        node: process.version,
      },
    },
    schemaVersion: 2,
    startedAt,
  };
  const directory = join(options.repositoryRoot, ".eve", "eval-runs");
  await mkdir(directory, { recursive: true });
  const path = join(
    directory,
    `${startedAt.replaceAll(":", "-")}-${options.mode}-${randomUUID()}.json`
  );
  await writeManifest(path, manifest);
  return path;
}
export async function beginManifestAttempt(path: string, id = randomUUID()) {
  const attempt: ManifestAttempt = {
    cases: [],
    completedAt: null,
    exitCode: null,
    id,
    startedAt: new Date().toISOString(),
    summary: null,
    terminal: "running",
  };
  await updateManifest(path, (manifest) =>
    withAttempts(manifest, [...manifest.attempts, attempt])
  );
  return id;
}
export async function completeManifestAttempt(
  path: string,
  id: string,
  exitCode: number | null
) {
  await updateManifest(path, (manifest) =>
    withAttempts(
      manifest,
      manifest.attempts.map((attempt) =>
        attempt.id === id
          ? {
              ...attempt,
              completedAt: new Date().toISOString(),
              exitCode,
              terminal:
                exitCode === 0
                  ? "completed"
                  : exitCode !== null && exitCode >= 128
                    ? "interrupted"
                    : "failed",
            }
          : attempt
      )
    )
  );
}
export async function recordManifestCase(
  path: string,
  attemptId: string,
  result: EveEvalResult
) {
  const item = manifestCaseFromResult(result);
  await updateManifest(path, (manifest) =>
    withAttempts(
      manifest,
      manifest.attempts.map((attempt) => {
        if (attempt.id !== attemptId) return attempt;
        const cases = [
          ...attempt.cases.filter((current) => current.id !== item.id),
          item,
        ];
        return { ...attempt, cases };
      })
    )
  );
}
export async function recordManifestRun(
  path: string,
  id: string,
  summary: EveEvalRunSummary
) {
  await updateManifest(path, (manifest) =>
    withAttempts(
      manifest,
      manifest.attempts.map((attempt) => {
        if (attempt.id !== id) return attempt;
        const cases = [...attempt.cases];
        for (const item of summary.results.map(manifestCaseFromResult)) {
          const index = cases.findIndex((current) => current.id === item.id);
          if (index === -1) cases.push(item);
          else cases[index] = item;
        }
        return {
          ...attempt,
          cases,
          completedAt: summary.completedAt,
          summary: {
            errored: summary.errored,
            failed: summary.failed,
            passed: summary.passed,
            skipped: summary.skipped,
          },
          terminal:
            summary.errored + summary.failed === 0 ? "completed" : "failed",
        };
      })
    )
  );
}
export async function manifestCostStatus(path: string) {
  const manifest = await readManifest(path);
  const cases = manifest.attempts.flatMap((attempt) => attempt.cases);
  const knownActorCostUsd = cases.reduce(
    (total, item) => total + item.cost.actor.knownCostUsd,
    0
  );
  return {
    actorCostsUsd: manifest.attempts.map((attempt) =>
      attempt.cases.reduce(
        (total, item) => total + item.cost.actor.knownCostUsd,
        0
      )
    ),
    actorCostUnaccountable: manifest.attempts.some(
      (attempt) =>
        attempt.terminal === "running" ||
        attempt.summary === null ||
        attempt.cases.some((item) => item.cost.actor.status !== "measured")
    ),
    knownActorCostUsd,
    knownCostUsd: cases.reduce(
      (total, item) => total + item.cost.total.knownCostUsd,
      0
    ),
    unknown:
      manifest.attempts.some(
        (attempt) => attempt.terminal === "running" || attempt.summary === null
      ) ||
      cases.length === 0 ||
      cases.some((item) => item.cost.total.status === "unknown"),
  };
}
export function manifestCaseFromResult(result: EveEvalResult): ManifestCase {
  const started = result.result.events.filter(
    (event): event is Extract<MessageStreamEvent, { type: "step.started" }> =>
      event.type === "step.started"
  );
  const completed = result.result.events.filter(
    (event): event is Extract<MessageStreamEvent, { type: "step.completed" }> =>
      event.type === "step.completed"
  );
  const reportedCosts = completed.flatMap((event) => {
    const parsed = stepUsageSchema.safeParse(event.data);
    const costUsd = parsed.success ? parsed.data.usage?.costUsd : undefined;
    return costUsd === undefined ? [] : [costUsd];
  });
  const actorStatus =
    completed.length === 0
      ? "unknown"
      : started.length === completed.length &&
          reportedCosts.length === completed.length
        ? "measured"
        : "partial";
  const judgeUsed = result.assertions.some((assertion) =>
    assertion.name.startsWith("judge.")
  );
  const actorKnown = reportedCosts.reduce((total, cost) => total + cost, 0);
  return {
    completedAt: result.completedAt,
    cost: {
      actor: { knownCostUsd: actorKnown, status: actorStatus },
      judge: {
        knownCostUsd: null,
        status: judgeUsed ? "not-observable-from-eve-events" : "not-used",
      },
      total: {
        knownCostUsd: actorKnown,
        status:
          actorStatus === "measured" && !judgeUsed ? "measured" : "unknown",
      },
    },
    id: result.id,
    modelIds: [...new Set(started.map((event) => event.data.modelId))],
    startedAt: result.startedAt,
    timing: {
      finalDeliveryMs: null,
      firstDeliveredBubbleMs: null,
      status: "not-observable-from-eve-events",
      totalEvalMs: elapsedMs(result.startedAt, result.completedAt),
    },
    verdict: result.verdict,
  };
}
export async function readFixtureClock(
  repositoryRoot: string,
  fixturePath: string
) {
  try {
    const fixture = fixtureDocumentSchema.safeParse(
      JSON.parse(await readFile(join(repositoryRoot, fixturePath), "utf8"))
    );
    return fixture.success ? fixture.data.clock : null;
  } catch {
    return null;
  }
}
export function fixtureClockFromJson(value: FixtureJson) {
  const parsed = fixtureDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data.clock : null;
}
export async function readEvalRunManifest(path: string) {
  return readManifest(path);
}
function withAttempts(
  manifest: EvalRunManifest,
  attempts: ManifestAttempt[]
): EvalRunManifest {
  const allCases = attempts.flatMap((attempt) => attempt.cases);
  return {
    ...manifest,
    attempts,
    aggregate: aggregateFor(attempts),
    configuration: {
      ...manifest.configuration,
      judge: {
        ...manifest.configuration.judge,
        observedModelIds: [
          ...new Set(allCases.flatMap((item) => item.modelIds)),
        ],
      },
      selection: {
        ...manifest.configuration.selection,
        observedCaseIds: [...new Set(allCases.map((item) => item.id))],
      },
    },
  };
}
async function hashCaseDirectory(
  repositoryRoot: string,
  caseDirectory: string
) {
  const paths = (await filesUnder(join(repositoryRoot, caseDirectory))).map(
    (path) => relative(repositoryRoot, path)
  );
  const contents = await Promise.all(
    paths.map(
      async (path) =>
        [path, await readFile(join(repositoryRoot, path))] as const
    )
  );
  const hash = createHash("sha256");
  for (const [path, content] of contents) {
    hash.update(path);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return { paths, sha256: hash.digest("hex") };
}
async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) =>
          entry.isDirectory()
            ? filesUnder(join(directory, entry.name))
            : [join(directory, entry.name)]
        )
    )
  ).flat();
}
async function gitProvenance(repositoryRoot: string) {
  const { execFile } = await import("node:child_process");
  const runGit = (args: string[]) =>
    new Promise<string | null>((resolve) => {
      execFile("git", args, { cwd: repositoryRoot }, (error, stdout) => {
        resolve(error ? null : stdout.trim());
      });
    });
  const [sha, dirtyOutput] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["status", "--porcelain"]),
  ]);
  return { dirty: dirtyOutput !== null && dirtyOutput.length > 0, sha };
}
async function fileSha256(repositoryRoot: string, relativePath: string) {
  try {
    return createHash("sha256")
      .update(await readFile(join(repositoryRoot, relativePath)))
      .digest("hex");
  } catch {
    return null;
  }
}
async function installedEveVersion(repositoryRoot: string) {
  try {
    const parsed = z
      .object({ version: z.string().optional() })
      .safeParse(
        JSON.parse(
          await readFile(
            join(repositoryRoot, "node_modules", "eve", "package.json"),
            "utf8"
          )
        )
      );
    return parsed.success ? (parsed.data.version ?? null) : null;
  } catch {
    return null;
  }
}
async function readManifest(path: string) {
  return manifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
async function updateManifest(
  path: string,
  update: (manifest: EvalRunManifest) => EvalRunManifest
) {
  const prior = manifestQueues.get(path) ?? Promise.resolve();
  const next = prior.then(async () => {
    const manifest = await readManifest(path);
    await writeManifest(path, update(manifest));
    return undefined;
  });
  manifestQueues.set(
    path,
    next.catch(() => undefined)
  );
  await next;
}
async function writeManifest(path: string, manifest: EvalRunManifest) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(manifestSchema.parse(manifest), null, 2)}\n`,
    "utf8"
  );
  await rename(temporaryPath, path);
}
function elapsedMs(startedAt: string, completedAt: string) {
  return Math.max(
    0,
    new Date(completedAt).getTime() - new Date(startedAt).getTime()
  );
}
function aggregateFor(attempts: readonly ManifestAttempt[]) {
  const summaries = attempts.flatMap((attempt) =>
    attempt.summary === null ? [] : [attempt.summary]
  );
  const cases = attempts.flatMap((attempt) => attempt.cases);
  const durations = cases
    .map((item) => item.timing.totalEvalMs)
    .toSorted((a, b) => a - b);
  return {
    attempts: attempts.length,
    cases: {
      errored: summaries.reduce((total, item) => total + item.errored, 0),
      failed: summaries.reduce((total, item) => total + item.failed, 0),
      incomplete: attempts.filter((attempt) => attempt.summary === null).length,
      passed: summaries.reduce((total, item) => total + item.passed, 0),
      skipped: summaries.reduce((total, item) => total + item.skipped, 0),
    },
    cost: {
      knownCostUsd: cases.reduce(
        (total, item) => total + item.cost.total.knownCostUsd,
        0
      ),
      status:
        cases.length === 0 ||
        attempts.some((attempt) => attempt.summary === null) ||
        cases.some((item) => item.cost.total.status === "unknown")
          ? "unknown"
          : "measured",
    },
    timing: {
      p50TotalEvalMs: percentile(durations, 0.5),
      p95TotalEvalMs: percentile(durations, 0.95),
    },
  } as const;
}
function percentile(values: readonly number[], fraction: number) {
  if (values.length === 0) return null;
  return values[Math.ceil(values.length * fraction) - 1] ?? null;
}
