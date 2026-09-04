import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { waitForSupervisorClose } from "./helpers/supervisor-process";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("contract eval supervisor", { timeout: 20_000 }, () => {
  it("runs both model-free suites with isolated local services", async () => {
    const result = await runSupervisor(
      {
        AI_GATEWAY_API_KEY: "must-be-removed",
        VERCEL_OIDC_TOKEN: "must-also-be-removed",
      },
      ["--junit", ".eve/contract.xml"]
    );

    expect(result.code).toBe(0);
    const lines = result.commands.trim().split("\n");
    expect(lines[0]).toMatch(
      /^docker compose --project-name open-instinct-contract-[a-f0-9]{8}-[a-f0-9]{8} up --detach --wait postgres$/u
    );
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^pnpm db:migrate\|.*\|fixture=1\|scope=enforce\|gateway=absent\|oidc=absent$/u
      )
    );
    expect(lines).toContainEqual(
      expect.stringContaining("pnpm exec tsx evals/square/setup-access.ts")
    );
    expect(lines).toContainEqual(
      expect.stringContaining("pnpm exec eve extension build")
    );
    expect(lines).toContainEqual(
      expect.stringContaining(
        "pnpm exec eve eval contract --strict --tag contract --max-concurrency 1 --skip-report --junit .eve/contract.xml"
      )
    );
    expect(lines).toContainEqual(
      expect.stringContaining(
        "pnpm exec eve eval --strict --tag contract-mount --max-concurrency 1 --skip-report --junit .eve/contract-mount.xml"
      )
    );
    expect(lines.at(-1)).toMatch(
      /^docker compose --project-name open-instinct-contract-[a-f0-9]{8}-[a-f0-9]{8} down --volumes$/u
    );
  });

  it.each([["--url"], ["different-eval-path"]])(
    "rejects the unsafe argument %s before starting Docker",
    async (argument) => {
      const result = await runSupervisor({}, [argument]);

      expect(result.code).toBe(1);
      expect(result.commands).toBe("");
      expect(result.stderr).toContain("Unsupported contract eval argument");
    }
  );

  it("tears down after a core eval failure and skips the mount suite", async () => {
    const result = await runSupervisor({ EVAL_EXIT_CODE: "1" });

    expect(result.code).toBe(1);
    expect(result.commands).not.toContain("--tag contract-mount");
    expect(result.commands.trim().split("\n").at(-1)).toMatch(
      / down --volumes$/u
    );
  });
});

async function runSupervisor(
  environment: Record<string, string> = {},
  args: string[] = []
) {
  const directory = await mkdtemp(join(tmpdir(), "contract-evals-"));
  temporaryDirectories.push(directory);
  const logPath = join(directory, "commands.log");
  const dockerPath = join(directory, "docker");
  const pnpmPath = join(directory, "pnpm");
  await Promise.all([
    writeFile(
      dockerPath,
      `#!/bin/sh
printf 'docker %s\n' "$*" >> "$EVAL_SUPERVISOR_LOG"
if [ "$4" = "port" ]; then
  printf '127.0.0.1:49152\n'
fi
`
    ),
    writeFile(
      pnpmPath,
      `#!/bin/sh
if [ -n "\${AI_GATEWAY_API_KEY+x}" ]; then gateway=present; else gateway=absent; fi
if [ -n "\${VERCEL_OIDC_TOKEN+x}" ]; then oidc=present; else oidc=absent; fi
printf 'pnpm %s|cwd=%s|fixture=%s|scope=%s|gateway=%s|oidc=%s\n' "$*" "$PWD" "$EVAL_CONTRACT_FIXTURE" "$WORKSPACE_SCOPE_ENFORCEMENT" "$gateway" "$oidc" >> "$EVAL_SUPERVISOR_LOG"
case "$*" in
  *"eve eval contract "*) exit "\${EVAL_EXIT_CODE:-0}" ;;
esac
`
    ),
  ]);
  await Promise.all([chmod(dockerPath, 0o755), chmod(pnpmPath, 0o755)]);

  const supervisor = spawn(
    process.execPath,
    [
      new URL("../scripts/run-contract-evals.ts", import.meta.url).pathname,
      ...args,
    ],
    {
      env: {
        EVAL_SUPERVISOR_LOG: logPath,
        NODE_ENV: "test",
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

  return {
    code: await waitForSupervisorClose(supervisor),
    commands: await readFile(logPath, "utf8").catch(() => ""),
    stderr,
  };
}
