import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { EveEvalResult, EveEvalRunSummary } from "eve/evals";
import type { MessageStreamEvent } from "eve/client";

type EvalRunMode = "agent" | "square";

interface ManifestCase {
  readonly completedAt: string;
  readonly costUsd: number | null;
  readonly costStatus: "measured" | "unknown";
  readonly id: string;
  readonly modelIds: readonly string[];
  readonly startedAt: string;
  readonly timing: {
    readonly finalDeliveryMs: null;
    readonly firstDeliveredBubbleMs: null;
    readonly status: "not-observable-from-eve-events";
    readonly totalEvalMs: number;
  };
  readonly verdict: EveEvalResult["verdict"];
}

interface ManifestAttempt {
  readonly cases: readonly ManifestCase[];
  readonly completedAt: string | null;
  readonly exitCode: number | null;
  readonly id: string;
  readonly startedAt: string;
  readonly summary: {
    readonly errored: number;
    readonly failed: number;
    readonly passed: number;
    readonly skipped: number;
  } | null;
}

export interface EvalRunManifest {
  readonly aggregate: {
    readonly attempts: number;
    readonly cases: {
      readonly errored: number;
      readonly failed: number;
      readonly passed: number;
      readonly skipped: number;
    };
    readonly cost: {
      readonly knownCostUsd: number;
      readonly status: "measured" | "unknown";
    };
    readonly timing: {
      readonly p50TotalEvalMs: number | null;
      readonly p95TotalEvalMs: number | null;
    };
  };
  readonly attempts: readonly ManifestAttempt[];
  readonly configuration: {
    readonly judgeModel: string | null;
    readonly maxConcurrency: number;
    readonly maxCostUsd: number;
    readonly mode: EvalRunMode;
    readonly reasoning: {
      readonly configured: string;
      readonly observed: null;
      readonly status: "not-observable-from-eve-events";
    };
    readonly repetitions: number;
    readonly requestedModel: string | null;
    readonly timeoutMs: number;
  };
  readonly provenance: {
    readonly cases: {
      readonly paths: readonly string[];
      readonly sha256: string;
    };
    readonly clock: {
      readonly fixture: {
        readonly asOf: string;
        readonly timezone: string;
      } | null;
      readonly host: "wall-clock";
    };
    readonly git: { readonly dirty: boolean; readonly sha: string | null };
    readonly runtime: { readonly eve: string | null; readonly node: string };
  };
  readonly schemaVersion: 1;
  readonly startedAt: string;
}

export interface CreateEvalRunManifestOptions {
  readonly caseDirectory: string;
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

export async function createEvalRunManifest(
  options: CreateEvalRunManifestOptions
) {
  const startedAt = new Date().toISOString();
  const manifest: EvalRunManifest = {
    aggregate: aggregateFor([]),
    attempts: [],
    configuration: {
      judgeModel: options.judgeModel,
      maxConcurrency: options.maxConcurrency,
      maxCostUsd: options.maxCostUsd,
      mode: options.mode,
      reasoning: {
        configured: options.reasoning,
        observed: null,
        status: "not-observable-from-eve-events",
      },
      repetitions: options.repetitions,
      requestedModel: options.requestedModel,
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
        node: process.version,
      },
    },
    schemaVersion: 1,
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
  await updateManifest(path, (manifest) => ({
    ...manifest,
    attempts: [
      ...manifest.attempts,
      {
        cases: [],
        completedAt: null,
        exitCode: null,
        id,
        startedAt: new Date().toISOString(),
        summary: null,
      },
    ],
    aggregate: aggregateFor([
      ...manifest.attempts,
      {
        cases: [],
        completedAt: null,
        exitCode: null,
        id,
        startedAt: new Date().toISOString(),
        summary: null,
      },
    ]),
  }));
  return id;
}

export async function completeManifestAttempt(
  path: string,
  id: string,
  exitCode: number | null
) {
  await updateManifest(path, (manifest) => {
    const attempts = manifest.attempts.map((attempt) =>
      attempt.id === id ? { ...attempt, exitCode } : attempt
    );
    return { ...manifest, aggregate: aggregateFor(attempts), attempts };
  });
}

export async function recordManifestRun(
  path: string,
  id: string,
  summary: EveEvalRunSummary
) {
  const cases = summary.results.map(manifestCaseFromResult);
  await updateManifest(path, (manifest) => {
    const attempts = manifest.attempts.map((attempt) =>
      attempt.id === id
        ? {
            ...attempt,
            cases,
            completedAt: summary.completedAt,
            summary: {
              errored: summary.errored,
              failed: summary.failed,
              passed: summary.passed,
              skipped: summary.skipped,
            },
          }
        : attempt
    );
    return { ...manifest, aggregate: aggregateFor(attempts), attempts };
  });
}

export async function manifestCostStatus(path: string) {
  const manifest = await readManifest(path);
  const cases = manifest.attempts.flatMap((attempt) => attempt.cases);
  const costs = cases.flatMap((item) =>
    item.costUsd === null ? [] : [item.costUsd]
  );
  return {
    knownCostUsd: costs.reduce((total, cost) => total + cost, 0),
    unknown:
      cases.length === 0 || cases.some((item) => item.costStatus === "unknown"),
  };
}

export function manifestCaseFromResult(result: EveEvalResult): ManifestCase {
  const stepEvents = result.result.events.filter(
    (event): event is Extract<MessageStreamEvent, { type: "step.started" }> =>
      event.type === "step.started"
  );
  const costEvents = result.result.events.filter(
    (event): event is Extract<MessageStreamEvent, { type: "step.completed" }> =>
      event.type === "step.completed"
  );
  const reportedCosts = costEvents.flatMap((event) =>
    typeof event.data.usage?.costUsd === "number"
      ? [event.data.usage.costUsd]
      : []
  );
  const completeCost =
    costEvents.length > 0 && reportedCosts.length === costEvents.length;
  return {
    completedAt: result.completedAt,
    costStatus: completeCost ? "measured" : "unknown",
    costUsd: completeCost
      ? reportedCosts.reduce((total, cost) => total + cost, 0)
      : null,
    id: result.id,
    modelIds: [...new Set(stepEvents.map((event) => event.data.modelId))],
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
    return fixtureClockFromJson(
      JSON.parse(await readFile(join(repositoryRoot, fixturePath), "utf8"))
    );
  } catch {
    return null;
  }
}

export function fixtureClockFromJson(value: unknown) {
  if (typeof value !== "object" || value === null || !("clock" in value)) {
    return null;
  }
  const clock = value.clock;
  if (
    typeof clock !== "object" ||
    clock === null ||
    !("asOf" in clock) ||
    !("timezone" in clock) ||
    typeof clock.asOf !== "string" ||
    typeof clock.timezone !== "string"
  ) {
    return null;
  }
  return { asOf: clock.asOf, timezone: clock.timezone };
}

async function hashCaseDirectory(
  repositoryRoot: string,
  caseDirectory: string
) {
  const directory = join(repositoryRoot, caseDirectory);
  const paths = (await filesUnder(directory)).map((path) =>
    relative(repositoryRoot, path)
  );
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(join(repositoryRoot, path)));
    hash.update("\0");
  }
  return { paths, sha256: hash.digest("hex") };
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(path);
        return [path];
      })
  );
  return paths.flat();
}

async function gitProvenance(repositoryRoot: string) {
  const { execFile } = await import("node:child_process");
  const runGit = (args: string[]) =>
    new Promise<string | null>((resolve) => {
      execFile("git", args, { cwd: repositoryRoot }, (error, stdout) =>
        resolve(error ? null : stdout.trim())
      );
    });
  const [sha, dirtyOutput] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["status", "--porcelain"]),
  ]);
  return { dirty: dirtyOutput !== null && dirtyOutput.length > 0, sha };
}

async function installedEveVersion(repositoryRoot: string) {
  try {
    const packageJson = JSON.parse(
      await readFile(
        join(repositoryRoot, "node_modules", "eve", "package.json"),
        "utf8"
      )
    ) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : null;
  } catch {
    return null;
  }
}

async function readManifest(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as EvalRunManifest;
}

async function updateManifest(
  path: string,
  update: (manifest: EvalRunManifest) => EvalRunManifest
) {
  await writeManifest(path, update(await readManifest(path)));
}

async function writeManifest(path: string, manifest: EvalRunManifest) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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
    .toSorted((left, right) => left - right);
  const reportedCosts = cases.flatMap((item) =>
    item.costUsd === null ? [] : [item.costUsd]
  );
  return {
    attempts: attempts.length,
    cases: {
      errored: summaries.reduce((total, summary) => total + summary.errored, 0),
      failed: summaries.reduce((total, summary) => total + summary.failed, 0),
      passed: summaries.reduce((total, summary) => total + summary.passed, 0),
      skipped: summaries.reduce((total, summary) => total + summary.skipped, 0),
    },
    cost: {
      knownCostUsd: reportedCosts.reduce((total, cost) => total + cost, 0),
      status:
        cases.length === 0 || cases.some((item) => item.costUsd === null)
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
