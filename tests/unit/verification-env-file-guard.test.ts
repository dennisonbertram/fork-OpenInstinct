import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const guardPath = join(
  repositoryRoot,
  "scripts/verification/deny-env-files.mjs"
);

describe("verification environment-file guard", () => {
  it("returns rejected promises so missing-file fallbacks can handle protected paths", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", guardPath, "--input-type=module", "--eval", source],
      {
        env: {
          // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- The isolated child needs the host executable path only.
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          NODE_ENV: "test",
          VERIFY_REPO_ROOT: "/tmp/verification-env-promise-guard-nonexistent",
        },
        encoding: "utf8",
        timeout: 5_000,
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("guarded-promises-rejected");
  });

  it("emulates an optional missing file for statSync", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", guardPath, "--input-type=module", "--eval", statSyncSource],
      {
        env: {
          // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- The isolated child needs the host executable path only.
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          NODE_ENV: "test",
          VERIFY_REPO_ROOT: "/tmp/verification-env-stat-guard-nonexistent",
        },
        encoding: "utf8",
        timeout: 5_000,
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("optional-stat-blocked");
  });

  it("lets Eve list the contract eval after its guarded development-environment fallback", () => {
    const result = spawnSync(
      process.execPath,
      [
        join(repositoryRoot, "node_modules/eve/bin/eve.js"),
        "eval",
        "contract",
        "--strict",
        "--tag",
        "contract",
        "--max-concurrency",
        "1",
        "--skip-report",
        "--list",
      ],
      {
        cwd: repositoryRoot,
        env: contractListEnvironment(),
        encoding: "utf8",
        timeout: 30_000,
      }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(
      "Verification does not load repository environment files."
    );
  });
});

function contractListEnvironment(): NodeJS.ProcessEnv {
  return {
    // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- The isolated CLI needs the host executable path only.
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    BETTER_AUTH_SECRET: "contract-eval-local-auth-secret-placeholder",
    BETTER_AUTH_URL: "http://127.0.0.1:9",
    CONTRACT_DELIVERY_PROVIDER_URL: "http://127.0.0.1:9",
    CONTRACT_MCP_TOKEN: "contract-mcp-credential",
    CONTRACT_MCP_URL: "http://127.0.0.1:9",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:9/open_instinct",
    DATABASE_URL_UNPOOLED:
      "postgresql://postgres:postgres@127.0.0.1:9/open_instinct",
    EVAL_CONTRACT_FIXTURE: "1",
    KERNEL_API_KEY: "unused-by-contract-evals",
    KERNEL_BASE_URL: "http://127.0.0.1:9",
    NODE_ENV: "development",
    NODE_OPTIONS: `--import=${guardPath}`,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    SQUARE_BASE_URL: "http://127.0.0.1:9",
    SQUARE_ENVIRONMENT: "sandbox",
    SQUARE_SANDBOX_ACCESS_TOKEN: "contract-eval-token",
    SECRET_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    VERIFY_REPO_ROOT: repositoryRoot,
    VERIFY_RUN_ID: "verification-env-list",
    WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
  };
}

const source = [
  'import fs from "node:fs";',
  'import { open, readFile, stat } from "node:fs/promises";',
  'const target = process.env.VERIFY_REPO_ROOT + "/.env.local";',
  "const operations = [",
  '  () => readFile(target, "utf8"),',
  '  () => open(target, "r"),',
  "  () => stat(target),",
  '  () => fs.promises.readFile(target, "utf8"),',
  '  () => fs.promises.open(target, "r"),',
  "  () => fs.promises.stat(target),",
  "];",
  "for (const operation of operations) {",
  "  let pending;",
  "  try { pending = operation(); } catch { process.exit(20); }",
  '  if (typeof pending?.then !== "function") process.exit(21);',
  "  let rejected = false;",
  '  await pending.catch((error) => { rejected = error?.code === "ENOENT"; });',
  "  if (!rejected) process.exit(22);",
  "}",
  'process.stdout.write("guarded-promises-rejected\\n");',
].join("\n");

const statSyncSource = [
  'import { statSync } from "node:fs";',
  'const target = process.env.VERIFY_REPO_ROOT + "/.env";',
  "let optional;",
  "try { optional = statSync(target, { throwIfNoEntry: false }); } catch { process.exit(30); }",
  "if (optional !== undefined) process.exit(31);",
  "let blocked = false;",
  'try { statSync(target); } catch (error) { blocked = error?.code === "ENOENT"; }',
  "if (!blocked) process.exit(32);",
  'process.stdout.write("optional-stat-blocked\\n");',
].join("\n");
