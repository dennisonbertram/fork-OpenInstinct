import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { makePlaywrightEnvironment } from "../../scripts/verification/environment.ts";
import { fingerprintSource } from "../../scripts/verification/fingerprint.ts";
import { selectQuickLanes } from "../../scripts/verification/lanes.ts";
import {
  hasRequiredCheckTestEvidence,
  parseJUnitFiles,
  parsePlaywrightJson,
  parseVitestSummaries,
} from "../../scripts/verification/results.ts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("verification lane selection and reports", () => {
  it.each([
    ["tests/unit/new.test.ts", ["checks"]],
    ["tests/integration/real-postgres.test.ts", ["real-postgres"]],
    ["tests/e2e/new.spec.ts", ["e2e"]],
    ["evals/contract/new.eval.ts", ["contract-evals"]],
    ["docs/CONTRACT_EVALS.md", ["contract-evals"]],
    [
      "src/auth.ts",
      ["checks", "build", "real-postgres", "contract-evals", "e2e"],
    ],
    [
      "unknown-owner/file.ts",
      ["checks", "build", "real-postgres", "contract-evals", "e2e"],
    ],
    [
      "pnpm-lock.yaml",
      ["checks", "build", "real-postgres", "contract-evals", "e2e"],
    ],
  ] as const)("selects fail-closed evidence for %s", (path, selected) => {
    const result = selectQuickLanes([path]);
    expect(result.selected).toEqual(selected);
    expect(result.completeFallback).toBe(selected.length === 5);
  });

  it("treats an empty selection as the full gate", () => {
    const result = selectQuickLanes([]);
    expect(result.selected).toHaveLength(5);
    expect(result.completeFallback).toBe(true);
  });

  it("requires multiple non-empty Vitest summaries and preserves flaky and skipped counts", () => {
    expect(parseVitestSummaries("Tests 0 passed (0)\n")).toBeUndefined();
    expect(
      parseVitestSummaries(
        "Tests 3 passed | 6 skipped (9)\nlocal-vault-assistant:test:app: Tests 2 passed (2)\n"
      )
    ).toEqual({
      summaryCount: 2,
      counts: {
        discovered: 11,
        passed: 5,
        failed: 0,
        skipped: 6,
        flaky: 0,
      },
    });
    const installedPnpmOutput = [
      "local-vault-assistant:test:app: $ vitest run",
      "local-vault-assistant:test:app:       Tests  1881 passed | 6 skipped (1887)",
      "$ pnpm typecheck && pnpm test && pnpm build",
      "$ tsc --noEmit",
      "$ vitest run",
      " RUN v4.1.11 /worktree/apps/marketing",
      " Test Files  14 passed (14)",
      "      Tests  60 passed (60)",
    ].join("\n");
    expect(hasRequiredCheckTestEvidence(installedPnpmOutput)).toBe(true);
    expect(
      hasRequiredCheckTestEvidence(
        installedPnpmOutput.replace(
          "local-vault-assistant:test:app:       Tests  1881 passed | 6 skipped (1887)",
          ""
        )
      )
    ).toBe(false);
    expect(
      hasRequiredCheckTestEvidence(
        installedPnpmOutput.replace(
          "Tests  60 passed (60)",
          "Tests  0 passed (0)"
        )
      )
    ).toBe(false);
    expect(
      hasRequiredCheckTestEvidence(
        installedPnpmOutput.replace(
          " RUN v4.1.11 /worktree/apps/marketing",
          " RUN v4.1.11 /worktree"
        )
      )
    ).toBe(false);
    const playwrightReport = parsePlaywrightJson(
      JSON.stringify({
        stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 1 },
        suites: [
          {
            specs: [
              {
                title: "first test",
                file: "tests/e2e/example.spec.ts",
                tests: [
                  { projectName: "chromium", status: "expected" },
                  { projectName: "firefox", status: "expected" },
                ],
              },
              {
                title: "retry-pass test",
                file: "tests/e2e/retry.spec.ts",
                tests: [{ projectName: "chromium", status: "flaky" }],
              },
            ],
          },
        ],
      })
    );
    expect(playwrightReport?.counts.flaky).toBe(1);
    expect(playwrightReport?.tests).toHaveLength(3);
  });

  it("preserves the file, title, project, and status for each skipped Playwright case", () => {
    const report = parsePlaywrightJson(
      JSON.stringify({
        stats: { expected: 0, unexpected: 0, skipped: 1, flaky: 0 },
        suites: [
          {
            specs: [
              {
                title:
                  "reports settled background work, and answers a later question from evidence",
                file: "tests/e2e/completion-journey.spec.ts",
                tests: [{ projectName: "chromium", status: "skipped" }],
              },
            ],
          },
        ],
      })
    );
    expect(report?.counts.skipped).toBe(1);
    expect(report?.tests).toEqual([
      {
        file: "tests/e2e/completion-journey.spec.ts",
        title:
          "reports settled background work, and answers a later question from evidence",
        projectName: "chromium",
        status: "skipped",
      },
    ]);
  });

  it("counts required JUnit cases and does not accept empty reports", async () => {
    const directory = await temporaryDirectory();
    const report = join(directory, "report.xml");
    await writeFile(
      report,
      '<testsuites><testsuite tests="3" failures="0" errors="0" skipped="0"/></testsuites>',
      "utf8"
    );
    await expect(
      parseJUnitFiles([join(directory, "missing.xml")])
    ).resolves.toMatchObject({
      files: 0,
      counts: { discovered: 0 },
    });
    await expect(parseJUnitFiles([report])).resolves.toMatchObject({
      files: 1,
      counts: { discovered: 3, passed: 3, failed: 0, skipped: 0 },
    });
  });

  it("selects an owned dynamic app port and the synthetic SendBlue fixture only for that lane", () => {
    const base: NodeJS.ProcessEnv = {
      CI: "1",
      DEV_PROFILE: "fixture",
      DEV_RUN_ID: "verify-fixed-web",
      NODE_ENV: "test",
    };
    const web = makePlaywrightEnvironment(
      base,
      "web",
      "/tmp/verify-run",
      "run-id",
      "a".repeat(48),
      repositoryRoot
    );
    const sendblue = makePlaywrightEnvironment(
      base,
      "sendblue",
      "/tmp/verify-run",
      "run-id",
      "a".repeat(48),
      repositoryRoot
    );
    expect(web.DEV_FIXTURE_SCENARIO).toBeUndefined();
    expect(sendblue.DEV_FIXTURE_SCENARIO).toBe("sendblue-ui");
    expect(web.DEV_RUN_ID).not.toBe(sendblue.DEV_RUN_ID);
    expect(web.PLAYWRIGHT_JSON_OUTPUT_NAME).not.toBe(
      sendblue.PLAYWRIGHT_JSON_OUTPUT_NAME
    );
  });
});

describe("verification source identity and environment guard", () => {
  it("keeps the env-file guard through installed Turbo strict mode and forces fresh task execution", async () => {
    const repository = await realpath(await temporaryDirectory());
    const home = await temporaryDirectory();
    const canary = "synthetic-turbo-parent-canary-62ad";
    await writeFile(
      join(repository, ".env.local"),
      `PRIVATE_VALUE=${canary}\n`,
      "utf8"
    );

    const turboConfigText = await readFile(
      join(repositoryRoot, "turbo.json"),
      "utf8"
    );
    const turboConfigInput: unknown = JSON.parse(turboConfigText);
    const testTask = z
      .object({
        tasks: z.object({
          "test:app": z.object({
            cache: z.boolean(),
            env: z.array(z.string()),
            passThroughEnv: z.array(z.string()),
            outputs: z.array(z.string()),
          }),
        }),
      })
      .parse(turboConfigInput).tasks["test:app"];
    expect(testTask.passThroughEnv).toEqual([
      "NODE_OPTIONS",
      "VERIFY_REPO_ROOT",
      "VERIFY_RUN_ID",
    ]);

    // Enable caching only in the fixture to prove that TURBO_FORCE bypasses a reusable result.
    const fixtureTask = { ...testTask, cache: true };
    await writeFile(
      join(repository, "package.json"),
      JSON.stringify({
        name: "turbo-verification-boundary-fixture",
        private: true,
        packageManager: "npm@11.12.1",
        devDependencies: { turbo: "2.10.12" },
        scripts: { "test:app": "node verify-task.mjs" },
      }),
      "utf8"
    );
    await writeFile(
      join(repository, "turbo.json"),
      JSON.stringify({ tasks: { "test:app": fixtureTask } }),
      "utf8"
    );
    await mkdir(join(repository, "node_modules"), { recursive: true });
    await symlink(
      join(repositoryRoot, "node_modules/turbo"),
      join(repository, "node_modules/turbo"),
      "dir"
    );
    await writeFile(
      join(repository, "verify-task.mjs"),
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        'import { join } from "node:path";',
        "const root = process.env.VERIFY_REPO_ROOT;",
        'if (root !== process.cwd() || process.env.VERIFY_RUN_ID !== "verify-turbo-boundary") process.exit(1);',
        "let blocked = false;",
        'try { readFileSync(join(root, ".env.local"), "utf8"); } catch (error) { blocked = error instanceof Error && "code" in error && error.code === "ENOENT"; }',
        "if (!blocked || process.env.VERIFY_PARENT_ONLY_CANARY !== undefined) process.exit(2);",
        'const countPath = join(process.env.HOME ?? root, "turbo-verification-runs");',
        "let count = 0;",
        'try { count = Number(readFileSync(countPath, "utf8")); } catch {}',
        "if (!Number.isSafeInteger(count)) process.exit(3);",
        "writeFileSync(countPath, String(count + 1), { mode: 0o600 });",
        "process.stdout.write(`TURBO_GUARD_PROOF: run=${count + 1} env=blocked canary=absent\\n`);",
      ].join("\n"),
      "utf8"
    );

    const guardUrl = new URL(
      "../../scripts/verification/deny-env-files.mjs",
      import.meta.url
    ).href;
    const turboPath = join(repositoryRoot, "node_modules/turbo/bin/turbo");
    for (const expectedRun of [1, 2]) {
      const result = spawnSync(
        process.execPath,
        [turboPath, "run", "test:app", "--output-logs=full"],
        {
          cwd: repository,
          env: {
            PATH: hostPath(),
            HOME: home,
            NODE_ENV: "test",
            CI: "1",
            TURBO_FORCE: "true",
            TURBO_TELEMETRY_DISABLED: "1",
            TURBO_NO_UPDATE_NOTIFIER: "1",
            NODE_OPTIONS: `--import=${guardUrl}`,
            VERIFY_REPO_ROOT: repository,
            VERIFY_RUN_ID: "verify-turbo-boundary",
            VERIFY_PARENT_ONLY_CANARY: canary,
          },
          encoding: "utf8",
          timeout: 20_000,
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `TURBO_GUARD_PROOF: run=${String(expectedRun)} env=blocked canary=absent`
      );
      expect(result.stdout + result.stderr).not.toContain(canary);
    }
  });

  it("binds executable mode changes and refuses changed symlinks outside the worktree", async () => {
    const repository = await gitFixture();
    const script = join(repository, "init.sh");
    await writeFile(script, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(script, 0o644);
    git(repository, ["add", "init.sh"]);
    git(repository, ["commit", "--quiet", "-m", "tracked startup script"]);
    await writeFile(script, "#!/bin/sh\nexit 1\n", "utf8");
    await chmod(script, 0o644);
    const nonExecutable = await fingerprintSource(repository);
    await chmod(script, 0o755);
    const executable = await fingerprintSource(repository);
    expect(executable.digest).not.toBe(nonExecutable.digest);

    const outside = join(dirname(repository), "outside-source");
    await writeFile(outside, "synthetic external target", "utf8");
    await symlink(outside, join(repository, "external-link"));
    git(repository, ["add", "external-link"]);
    await expect(fingerprintSource(repository)).rejects.toThrow(
      "symlink outside the worktree"
    );
  });

  it("blocks reads and existence probes for repository environment files without outputting contents", async () => {
    const repository = await temporaryDirectory();
    const canary = "synthetic-env-file-canary-3d7b";
    const envPath = join(repository, ".env.local");
    await writeFile(envPath, `PRIVATE_VALUE=${canary}\n`, "utf8");
    const guardPath = join(
      repositoryRoot,
      "scripts/verification/deny-env-files.mjs"
    );
    const source = [
      'import { readFileSync, existsSync, createReadStream } from "node:fs";',
      'import { open, readFile } from "node:fs/promises";',
      "const target = process.env.CHECK_ENV_PATH;",
      "let blocked = false;",
      'try { readFileSync(target, "utf8"); } catch (error) { blocked = error.code === "ENOENT"; }',
      "if (!blocked || existsSync(target)) process.exit(1);",
      'for (const read of [() => readFile(target, "utf8"), () => open(target, "r"), () => createReadStream(target)]) { try { await read(); process.exit(2); } catch (error) { if (error.code !== "ENOENT") process.exit(3); } }',
      'process.stdout.write("environment-file-blocked\\n");',
    ].join("\n");
    const result = spawnSync(
      process.execPath,
      [`--import=${guardPath}`, "--input-type=module", "-e", source],
      {
        cwd: repository,
        env: {
          PATH: hostPath(),
          NODE_ENV: "test",
          VERIFY_REPO_ROOT: repository,
          CHECK_ENV_PATH: envPath,
        },
        encoding: "utf8",
        timeout: 5_000,
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("environment-file-blocked");
    expect(result.stdout + result.stderr).not.toContain(canary);
  });
});

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "verification-contract-"));
  temporaryRoots.push(path);
  return path;
}

async function gitFixture() {
  const repository = await temporaryDirectory();
  await writeFile(join(repository, ".gitignore"), ".eve/\n", "utf8");
  git(repository, ["init", "--quiet"]);
  git(repository, ["config", "user.name", "Verification Contract"]);
  git(repository, [
    "config",
    "user.email",
    "verification-contract@example.invalid",
  ]);
  git(repository, ["add", ".gitignore"]);
  git(repository, ["commit", "--quiet", "-m", "fixture base"]);
  return repository;
}

function git(repository: string, args: string[]) {
  execFileSync("git", args, {
    cwd: repository,
    env: {
      PATH: hostPath(),
      HOME: repository,
      NODE_ENV: "test",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Verification Contract",
      GIT_AUTHOR_EMAIL: "verification-contract@example.invalid",
      GIT_COMMITTER_NAME: "Verification Contract",
      GIT_COMMITTER_EMAIL: "verification-contract@example.invalid",
    },
    stdio: "ignore",
  });
}

function hostPath() {
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Unit fixtures need the executable path only to launch isolated local processes.
  return process.env.PATH ?? "/usr/bin:/bin";
}
