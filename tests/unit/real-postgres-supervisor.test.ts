import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  waitForSupervisorClose,
  waitForSupervisorLogEntry,
} from "../helpers/supervisor-process";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("required real Postgres supervisor", { timeout: 15_000 }, () => {
  it("forces real Postgres in a fresh owned project and removes paid credentials", async () => {
    const first = await runSupervisor();
    const second = await runSupervisor();
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    const project = /--project-name (open-instinct-ci-[a-f0-9]{32}) /u.exec(
      first.commands
    )?.[1];
    expect(project).toBeDefined();
    if (!project)
      throw new Error("Supervisor did not record its owned project.");
    expect(first.commands).toContain(`mode=1|project=${project}|paid=absent`);
    expect(first.commands).toContain(
      "test:integration tests/integration/real-postgres.test.ts --reporter=default --reporter=junit --outputFile=.eve/ci/real-postgres.xml"
    );
    expect(first.commands.trim().split("\n").at(-1)).toBe(
      `docker compose --project-name ${project} down --volumes`
    );
    expect(second.commands).not.toContain(project);
  });

  it.each([
    ["UP_EXIT", "12"],
    ["TEST_EXIT", "13"],
    ["DOWN_EXIT", "14"],
  ])("fails and cleans up when %s fails", async (key, code) => {
    const result = await runSupervisor({ [key]: code });
    expect(result.code).not.toBe(0);
    expect(result.commands.trim().split("\n").at(-1)).toContain(
      " down --volumes"
    );
    expect(result.commands.includes("pnpm ")).toBe(key !== "UP_EXIT");
  });

  it.each(["up", "test"])(
    "cancellation during %s cannot pass and still tears down",
    async (phase) => {
      const result = await runSupervisor({ BLOCK_PHASE: phase }, "SIGTERM");
      expect(result.code).toBe(143);
      expect(result.commands).toContain(`blocked ${phase}`);
      expect(result.commands.trim().split("\n").at(-1)).toContain(
        " down --volumes"
      );
      expect(result.commands.includes("pnpm ")).toBe(phase !== "up");
    }
  );

  it("finishes owned teardown when cancellation arrives during cleanup", async () => {
    const result = await runSupervisor({ BLOCK_PHASE: "down" }, "SIGTERM");
    expect(result.code).toBe(143);
    expect(result.commands).toContain("teardown finished");
  });

  it("bounds a child that ignores cancellation", async () => {
    const result = await runSupervisor(
      { BLOCK_PHASE: "test", IGNORE_SIGNAL: "1" },
      "SIGTERM"
    );
    expect(result.code).toBe(143);
    expect(result.commands.trim().split("\n").at(-1)).toContain(
      " down --volumes"
    );
  });
});

async function runSupervisor(
  environment: Record<string, string> = {},
  signal?: NodeJS.Signals
) {
  const directory = await mkdtemp(join(tmpdir(), "required-postgres-"));
  directories.push(directory);
  const logPath = join(directory, "commands.log");
  const block = `
if [ "$BLOCK_PHASE" = "$phase" ]; then
  printf 'blocked %s\\n' "$phase" >> "$SUPERVISOR_LOG"
  if [ "$phase" = "down" ]; then
    /bin/sleep 1
    printf 'teardown finished\\n' >> "$SUPERVISOR_LOG"
    exit 0
  fi
  trap 'exit 0' TERM INT HUP
  if [ "$IGNORE_SIGNAL" = "1" ]; then trap '' TERM INT HUP; fi
  while :; do /bin/sleep 1; done
fi
`;
  await Promise.all([
    writeFile(
      join(directory, "docker"),
      `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$SUPERVISOR_LOG"
phase="$4"
${block}
case "$phase" in
  up) exit "\${UP_EXIT:-0}" ;;
  down) exit "\${DOWN_EXIT:-0}" ;;
esac
`
    ),
    writeFile(
      join(directory, "pnpm"),
      `#!/bin/sh
paid=absent
if [ -n "\${AI_GATEWAY_API_KEY+x}" ] || [ -n "\${VERCEL_OIDC_TOKEN+x}" ]; then paid=present; fi
printf 'pnpm %s|mode=%s|project=%s|paid=%s\\n' "$*" "$REAL_PG" "$REAL_PG_COMPOSE_PROJECT" "$paid" >> "$SUPERVISOR_LOG"
phase=test
${block}
exit "\${TEST_EXIT:-0}"
`
    ),
  ]);
  await Promise.all([
    chmod(join(directory, "docker"), 0o755),
    chmod(join(directory, "pnpm"), 0o755),
  ]);
  const child = spawn(
    process.execPath,
    [new URL("../../scripts/test-real-postgres.ts", import.meta.url).pathname],
    {
      env: {
        NODE_ENV: "test",
        PATH: directory,
        SUPERVISOR_LOG: logPath,
        REAL_PG: "0",
        REAL_PG_COMPOSE_PROJECT: "do-not-touch",
        AI_GATEWAY_API_KEY: "synthetic",
        VERCEL_OIDC_TOKEN: "synthetic",
        ...environment,
      },
      stdio: "ignore",
    }
  );
  const completion = waitForSupervisorClose(child);
  if (signal) {
    await waitForSupervisorLogEntry(
      logPath,
      `blocked ${String(environment.BLOCK_PHASE)}`
    );
    child.kill(signal);
  }
  return { code: await completion, commands: await readFile(logPath, "utf8") };
}
