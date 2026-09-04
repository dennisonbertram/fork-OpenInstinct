import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SUPERVISOR_TEST_TIMEOUT_MS,
  waitForSupervisorClose,
  waitForSupervisorLogEntry,
} from "./helpers/supervisor-process";

const temporaryDirectories: string[] = [];
const supervisorTestOptions = { timeout: SUPERVISOR_TEST_TIMEOUT_MS };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe("agent eval supervisor", supervisorTestOptions, () => {
  it("runs migrations and the filtered suite against an isolated database", async () => {
    const result = await runSupervisor({
      AI_GATEWAY_API_KEY: "test-gateway-key",
      KERNEL_API_KEY: "real-key-that-must-not-reach-evals",
    });

    expect(result.code).toBe(0);
    const lines = result.commands.trim().split("\n");
    const project = projectFromComposeCommand(lines[0]);
    expect(lines).toEqual([
      `compose --project-name ${project} up --detach --wait postgres`,
      `compose --project-name ${project} port postgres 5432`,
      "pnpm db:migrate postgresql://postgres:postgres@127.0.0.1:49152/open_instinct development unused-by-agent-evals http://127.0.0.1:9 http://127.0.0.1:9",
      "pnpm exec tsx evals/square/setup-access.ts postgresql://postgres:postgres@127.0.0.1:49152/open_instinct development unused-by-agent-evals http://127.0.0.1:9 http://127.0.0.1:9",
      "pnpm exec eve eval agent --strict --max-concurrency 1 --timeout 180000 --tag smoke postgresql://postgres:postgres@127.0.0.1:49152/open_instinct development unused-by-agent-evals http://127.0.0.1:9 http://127.0.0.1:9",
      `compose --project-name ${project} down --volumes`,
    ]);
  });

  it("requires model credentials before starting Docker", async () => {
    const result = await runSupervisor();

    expect(result.code).toBe(1);
    expect(result.commands).toBe("");
    expect(result.stderr).toContain(
      "Agent evals require AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN."
    );
  });

  it("requires an explicit budget before starting a paid agent eval", async () => {
    const result = await runSupervisor(
      {
        AI_GATEWAY_API_KEY: "test-gateway-key",
      },
      ["--tag", "smoke"]
    );

    expect(result.code).toBe(1);
    expect(result.commands).toBe("");
    expect(result.stderr).toContain("--max-cost-usd");
  });

  it("reserves a caller-supplied estimate before starting Docker", async () => {
    const result = await runSupervisor(
      { AI_GATEWAY_API_KEY: "test-gateway-key" },
      ["--max-cost-usd", "1", "--tag", "smoke"]
    );

    expect(result.code).toBe(1);
    expect(result.commands).toBe("");
    expect(result.stderr).toContain("--estimated-cost-usd");
  });

  it("seeds an explicit test model through the isolated workspace setting", async () => {
    const result = await runSupervisor(
      { AI_GATEWAY_API_KEY: "test-gateway-key" },
      [
        "--max-cost-usd",
        "1",
        "--estimated-cost-usd",
        "0.25",
        "--model",
        "openai/test-model",
        "--tag",
        "smoke",
      ]
    );

    expect(result.code).toBe(0);
    expect(result.commands).toContain(
      "pnpm exec tsx evals/square/setup-access.ts --model openai/test-model"
    );
  });

  it.each([
    [
      "concurrency override",
      [
        "--max-cost-usd",
        "1",
        "--estimated-cost-usd",
        "0.25",
        "--max-concurrency",
        "8",
      ],
    ],
    [
      "remote target",
      [
        "--max-cost-usd",
        "1",
        "--estimated-cost-usd",
        "0.25",
        "--url",
        "https://example.com",
      ],
    ],
    [
      "different eval path",
      ["--max-cost-usd", "1", "--estimated-cost-usd", "0.25", "browser"],
    ],
  ])("rejects a %s before starting Docker", async (_description, args) => {
    const result = await runSupervisor(
      { AI_GATEWAY_API_KEY: "test-gateway-key" },
      args
    );

    expect(result.code).toBe(1);
    expect(result.commands).toBe("");
    expect(result.stderr).toContain("Unsupported agent eval argument");
  });

  it("returns a failing eval exit code after stopping the database", async () => {
    const result = await runSupervisor({
      AI_GATEWAY_API_KEY: "test-gateway-key",
      EVAL_EXIT_CODE: "1",
    });

    expect(result.code).toBe(1);
    expect(result.commands.trim().split("\n").at(-1)).toMatch(
      /^compose --project-name open-instinct-evals-[a-f0-9]{8}-[a-f0-9]{8} down --volumes$/u
    );
  });

  it("retains a failed judged repetition before a successful judged repetition", async () => {
    const result = await runSupervisor(
      {
        AI_GATEWAY_API_KEY: "test-gateway-key",
        EVAL_EXIT_CODES: "1,0",
        EVAL_JUDGE_UNKNOWN: "1",
        EVAL_REPORT_MANIFEST: "1",
      },
      [
        "--max-cost-usd",
        "1",
        "--estimated-cost-usd",
        "0.25",
        "--repetitions",
        "2",
        "--tag",
        "smoke",
      ]
    );

    expect(result.code).toBe(1);
    expect(result.commands.match(/pnpm exec eve eval agent/g)?.length).toBe(2);
    expect(result.manifest).toContain('"verdict":"failed"');
    expect(result.manifest).toContain('"verdict":"passed"');
    expect(result.manifest).toContain('"status":"unknown"');
  });

  it("does not launch a second attempt when reservations exceed the ceiling", async () => {
    const result = await runSupervisor(
      {
        AI_GATEWAY_API_KEY: "test-gateway-key",
        EVAL_JUDGE_UNKNOWN: "1",
        EVAL_REPORT_MANIFEST: "1",
      },
      [
        "--max-cost-usd",
        "0.3",
        "--estimated-cost-usd",
        "0.25",
        "--repetitions",
        "2",
        "--tag",
        "smoke",
      ]
    );

    expect(result.code).toBe(1);
    expect(result.commands.match(/pnpm exec eve eval agent/g)?.length).toBe(1);
    expect(result.stderr).toContain("next estimated attempt would exceed");
  });

  it("returns a signal exit code after cleaning up interrupted startup", async () => {
    const result = await runSupervisor({
      AI_GATEWAY_API_KEY: "test-gateway-key",
      EVAL_BLOCK_ACTION: "up",
    });

    expect(result.code).toBe(130);
    const lines = result.commands.trim().split("\n");
    const project = projectFromComposeCommand(lines[0]);
    expect(lines).toEqual([
      `compose --project-name ${project} up --detach --wait postgres`,
      `compose --project-name ${project} down --volumes`,
    ]);
  });

  it("preserves the signal exit code when the eval process is interrupted", async () => {
    const result = await runSupervisor({
      AI_GATEWAY_API_KEY: "test-gateway-key",
      EVAL_BLOCK_ACTION: "eval",
    });

    expect(result.code).toBe(130);
    const lines = result.commands.trim().split("\n");
    const project = projectFromComposeCommand(lines[0]);
    expect(lines).toEqual([
      `compose --project-name ${project} up --detach --wait postgres`,
      `compose --project-name ${project} port postgres 5432`,
      "pnpm db:migrate postgresql://postgres:postgres@127.0.0.1:49152/open_instinct development unused-by-agent-evals http://127.0.0.1:9 http://127.0.0.1:9",
      "pnpm exec tsx evals/square/setup-access.ts postgresql://postgres:postgres@127.0.0.1:49152/open_instinct development unused-by-agent-evals http://127.0.0.1:9 http://127.0.0.1:9",
      "pnpm exec eve eval agent --strict --max-concurrency 1 --timeout 180000 --tag smoke postgresql://postgres:postgres@127.0.0.1:49152/open_instinct development unused-by-agent-evals http://127.0.0.1:9 http://127.0.0.1:9",
      `compose --project-name ${project} down --volumes`,
    ]);
  });
});

function projectFromComposeCommand(command: string | undefined) {
  const project = command?.match(
    /^compose --project-name (open-instinct-evals-[a-f0-9]{8}-[a-f0-9]{8}) /u
  )?.[1];
  if (!project) {
    throw new Error(`Missing Compose project in: ${String(command)}`);
  }
  return project;
}

async function runSupervisor(
  environment: Record<string, string> = {},
  args = [
    "--max-cost-usd",
    "1",
    "--estimated-cost-usd",
    "0.25",
    "--tag",
    "smoke",
  ]
) {
  const directory = await mkdtemp(join(tmpdir(), "open-instinct-evals-"));
  temporaryDirectories.push(directory);
  const logPath = join(directory, "commands.log");
  const dockerPath = join(directory, "docker");
  const pnpmPath = join(directory, "pnpm");
  const manifestReporterPath = join(directory, "report-manifest.cjs");
  const manifestOutputPath = join(directory, "manifest.json");
  await Promise.all([
    writeFile(
      dockerPath,
      `#!/bin/sh
printf '%s\n' "$*" >> "$EVAL_SUPERVISOR_LOG"
if [ "$4" = "port" ]; then
  printf '127.0.0.1:49152\n'
fi
if [ "$4" = "\${EVAL_BLOCK_ACTION:-never}" ]; then
  trap 'exit 130' INT TERM HUP
  while true; do /bin/sleep 0.1; done
fi
`
    ),
    writeFile(
      pnpmPath,
      `#!/bin/sh
printf 'pnpm %s %s %s %s %s %s\n' "$*" "$DATABASE_URL" "$NODE_ENV" "$KERNEL_API_KEY" "$KERNEL_BASE_URL" "$BETTER_AUTH_URL" >> "$EVAL_SUPERVISOR_LOG"
if [ "$1" = "exec" ]; then
  is_eve=0
  if [ "$2" = "eve" ]; then is_eve=1; fi
  if [ "$is_eve" = "1" ] && [ "\${EVAL_REPORT_MANIFEST:-0}" = "1" ]; then
    "$EVAL_NODE" "$EVAL_MANIFEST_REPORTER" "$EVAL_RUN_MANIFEST_PATH" "$EVAL_RUN_MANIFEST_ATTEMPT_ID"
  fi
  if [ "$2" = "eve" ] && [ "\${EVAL_BLOCK_ACTION:-never}" = "eval" ]; then
    trap 'exit 130' INT TERM HUP
    while true; do /bin/sleep 0.1; done
  fi
  if [ "$is_eve" = "1" ] && [ -n "\${EVAL_EXIT_CODES:-}" ]; then
    count_path="$EVAL_SUPERVISOR_LOG.count"
    count=$(cat "$count_path" 2>/dev/null || echo 0)
    count=$((count + 1))
    printf '%s' "$count" > "$count_path"
    IFS=,
    set -- $EVAL_EXIT_CODES
    current=1
    for code in "$@"; do
      if [ "$current" = "$count" ]; then exit "$code"; fi
      current=$((current + 1))
    done
  fi
  exit "\${EVAL_EXIT_CODE:-0}"
fi
`
    ),
    writeFile(
      manifestReporterPath,
      `const fs = require("node:fs");
const [path, attemptId] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
const attempt = manifest.attempts.find((item) => item.id === attemptId);
const countPath = process.env.EVAL_SUPERVISOR_LOG + ".count";
const count = Number(fs.existsSync(countPath) ? fs.readFileSync(countPath, "utf8") : 0) + 1;
const judged = process.env.EVAL_JUDGE_UNKNOWN === "1";
attempt.cases = [{
  completedAt: "2026-09-04T10:00:01.000Z",
  cost: { actor: { knownCostUsd: 0.01, status: "measured" }, judge: { knownCostUsd: null, status: judged ? "not-observable-from-eve-events" : "not-used" }, total: { knownCostUsd: 0.01, status: judged ? "unknown" : "measured" } },
  id: "agent/conversation/mock-" + count,
  modelIds: ["openai/test-model"],
  startedAt: "2026-09-04T10:00:00.000Z",
  timing: { finalDeliveryMs: null, firstDeliveredBubbleMs: null, status: "not-observable-from-eve-events", totalEvalMs: 1000 },
  verdict: count === 1 ? "failed" : "passed",
}];
attempt.summary = count === 1 ? { errored: 0, failed: 1, passed: 0, skipped: 0 } : { errored: 0, failed: 0, passed: 1, skipped: 0 };
fs.writeFileSync(path, JSON.stringify(manifest));
if (process.env.EVAL_TEST_MANIFEST_OUTPUT) fs.copyFileSync(path, process.env.EVAL_TEST_MANIFEST_OUTPUT);
`
    ),
  ]);
  await Promise.all([chmod(dockerPath, 0o755), chmod(pnpmPath, 0o755)]);

  const supervisor = spawn(
    process.execPath,
    [
      new URL("../scripts/run-agent-evals.ts", import.meta.url).pathname,
      ...args,
    ],
    {
      env: {
        EVAL_SUPERVISOR_LOG: logPath,
        EVAL_MANIFEST_REPORTER: manifestReporterPath,
        EVAL_NODE: process.execPath,
        NODE_ENV: "test",
        EVAL_TEST_MANIFEST_OUTPUT: manifestOutputPath,
        PATH: directory,
        ...environment,
      },
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  supervisor.stderr.setEncoding("utf8");
  let stderr = "";
  supervisor.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = waitForSupervisorClose(supervisor);
  if (environment.EVAL_BLOCK_ACTION) {
    await waitForSupervisorLogEntry(
      logPath,
      ` ${environment.EVAL_BLOCK_ACTION} `
    );
    supervisor.kill("SIGINT");
  }

  return {
    code: await exitCode,
    commands: await readFile(logPath, "utf8").catch(() => ""),
    manifest: await readFile(manifestOutputPath, "utf8").catch(() => ""),
    stderr,
  };
}
