import { readFile } from "node:fs/promises";
import { z } from "zod";

export interface TestCounts {
  discovered: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
}

export interface PlaywrightTestRecord {
  file: string;
  title: string;
  projectName: string;
  status: string;
}

export interface KnownPlaywrightExclusion {
  file: string;
  title: string;
  projectName: string;
  reason: string;
}

export const knownCompletionJourneyExclusion: KnownPlaywrightExclusion = {
  file: "tests/e2e/completion-journey.spec.ts",
  title:
    "reports settled background work, and answers a later question from evidence",
  projectName: "chromium",
  reason:
    "The contract fixture cannot resolve a serializable durable subagent model, so the settled-worker and later-answer browser journey remains unverified.",
};

interface PlaywrightSuite {
  specs?: {
    file: string;
    title: string;
    tests: { projectName: string; status: string }[];
  }[];
  suites?: PlaywrightSuite[];
}

const playwrightTestRecordSchema = z.object({
  projectName: z.string(),
  status: z.enum(["expected", "skipped", "unexpected", "flaky"]),
});

const playwrightSpecSchema = z.object({
  file: z.string(),
  title: z.string(),
  tests: z.array(playwrightTestRecordSchema),
});

const playwrightSuiteSchema: z.ZodType<PlaywrightSuite> = z.lazy(() =>
  z.object({
    specs: z.array(playwrightSpecSchema).optional(),
    suites: z.array(playwrightSuiteSchema).optional(),
  })
);

const playwrightStatsSchema = z.object({
  expected: z.number().int().nonnegative(),
  unexpected: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  flaky: z.number().int().nonnegative(),
});

const playwrightReportSchema = z.object({
  stats: playwrightStatsSchema,
  suites: z.array(playwrightSuiteSchema),
});

export function parseVitestSummaries(
  output: string
): { counts: TestCounts; summaryCount: number } | undefined {
  const summaries = [
    ...output.matchAll(/^\s*(?:[^\r\n]*?:\s*)?Tests\s+(.+)$/gmu),
  ]
    .map((match) => match[1])
    .filter((summary): summary is string => summary !== undefined);
  if (summaries.length === 0) return undefined;
  const counts: TestCounts = {
    discovered: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
  };
  for (const summary of summaries) {
    const total = /\((\d+)\)\s*$/u.exec(summary)?.[1];
    if (total !== undefined) counts.discovered += Number(total);
    for (const match of summary.matchAll(
      /(\d+)\s+(passed|failed|skipped|todo)/gu
    )) {
      const value = match[1];
      const status = match[2];
      if (value === undefined || status === undefined) continue;
      const amount = Number(value);
      if (status === "passed") counts.passed += amount;
      else if (status === "failed") counts.failed += amount;
      else counts.skipped += amount;
    }
  }
  if (counts.discovered === 0) return undefined;
  return { counts, summaryCount: summaries.length };
}

export function hasRequiredCheckTestEvidence(output: string): boolean {
  const lines = output.split(/\r?\n/u);
  const rootTaskPrefix = "local-vault-assistant:test:app:";
  const rootRunIndex = lines.findIndex(
    (line) =>
      line.startsWith(rootTaskPrefix) && line.trimEnd().endsWith("$ vitest run")
  );
  const rootSummary =
    rootRunIndex >= 0 &&
    lines
      .slice(rootRunIndex + 1)
      .some(
        (line) =>
          line.startsWith(rootTaskPrefix) && hasNonEmptyVitestSummary(line)
      );
  const marketingRunIndex = lines.findIndex((line) =>
    /^\s*RUN\s+v\S+\s+.+[\\/]apps[\\/]marketing[\\/]?\s*$/u.test(line)
  );
  const marketingSummary =
    marketingRunIndex >= 0 &&
    lines
      .slice(marketingRunIndex + 1)
      .some((line) => hasNonEmptyVitestSummary(line));
  return rootSummary && marketingSummary;
}

function hasNonEmptyVitestSummary(line: string): boolean {
  const total = /\bTests\s+.*\((\d+)\)\s*$/u.exec(line)?.[1];
  return total !== undefined && Number(total) > 0;
}

export async function parseJUnitFiles(paths: readonly string[]) {
  const counts: TestCounts = {
    discovered: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
  };
  let files = 0;
  const reports = await Promise.all(
    paths.map(async (path) => {
      return readFile(path, "utf8").catch(ignoreMissingReport);
    })
  );
  for (const xml of reports) {
    if (xml === undefined) continue;
    files += 1;
    for (const match of xml.matchAll(/<testsuite\b([^>]*)>/giu)) {
      const attributes = match[1];
      if (attributes === undefined) continue;
      const tests = numericAttribute(attributes, "tests");
      const failures = numericAttribute(attributes, "failures");
      const errors = numericAttribute(attributes, "errors");
      const skipped = numericAttribute(attributes, "skipped");
      counts.discovered += tests;
      counts.failed += failures + errors;
      counts.skipped += skipped;
      counts.passed += Math.max(0, tests - failures - errors - skipped);
    }
  }
  return { counts, files };
}

export function parsePlaywrightJson(
  source: string
): { counts: TestCounts; tests: PlaywrightTestRecord[] } | undefined {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return undefined;
  }
  const parsed = playwrightReportSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { expected, unexpected, skipped, flaky } = parsed.data.stats;
  const discovered = expected + unexpected + skipped + flaky;
  if (discovered === 0) return undefined;
  const tests = collectPlaywrightTests(parsed.data.suites);
  if (
    tests.length !== discovered ||
    tests.filter((test) => test.status === "skipped").length !== skipped
  ) {
    return undefined;
  }
  return {
    counts: {
      discovered,
      passed: expected,
      failed: unexpected,
      skipped,
      flaky,
    },
    tests,
  };
}

function collectPlaywrightTests(suites: readonly PlaywrightSuite[]) {
  const tests: PlaywrightTestRecord[] = [];
  const visit = (suite: PlaywrightSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        tests.push({
          file: spec.file,
          title: spec.title,
          projectName: test.projectName,
          status: test.status,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of suites) visit(suite);
  return tests;
}

function numericAttribute(attributes: string, name: string) {
  const match = new RegExp(`\\b${name}="(\\d+)"`, "u").exec(attributes);
  const value = match?.[1];
  return value === undefined ? 0 : Number(value);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Node may throw any value; only the checked ENOENT shape is treated as absence.
function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Treat only a parsed ENOENT filesystem failure as a missing optional JUnit report.
function ignoreMissingReport(error: unknown): undefined {
  if (isNotFound(error)) return undefined;
  throw error;
}
