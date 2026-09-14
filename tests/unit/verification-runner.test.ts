import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const cliPath = join(repositoryRoot, "scripts/verify.ts");
const canary = "synthetic-parent-canary-verify-test-9f31";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("verification CLI checks lane", () => {
  it("records required test evidence and excludes parent-only environment values", async () => {
    const fixture = await createFixture("success");
    const result = runChecks(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Verification status: PASSED.");
    expect(result.stdout).toContain(
      "SYNTHETIC_CHILD_ENV: CI=1 REAL_PG=0 TURBO_FORCE=true CANARY=absent"
    );
    expect(result.stdout).toContain(
      "local-vault-assistant:test:app: $ vitest run"
    );
    expect(result.stdout).toMatch(/RUN v4\.1\.11 .+\/apps\/marketing/u);
    expect(result.stdout + result.stderr).not.toContain(canary);

    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("passed");
    expect(receipt.selectedLanes).toEqual(["checks"]);
    expect(receipt.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.sourceFingerprintAtEnd).toBe(receipt.sourceFingerprint);
    expect(JSON.stringify(receipt)).not.toContain(canary);

    const checks = requireValue(receipt.lanes.checks, "checks lane");
    expect(checks.status).toBe("passed");
    expect(checks.tests).toEqual({
      discovered: 13,
      passed: 6,
      failed: 0,
      skipped: 7,
      flaky: 0,
    });
    expect(checks.steps).toHaveLength(2);
    const checksStep = requireValue(checks.steps[0], "checks step");
    expect(checksStep).toMatchObject({
      id: "checks",
      status: "passed",
      exitCode: 0,
    });
    const outputLog = checksStep.outputLog;
    expect(outputLog).toBeDefined();
    expect(outputLog?.path).toMatch(
      new RegExp(`^\\.eve/verify/${receipt.runId}/`, "u")
    );
    expect(outputLog?.truncated).toBe(false);
    const output = await readFile(
      join(fixture.repository, outputLog?.path ?? ""),
      "utf8"
    );
    expect(createHash("sha256").update(output).digest("hex")).toBe(
      outputLog?.sha256
    );
    expect(output).not.toContain(canary);
    expect(requireValue(checks.steps[1], "diff check step")).toMatchObject({
      id: "diff-check",
      status: "passed",
      exitCode: 0,
    });
  });

  it("fails the lane when the check command exits nonzero", async () => {
    const fixture = await createFixture("exit-17");
    const result = runChecks(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "Verification status: FAILED."
    );
    expect(result.stdout).toContain(
      "local-vault-assistant:test:app: $ vitest run"
    );
    expect(result.stdout).toMatch(/RUN v4\.1\.11 .+\/apps\/marketing/u);
    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("failed");
    const checks = requireValue(receipt.lanes.checks, "checks lane");
    expect(checks.status).toBe("failed");
    expect(requireValue(checks.steps[0], "checks step")).toMatchObject({
      status: "failed",
      exitCode: 17,
    });
    expect(requireValue(checks.steps[1], "diff check step").status).toBe(
      "not-run"
    );
  });

  it.each([
    ["missing summaries", "no-summaries"],
    ["zero-test summaries", "zero-summaries"],
  ] as const)("marks %s incomplete", async (_label, mode) => {
    const fixture = await createFixture(mode);
    const result = runChecks(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "Verification status: INCOMPLETE."
    );
    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("incomplete");
    const checks = requireValue(receipt.lanes.checks, "checks lane");
    expect(checks.status).toBe("incomplete");
    expect(checks.explanation).toMatch(/non-empty summaries/u);
  });

  it("marks summaries without the marketing test-script heading incomplete", async () => {
    const fixture = await createFixture("missing-marketing-heading");
    const result = runChecks(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "Verification status: INCOMPLETE."
    );
    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("incomplete");
    const checks = requireValue(receipt.lanes.checks, "checks lane");
    expect(checks.status).toBe("incomplete");
    expect(checks.explanation).toMatch(/marketing|heading/iu);
  });
});

describe("verification CLI E2E receipt", () => {
  it("records the named completion journey skip and aligns the browser URL with the fixture origin", async () => {
    const fixture = await createFixture("e2e");
    const result = runE2e(fixture);

    expect(result.status).toBe(0);
    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("passed");
    const e2e = requireValue(receipt.lanes.e2e, "e2e lane");
    expect(e2e.knownExclusions).toHaveLength(1);
    const knownExclusion = e2e.knownExclusions[0];
    expect(knownExclusion?.file).toBe("tests/e2e/completion-journey.spec.ts");
    expect(knownExclusion?.title).toBe(
      "reports settled background work, and answers a later question from evidence"
    );
    expect(knownExclusion?.projectName).toBe("chromium");
    expect(knownExclusion?.reason).toContain("durable subagent model");
    expect(e2e.tests).toMatchObject({ skipped: 1 });
    const targets = e2e.targets;
    if (!Array.isArray(targets)) throw new Error("E2E targets are missing.");
    expect(targets).toHaveLength(2);
    for (const target of targets) {
      expect(target.browserBaseURL).toBe(target.url);
      expect(target.browserBaseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    }
    const databases = e2e.databases;
    if (!Array.isArray(databases))
      throw new Error("E2E database evidence is missing.");
    expect(databases).toHaveLength(2);
    const canonicalRepository = await realpath(fixture.repository);
    const expectedProjects = databases.map((database, index) => {
      const expectedStep = index === 0 ? "web" : "sendblue";
      const expectedDevRunId = `verify-${receipt.runId.replaceAll("-", "").slice(0, 20)}-${expectedStep}`;
      const repositoryHash = createHash("sha256")
        .update(canonicalRepository)
        .digest("hex")
        .slice(0, 8);
      const runHash = createHash("sha256")
        .update(expectedDevRunId)
        .digest("hex")
        .slice(0, 12);
      expect(database.identity).toBe(
        `open-instinct-fixture-${repositoryHash}-${runHash}`
      );
      expect(database.cleanup).toEqual({
        runRecord: { state: "absent", count: 0 },
        containers: { state: "absent", count: 0 },
        volumes: { state: "absent", count: 0 },
        networks: { state: "absent", count: 0 },
      });
      return database.identity;
    });
    expect(new Set(expectedProjects).size).toBe(2);
    expect(e2e.cleanup).toBe("passed");
  });

  it("fails on a skipped test outside the one named completion journey", async () => {
    const fixture = await createFixture("e2e-unknown-skip");
    const result = runE2e(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "Verification status: INCOMPLETE."
    );
    const receipt = await readReceipt(fixture.repository);
    const e2e = requireValue(receipt.lanes.e2e, "e2e lane");
    expect(e2e.status).toBe("incomplete");
    expect(e2e.tests).toMatchObject({ skipped: 1 });
    expect(e2e.knownExclusions).toEqual([]);
    expect(e2e.explanation).toMatch(
      /outside the documented completion-journey exclusion/u
    );
  });

  it("rejects the same skipped title and basename from a different E2E path", async () => {
    const fixture = await createFixture("e2e-wrong-known-path");
    const result = runE2e(fixture);

    expect(result.status).toBe(1);
    const receipt = await readReceipt(fixture.repository);
    const e2e = requireValue(receipt.lanes.e2e, "e2e lane");
    expect(e2e.status).toBe("incomplete");
    expect(e2e.knownExclusions).toEqual([]);
    expect(e2e.explanation).toMatch(/omitted the completion-journey/u);
    expect(e2e.explanation).toMatch(
      /outside the documented completion-journey exclusion/u
    );
  });

  it("fails cleanup evidence when the fixture leaves owned resources", async () => {
    const fixture = await createFixture("e2e-orphaned-resources");
    const result = runE2e(fixture);

    expect(result.status).toBe(1);
    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("incomplete");
    const e2e = requireValue(receipt.lanes.e2e, "e2e lane");
    expect(e2e.status).toBe("incomplete");
    expect(e2e.cleanup).toBe("failed");
    expect(e2e.explanation).toMatch(/left owned/u);
    const databases = e2e.databases;
    if (!Array.isArray(databases))
      throw new Error("E2E database evidence is missing.");
    expect(databases).toHaveLength(2);
    expect(databases[0]?.cleanup).toEqual({
      runRecord: { state: "present", count: 1 },
      containers: { state: "present", count: 1 },
      volumes: { state: "present", count: 1 },
      networks: { state: "present", count: 1 },
    });
  });

  it("keeps cleanup unknown when the Docker inventory cannot be read", async () => {
    const fixture = await createFixture("e2e-docker-query-fails");
    const result = runE2e(fixture);

    expect(result.status).toBe(1);
    const receipt = await readReceipt(fixture.repository);
    expect(receipt.status).toBe("incomplete");
    const e2e = requireValue(receipt.lanes.e2e, "e2e lane");
    expect(e2e.status).toBe("incomplete");
    expect(e2e.cleanup).toBe("unknown");
    expect(e2e.explanation).toMatch(/could not verify/u);
  });
});

type E2eStubMode =
  | "e2e"
  | "e2e-unknown-skip"
  | "e2e-wrong-known-path"
  | "e2e-orphaned-resources"
  | "e2e-docker-query-fails";

type StubMode =
  | "success"
  | "exit-17"
  | "no-summaries"
  | "zero-summaries"
  | "missing-marketing-heading"
  | E2eStubMode;

function isE2eMode(mode: StubMode): mode is E2eStubMode {
  return mode === "e2e" || mode.startsWith("e2e-");
}

async function createFixture(mode: StubMode) {
  const root = await mkdtemp(join(tmpdir(), "verification-runner-blackbox-"));
  temporaryRoots.push(root);
  const repository = join(root, "repo");
  const bin = join(root, "bin");
  await Promise.all([
    mkdir(repository, { recursive: true }),
    mkdir(bin, { recursive: true }),
    mkdir(join(repository, "db/migrations/meta"), { recursive: true }),
    mkdir(join(repository, "apps/marketing"), { recursive: true }),
    mkdir(join(repository, "scripts/verification"), { recursive: true }),
  ]);
  await copyFile(
    join(repositoryRoot, "scripts/verification/deny-env-files.mjs"),
    join(repository, "scripts/verification/deny-env-files.mjs")
  );

  await writeFile(
    join(repository, ".gitignore"),
    ".eve/verify/\n.eve/dev-runs/\n",
    "utf8"
  );
  await writeFile(
    join(repository, "package.json"),
    JSON.stringify({
      name: "local-vault-assistant",
      private: true,
      packageManager: "pnpm@10.8.0",
    }) + "\n",
    "utf8"
  );
  await writeFile(
    join(repository, "apps/marketing/package.json"),
    JSON.stringify({
      name: "@jory/marketing",
      version: "0.1.0",
      private: true,
      scripts: { test: "vitest run" },
    }) + "\n",
    "utf8"
  );
  await writeFile(
    join(repository, "db/migrations/meta/_journal.json"),
    JSON.stringify({ entries: [{ tag: "0001_fixture" }] }) + "\n",
    "utf8"
  );
  const stubPath = join(bin, "pnpm");
  await writeFile(stubPath, stubScript(mode), "utf8");
  await chmod(stubPath, 0o755);
  if (isE2eMode(mode)) {
    await writeFile(
      join(repository, "verification-playwright-stub.mjs"),
      playwrightStubScript(mode),
      "utf8"
    );
    const dockerPath = join(bin, "docker");
    await writeFile(dockerPath, dockerStubScript(mode), "utf8");
    await chmod(dockerPath, 0o755);
  }

  git(repository, ["init", "--quiet"]);
  git(repository, ["config", "user.name", "Verification Fixture"]);
  git(repository, [
    "config",
    "user.email",
    "verification-fixture@example.invalid",
  ]);
  git(repository, [
    "add",
    ".gitignore",
    "package.json",
    "apps/marketing/package.json",
    "db/migrations/meta/_journal.json",
    "scripts/verification/deny-env-files.mjs",
    ...(isE2eMode(mode) ? ["verification-playwright-stub.mjs"] : []),
  ]);
  git(repository, ["commit", "--quiet", "-m", "fixture base"]);

  return { root, repository, bin };
}

function stubScript(mode: StubMode) {
  if (isE2eMode(mode)) {
    return [
      "#!/bin/sh",
      'node "$VERIFY_REPO_ROOT/verification-playwright-stub.mjs"',
      "",
    ].join("\n");
  }
  const rootSummary =
    mode === "success" || mode === "exit-17"
      ? "printf '%s\\n' 'local-vault-assistant:test:app:       Tests 2 passed (2)'\n"
      : mode === "zero-summaries"
        ? "printf '%s\\n' 'local-vault-assistant:test:app:       Tests 0 passed (0)'\n"
        : ": # intentionally emit no Vitest summaries\n";
  const marketingSummary =
    mode === "success" || mode === "exit-17"
      ? "printf '%s\\n' '      Tests 4 passed | 7 skipped (11)'"
      : mode === "zero-summaries"
        ? "printf '%s\\n' '      Tests 0 passed (0)'"
        : ": # intentionally emit no marketing Vitest summary";
  const exit = mode === "exit-17" ? "exit 17\n" : "exit 0\n";
  const rootVitestCommand =
    "printf '%s\\n' 'local-vault-assistant:test:app: $ vitest run'\n";
  const marketingVitestRun =
    mode === "missing-marketing-heading"
      ? ": # intentionally omit the marketing test heading\n"
      : [
          "printf '%s\\n' '$ pnpm typecheck && pnpm test && pnpm build' '$ tsc --noEmit' '$ vitest run'",
          "printf ' RUN v4.1.11 %s/apps/marketing\\n' \"$VERIFY_REPO_ROOT\"",
          marketingSummary,
        ].join("\n") + "\n";
  return [
    "#!/bin/sh",
    'if [ "${VERIFY_PARENT_ONLY_CANARY+x}" = x ]; then canary=present; else canary=absent; fi',
    'printf "SYNTHETIC_CHILD_ENV: CI=%s REAL_PG=%s TURBO_FORCE=%s CANARY=%s\\n" "$CI" "$REAL_PG" "$TURBO_FORCE" "$canary"',
    rootVitestCommand.trimEnd(),
    rootSummary.trimEnd(),
    marketingVitestRun.trimEnd(),
    exit.trimEnd(),
    "",
  ].join("\n");
}

function playwrightStubScript(mode: E2eStubMode) {
  return [
    'import { createHash } from "node:crypto";',
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'import { dirname, join } from "node:path";',
    "const repositoryRoot = process.env.VERIFY_REPO_ROOT;",
    "const runId = process.env.DEV_RUN_ID;",
    'const step = runId?.endsWith("-sendblue") ? "sendblue" : "web";',
    "const appPort = process.env.PLAYWRIGHT_PORT;",
    "const marketingPort = process.env.MARKETING_PORT;",
    "const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;",
    "const receiptPath = process.env.DEV_VERIFY_EVIDENCE_PATH;",
    "const reportDirectory = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR;",
    "const artifactRoot = process.env.VERIFY_ARTIFACT_ROOT;",
    `const includeUnknownSkip = ${String(mode === "e2e-unknown-skip")};`,
    `const wrongKnownPath = ${String(mode === "e2e-wrong-known-path")};`,
    `const leaveOwnedResources = ${String(mode === "e2e-orphaned-resources")};`,
    "if ([repositoryRoot, runId, appPort, marketingPort, reportPath, receiptPath, reportDirectory, artifactRoot].some((value) => value === undefined)) {",
    '  throw new Error("Fixture runner environment is incomplete.");',
    "}",
    'const repositoryHash = createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 8);',
    'const runHash = createHash("sha256").update(runId).digest("hex").slice(0, 12);',
    "const project = `open-instinct-fixture-${repositoryHash}-${runHash}`;",
    "mkdirSync(dirname(receiptPath), { recursive: true });",
    'writeFileSync(receiptPath, JSON.stringify({ schemaVersion: 1, runId, profile: "fixture", composeProject: project, volume: `${project}_postgres-data`, origins: { app: `http://127.0.0.1:${appPort}`, marketing: `http://127.0.0.1:${marketingPort}` }, readiness: { database: "ready", migrations: "ready" } }));',
    'if (leaveOwnedResources) { const runDirectory = join(repositoryRoot, ".eve/dev-runs"); mkdirSync(runDirectory, { recursive: true }); writeFileSync(join(runDirectory, `run-${runId}.json`), "{}\\n"); }',
    'const webSpecs = [{ title: "reports settled background work, and answers a later question from evidence", file: wrongKnownPath ? "nested/completion-journey.spec.ts" : "completion-journey.spec.ts", tests: [{ projectName: "chromium", status: includeUnknownSkip ? "expected" : "skipped" }] }, ...(includeUnknownSkip ? [{ title: "unrelated skipped test", file: "other.spec.ts", tests: [{ projectName: "chromium", status: "skipped" }] }] : []), { title: "synthetic green test", file: "smoke.spec.ts", tests: [{ projectName: "chromium", status: "expected" }] }];',
    'const specs = step === "web" ? webSpecs : [{ title: "SendBlue UI test", file: "sendblue-otp.spec.ts", tests: [{ projectName: "chromium", status: "expected" }] }];',
    'const skipped = specs.reduce((total, spec) => total + spec.tests.filter((test) => test.status === "skipped").length, 0);',
    'const expected = specs.reduce((total, spec) => total + spec.tests.filter((test) => test.status === "expected").length, 0);',
    "mkdirSync(dirname(reportPath), { recursive: true });",
    'writeFileSync(reportPath, JSON.stringify({ stats: { expected, unexpected: 0, skipped, flaky: 0 }, suites: [{ title: "fixture", file: "tests/e2e", specs }] }));',
    "mkdirSync(reportDirectory, { recursive: true });",
    'writeFileSync(join(reportDirectory, "index.html"), "synthetic report");',
    "mkdirSync(join(artifactRoot, `test-results-e2e-${step}`), { recursive: true });",
    "",
  ].join("\n");
}

function dockerStubScript(mode: E2eStubMode) {
  if (mode === "e2e-docker-query-fails") return "#!/bin/sh\nexit 17\n";
  if (mode === "e2e-orphaned-resources") {
    return "#!/bin/sh\nprintf '%s\\n' 'synthetic-owned-resource'\n";
  }
  return "#!/bin/sh\nexit 0\n";
}

function git(repository: string, args: string[]) {
  execFileSync("git", args, {
    cwd: repository,
    env: {
      PATH: hostPath(),
      HOME: repository,
      NODE_ENV: "test",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Verification Fixture",
      GIT_AUTHOR_EMAIL: "verification-fixture@example.invalid",
      GIT_COMMITTER_NAME: "Verification Fixture",
      GIT_COMMITTER_EMAIL: "verification-fixture@example.invalid",
    },
    stdio: "ignore",
  });
}

function runChecks(fixture: { root: string; repository: string; bin: string }) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "--lane", "checks"],
    {
      cwd: fixture.repository,
      env: {
        PATH: `${fixture.bin}${process.platform === "win32" ? ";" : ":"}${hostPath()}`,
        HOME: fixture.root,
        TMPDIR: fixture.root,
        NODE_ENV: "test",
        VERIFY_PARENT_ONLY_CANARY: canary,
      },
      encoding: "utf8",
      timeout: 30_000,
    }
  );
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runE2e(fixture: { root: string; repository: string; bin: string }) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "--lane", "e2e"],
    {
      cwd: fixture.repository,
      env: {
        PATH: `${fixture.bin}${process.platform === "win32" ? ";" : ":"}${hostPath()}`,
        HOME: fixture.root,
        TMPDIR: fixture.root,
        NODE_ENV: "test",
      },
      encoding: "utf8",
      timeout: 30_000,
    }
  );
  if (result.error !== undefined) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function readReceipt(repository: string) {
  const runRoot = join(repository, ".eve/verify");
  const runIds = await readdir(runRoot);
  expect(runIds).toHaveLength(1);
  const source = await readFile(
    join(runRoot, runIds[0] ?? "", "receipt.json"),
    "utf8"
  );
  const parsed: unknown = JSON.parse(source);
  return z
    .object({
      status: z.string(),
      runId: z.uuid(),
      selectedLanes: z.array(z.string()),
      sourceFingerprint: z.string(),
      sourceFingerprintAtEnd: z.string(),
      lanes: z.record(
        z.string(),
        z.object({
          status: z.string(),
          cleanup: z.enum(["passed", "failed", "not-applicable", "unknown"]),
          tests: z.unknown(),
          databases: z.union([
            z.literal("not-applicable"),
            z.array(z.record(z.string(), z.unknown())),
          ]),
          knownExclusions: z.array(
            z.object({
              file: z.string(),
              title: z.string(),
              projectName: z.string(),
              reason: z.string(),
            })
          ),
          targets: z.union([
            z.literal("not-applicable"),
            z.array(z.record(z.string(), z.unknown())),
          ]),
          explanation: z.string().optional(),
          steps: z.array(
            z.object({
              id: z.string(),
              status: z.string(),
              exitCode: z.number().nullable(),
              outputLog: z
                .object({
                  path: z.string(),
                  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
                  truncated: z.boolean(),
                })
                .optional(),
            })
          ),
        })
      ),
    })
    .parse(parsed);
}

function requireValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`${description} is missing.`);
  return value;
}

function hostPath() {
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Unit fixtures need the executable path only to launch isolated local processes.
  return process.env.PATH ?? "/usr/bin:/bin";
}
