import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  isVerifiedRunChild,
  processStartTime,
  type DevRunProcess,
  type DevRunRecord,
} from "../scripts/local/run-record";
import {
  SUPERVISOR_TEST_TIMEOUT_MS,
  waitForSupervisorClose,
  waitForSupervisorLogEntry,
} from "./helpers/supervisor-process";

const temporaryDirectories: string[] = [];
const supervisorTestOptions = { timeout: SUPERVISOR_TEST_TIMEOUT_MS };
const sourceRoot = resolve(new URL("..", import.meta.url).pathname);
const execFileAsync = promisify(execFile);
const copiedProcessSchema: z.ZodType<DevRunProcess> = z.object({
  pid: z.number().int().positive(),
  processStartTime: z.string().min(1),
  processGroup: z.number().int().positive(),
});
const copiedRunRecordSchema: z.ZodType<DevRunRecord> = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  nonce: z.string(),
  leaseNonce: z.string(),
  profile: z.enum(["connected", "fixture"]),
  cwd: z.string(),
  baseSha: z.string().nullable(),
  startedAt: z.string(),
  owner: copiedProcessSchema,
  composeProject: z.string(),
  volume: z.string(),
  ports: z.object({ app: z.number().int(), marketing: z.number().int() }),
  origins: z.object({ app: z.string(), marketing: z.string() }),
  children: z.object({
    agentation: copiedProcessSchema.optional(),
    app: copiedProcessSchema.optional(),
    marketing: copiedProcessSchema.optional(),
  }),
  readiness: z.record(
    z.string(),
    z.enum(["pending", "ready", "failed", "simulated", "external"])
  ),
});

function syntheticEnvironment(
  values: Record<string, string>
): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    })
  );
});

describe(
  "local development",
  { ...supervisorTestOptions, concurrent: false },
  () => {
    it("tears Compose down when interrupted during startup", async () => {
      const result = await interruptDuringStartup();

      expect(result.code).toBe(130);
      expectIsolatedLifecycle(result.commands);
    });

    it("preserves the established connected Compose project identity", async () => {
      const result = await interruptDuringStartup();
      const project = projectFromComposeCommand(
        result.commands.trim().split("\n")[0]
      );
      const legacyRoot = `${await realpath(result.repositoryRoot)}/`;
      const expected = `open-instinct-${createHash("sha256")
        .update(legacyRoot)
        .digest("hex")
        .slice(0, 12)}`;

      expect(project).toBe(expected);
    });

    it("rejects a missing Kernel key before starting Docker", async () => {
      const result = await runWithoutKernelApiKey();

      expect(result.code).toBe(1);
      expect(result.commands).toBe("");
      expect(result.stderr).toContain(
        "preflight: KERNEL_API_KEY is required for connected local development."
      );
    });

    it("tears Compose down when interrupted during port discovery", async () => {
      const result = await interruptDuringStartup({ DEV_BLOCK_ACTION: "port" });

      expect(result.code).toBe(130);
      const lines = result.commands.trim().split("\n");
      const project = projectFromComposeCommand(lines[0]);
      expect(lines).toEqual([
        `compose --project-name ${project} up --detach --wait postgres`,
        `compose --project-name ${project} port postgres 5432`,
        `compose --project-name ${project} down`,
      ]);
    });

    it("reports teardown failure after an interruption", async () => {
      const result = await interruptDuringStartup({ DEV_DOWN_EXIT: "1" });

      expect(result.code).toBe(1);
      expectIsolatedLifecycle(result.commands);
    });

    it("starts fixture services on isolated explicit ports and cleans them after a process-group signal", async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "open-instinct-group-stop-")
      );
      temporaryDirectories.push(directory);
      const repositoryRoot = await createLifecycleRepository(directory);
      const logPath = join(directory, "commands.log");
      const appPort = await unusedPort();
      const marketingPort = await unusedPort();
      await Promise.all([
        writeFile(
          join(directory, "docker"),
          `#!/bin/sh
printf 'docker %s\\n' "$*" >> "${logPath}"
if [ "$4" = "port" ]; then printf '127.0.0.1:49152\\n'; fi
`
        ),
        writeFile(
          join(directory, "pnpm"),
          `#!${process.execPath}
const http = require("node:http");
const args = process.argv.slice(2);
if (args[0] === "db:migrate") process.exit(0);
const port = args[0] === "dev:agentation" ? 4747 : Number(args[args.indexOf("--port") + 1]);
if (!Number.isInteger(port)) process.exit(1);
http.createServer((_, response) => response.end("ok")).listen(port, "127.0.0.1");
`
        ),
      ]);
      await Promise.all([
        chmod(join(directory, "docker"), 0o755),
        chmod(join(directory, "pnpm"), 0o755),
      ]);
      const runId = `group-stop-${randomBytes(8).toString("hex")}`;
      const supervisor = spawn(
        process.execPath,
        [join(repositoryRoot, "scripts", "dev.ts")],
        {
          cwd: repositoryRoot,
          detached: true,
          env: syntheticEnvironment({
            DEV_PROFILE: "fixture",
            DEV_RUN_ID: runId,
            PATH: directory,
            PORT: String(appPort),
            MARKETING_PORT: String(marketingPort),
          }),
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
      if (supervisor.pid === undefined)
        throw new Error("Copied supervisor did not expose a PID.");
      try {
        const exitCode = waitForSupervisorClose(supervisor);
        await waitForSupervisorOutput(supervisor, '"lifecycle":"ready"');
        const recordPath = await onlyRunRecord(repositoryRoot);
        const record = copiedRunRecordSchema.parse(
          JSON.parse(await readFile(recordPath, "utf8"))
        );
        const expectedProject = `open-instinct-fixture-${createHash("sha256")
          .update(await realpath(repositoryRoot))
          .digest("hex")
          .slice(0, 8)}-${createHash("sha256")
          .update(runId)
          .digest("hex")
          .slice(0, 12)}`;
        expect(record.composeProject).toBe(expectedProject);
        expect(record.volume).toBe(`${expectedProject}_postgres-data`);
        expect(record.ports).toEqual({
          app: appPort,
          marketing: marketingPort,
        });
        expect(record.origins).toEqual({
          app: `http://127.0.0.1:${String(appPort)}`,
          marketing: `http://127.0.0.1:${String(marketingPort)}`,
        });

        process.kill(-supervisor.pid, "SIGTERM");

        expect(await exitCode).toBe(143);
        expect(await readFile(logPath, "utf8")).toContain(
          "docker compose --project-name open-instinct-fixture-"
        );
        expect(await readFile(logPath, "utf8")).toContain(" down --volumes\n");
        await expect(stat(recordPath)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        killOwnedGroup(supervisor.pid);
        await waitForExit(supervisor.pid);
      }
    });

    it("recovers a manifest preserved after failed startup cleanup", async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "open-instinct-cleanup-recovery-")
      );
      temporaryDirectories.push(directory);
      const repositoryRoot = await createLifecycleRepository(directory);
      const logPath = join(directory, "commands.log");
      const allowDownPath = join(directory, "allow-down");
      const blockStartupPath = join(directory, "block-startup");
      const failMigratePath = join(directory, "fail-migrate");
      const appPort = await unusedPort();
      const marketingPort = await unusedPort();
      await Promise.all([
        writeFile(blockStartupPath, "block\n"),
        writeFile(
          join(directory, "docker"),
          `#!/bin/sh
printf 'docker %s\\n' "$*" >> "${logPath}"
if [ "$4" = "up" ] && [ -f "${blockStartupPath}" ]; then
  exit 130
fi
if [ "$4" = "port" ]; then printf '127.0.0.1:49152\\n'; fi
if [ "$4" = "down" ] && [ ! -f "${allowDownPath}" ]; then exit 1; fi
`
        ),
        writeFile(
          join(directory, "pnpm"),
          `#!/bin/sh
if [ "$1" = "db:migrate" ] && [ -f "${failMigratePath}" ]; then exit 7; fi
`
        ),
      ]);
      await Promise.all([
        chmod(join(directory, "docker"), 0o755),
        chmod(join(directory, "pnpm"), 0o755),
      ]);
      const environment = {
        DEV_PROFILE: "fixture",
        DEV_RUN_ID: `cleanup-${randomBytes(8).toString("hex")}`,
        PATH: directory,
        PORT: String(appPort),
        MARKETING_PORT: String(marketingPort),
      };
      const initial = await runCopiedSupervisor(
        repositoryRoot,
        [],
        environment
      );
      expect(initial.code).toBe(1);
      expect(initial.stderr).toContain("cleanup");

      const recordPath = await onlyRunRecord(repositoryRoot);
      const record = copiedRunRecordSchema.parse(
        JSON.parse(await readFile(recordPath, "utf8"))
      );
      const leasePath = join(
        repositoryRoot,
        ".eve",
        "dev-runs",
        "worktree-operation.json"
      );
      await stat(leasePath);
      await writeFile(allowDownPath, "allow\n");
      const recovered = await runCopiedSupervisor(repositoryRoot, ["--stop"], {
        PATH: directory,
      });

      if (recovered.code !== 0) {
        throw new Error(
          `Canonical recovery failed: ${JSON.stringify({ stdout: recovered.stdout, stderr: recovered.stderr })}`
        );
      }
      expect(recovered.stdout).toContain(
        `Recovered owned fixture resources for stale run ${record.runId}.`
      );
      expect(await readFile(logPath, "utf8")).toContain(
        `docker compose --project-name ${record.composeProject} down --volumes\n`
      );
      await expect(stat(recordPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(leasePath)).rejects.toMatchObject({ code: "ENOENT" });

      await rm(blockStartupPath);
      await writeFile(failMigratePath, "fail\n");
      const restarted = await runCopiedSupervisor(repositoryRoot, [], {
        ...environment,
        DEV_RUN_ID: `restarted-${randomBytes(8).toString("hex")}`,
      });
      expect(restarted.code).toBe(1);
      expect(restarted.stderr).toContain("migrations");
      await expect(stat(leasePath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("passes the assigned PostgreSQL port to migrations before a failure and cleans up", async () => {
      const result = await runSuccessfulSupervisor({ DEV_MIGRATE_EXIT: "7" });

      expect(result.code).toBe(1);
      const lines = result.commands.trim().split("\n");
      const project = projectFromComposeCommand(lines[0]);
      expect(lines).toEqual([
        `compose --project-name ${project} up --detach --wait postgres`,
        `compose --project-name ${project} port postgres 5432`,
        "pnpm db:migrate postgresql://postgres:postgres@127.0.0.1:49152/open_instinct",
        `compose --project-name ${project} down`,
      ]);
    });

    it("escalates a terminating service wrapper into its detached stubborn child group", async () => {
      const directory = await mkdtemp(join(tmpdir(), "open-instinct-wrapper-"));
      temporaryDirectories.push(directory);
      const repositoryRoot = await createLifecycleRepository(directory);
      const childPath = join(directory, "stubborn-child.mjs");
      const pidPath = join(directory, "child.pid");
      await writeFile(
        childPath,
        `import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => undefined);
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => undefined, 1_000);
`
      );
      const wrapper = spawn(
        process.execPath,
        [
          join(repositoryRoot, "scripts", "local", "service-supervisor.mjs"),
          "--repository-root",
          repositoryRoot,
          "--parent-pid",
          String(process.pid),
          "--run-nonce",
          "a".repeat(48),
          "--",
          process.execPath,
          childPath,
          pidPath,
        ],
        { cwd: repositoryRoot, detached: true, stdio: "ignore" }
      );
      const wrapperExit = waitForSupervisorClose(wrapper);
      let childPid: number | undefined;
      try {
        await waitForFile(pidPath);
        childPid = Number(await readFile(pidPath, "utf8"));
        expect(Number.isSafeInteger(childPid)).toBe(true);
        wrapper.kill("SIGTERM");
        expect(await wrapperExit).toBe(1);
        await waitForExit(childPid);
      } finally {
        if (childPid !== undefined) {
          killOwnedGroup(childPid);
          await waitForExit(childPid);
        }
      }
    }, 10_000);

    it("recovers only the exact stale fixture project and removes its record", async () => {
      const directory = await mkdtemp(join(tmpdir(), "open-instinct-stale-"));
      temporaryDirectories.push(directory);
      const logPath = join(directory, "commands.log");
      const appPort = await unusedPort();
      const marketingPort = await unusedPort();
      const agentationPort = await unusedPort();
      const repositoryRoot = await createLifecycleRepository(
        directory,
        agentationPort
      );
      const agentation = await startFixtureAgentation(agentationPort);
      const serverPath = join(directory, "ready-server.mjs");
      let startupProcess: ChildProcess | undefined;
      try {
        await Promise.all([
          writeFile(
            join(directory, "docker"),
            `#!/bin/sh
printf 'docker %s\\n' "$*" >> "${logPath}"
if [ "$4" = "port" ]; then printf '127.0.0.1:49152\\n'; fi
`
          ),
          writeFile(
            join(directory, "pnpm"),
            `#!/bin/sh
printf 'pnpm %s\\n' "$*" >> "${logPath}"
if [ "$1" = "db:migrate" ]; then
  if [ -n "$DEV_MIGRATE_EXIT" ]; then exit "$DEV_MIGRATE_EXIT"; fi
  exit 0
fi
if [ "$1" = "dev:app" ]; then exec "${process.execPath}" "${serverPath}" "$3"; fi
if [ "$1" = "--dir" ]; then exec "${process.execPath}" "${serverPath}" "$5"; fi
`
          ),
          writeFile(
            serverPath,
            `import { createServer } from "node:http";
createServer((_request, response) => { response.writeHead(200); response.end("ready"); }).listen(Number(process.argv[2]), "127.0.0.1");
`
          ),
        ]);
        await Promise.all([
          chmod(join(directory, "docker"), 0o755),
          chmod(join(directory, "pnpm"), 0o755),
        ]);
        const start = spawn(
          process.execPath,
          [join(repositoryRoot, "scripts", "dev.ts")],
          {
            cwd: repositoryRoot,
            env: syntheticEnvironment({
              DEV_PROFILE: "fixture",
              DEV_RUN_ID: `stale-${randomBytes(8).toString("hex")}`,
              PATH: directory,
              PORT: String(appPort),
              MARKETING_PORT: String(marketingPort),
              DEV_TEST_LOG: logPath,
              DEV_TEST_NODE: process.execPath,
              DEV_TEST_SERVER: serverPath,
            }),
            stdio: ["ignore", "pipe", "pipe"] as const,
          }
        );
        startupProcess = start;
        const startExit = waitForSupervisorClose(start);
        try {
          await waitForSupervisorOutput(start, '"lifecycle":"ready"');
        } catch (error) {
          throw new Error(
            error instanceof Error ? error.message : String(error),
            { cause: error }
          );
        }
        const recordPath = await onlyRunRecord(repositoryRoot);
        const leasePath = join(
          repositoryRoot,
          ".eve",
          "dev-runs",
          "worktree-operation.json"
        );
        const record = copiedRunRecordSchema.parse(
          JSON.parse(await readFile(recordPath, "utf8"))
        );
        process.kill(record.owner.pid, "SIGKILL");
        await startExit;
        const recordedChildren: readonly (DevRunProcess | undefined)[] = [
          record.children.agentation,
          record.children.app,
          record.children.marketing,
        ];
        await Promise.all(
          recordedChildren
            .filter(isDefined)
            .map((child) => waitForExit(child.pid))
        );
        const stubbornPath = join(directory, "stubborn-stale-child.mjs");
        const stubbornPidPath = join(directory, "stubborn-stale-child.pid");
        await writeFile(
          stubbornPath,
          `import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => undefined);
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => undefined, 1_000);
`
        );
        const stubbornWrapper = spawn(
          process.execPath,
          [
            join(repositoryRoot, "scripts", "local", "service-supervisor.mjs"),
            "--repository-root",
            repositoryRoot,
            "--parent-pid",
            String(process.pid),
            "--run-nonce",
            record.nonce,
            "--",
            process.execPath,
            stubbornPath,
            stubbornPidPath,
          ],
          { cwd: repositoryRoot, detached: true, stdio: "ignore" }
        );
        await waitForFile(stubbornPidPath);
        const stubbornWrapperStart = await processStartTime(
          stubbornWrapper.pid ?? 0
        );
        const stubbornPid = Number(await readFile(stubbornPidPath, "utf8"));
        if (
          stubbornWrapper.pid === undefined ||
          stubbornWrapperStart === undefined
        ) {
          throw new Error("Could not identify the copied stubborn wrapper.");
        }
        try {
          record.children.app = {
            pid: stubbornWrapper.pid,
            processStartTime: stubbornWrapperStart,
            processGroup: stubbornWrapper.pid,
          };
          await writeFile(recordPath, `${JSON.stringify(record)}\n`);
          expect(
            await isVerifiedRunChild(
              record,
              record.children.app,
              repositoryRoot
            )
          ).toBe(true);
          const directChildren = await execFileAsync("/usr/bin/pgrep", [
            "-P",
            String(stubbornWrapper.pid),
          ]);
          expect(directChildren.stdout.split(/\s+/u)).toContain(
            String(stubbornPid)
          );
          const stopStarted = Date.now();
          const result = await runCopiedSupervisor(repositoryRoot, ["--stop"], {
            PATH: directory,
            DEV_TEST_LOG: logPath,
          });

          if (result.code !== 0) {
            throw new Error(`Copied stale stop failed: ${result.stderr}`);
          }
          expect(result.code).toBe(0);
          const stubbornStartAfterStop = await processStartTime(stubbornPid);
          if (stubbornStartAfterStop !== undefined) {
            throw new Error(
              `Stale stop reported recovery before owned child exited: ${JSON.stringify({ stdout: result.stdout, stderr: result.stderr })}`
            );
          }
          if (Date.now() - stopStarted < 4_500) {
            throw new Error(
              `Stale stop returned before wrapper escalation grace: ${JSON.stringify({ stdout: result.stdout, stderr: result.stderr })}`
            );
          }
          await waitForExit(stubbornPid, 7_000);
          expect(result.stdout).toContain(
            `Recovered owned fixture resources for stale run ${record.runId}.`
          );
          expect(await readFile(logPath, "utf8")).toContain(
            `docker compose --project-name ${record.composeProject} down --volumes\n`
          );
          await expect(stat(recordPath)).rejects.toMatchObject({
            code: "ENOENT",
          });
          await expect(stat(leasePath)).rejects.toMatchObject({
            code: "ENOENT",
          });
          const restarted = await runCopiedSupervisor(repositoryRoot, [], {
            DEV_PROFILE: "fixture",
            DEV_RUN_ID: `restarted-${randomBytes(8).toString("hex")}`,
            PATH: directory,
            PORT: String(appPort),
            MARKETING_PORT: String(marketingPort),
            DEV_MIGRATE_EXIT: "7",
          });
          expect(restarted.code).toBe(1);
          expect(restarted.stderr).toContain("migrate");
          await expect(stat(leasePath)).rejects.toMatchObject({
            code: "ENOENT",
          });
        } finally {
          killOwnedGroup(stubbornWrapper.pid);
          killOwnedGroup(stubbornPid);
          await waitForExit(stubbornWrapper.pid);
        }
      } finally {
        if (startupProcess?.pid !== undefined) {
          killOwnedGroup(startupProcess.pid);
          await waitForExit(startupProcess.pid);
        }
        await closeServer(agentation);
      }
    });

    it("fails promptly and cleans up when a foreign HTTP 200 outlives the owned app child", async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "open-instinct-foreign-http-")
      );
      temporaryDirectories.push(directory);
      const logPath = join(directory, "commands.log");
      const appPort = await unusedPort();
      const marketingPort = await unusedPort();
      const agentationPort = await unusedPort();
      const repositoryRoot = await createLifecycleRepository(
        directory,
        agentationPort
      );
      await Promise.all([
        writeFile(
          join(directory, "docker"),
          `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$DEV_SUPERVISOR_LOG"
if [ "$4" = "port" ]; then printf '127.0.0.1:49152\\n'; fi
`
        ),
        writeFile(
          join(directory, "pnpm"),
          `#!/bin/sh
printf 'pnpm %s\\n' "$*" >> "$DEV_SUPERVISOR_LOG"
if [ "$1" = "db:migrate" ]; then exit 0; fi
if [ "$1" = "dev:app" ]; then
  printf 'app launched\\n' >> "$DEV_SUPERVISOR_LOG"
  /bin/sleep 1
  exit 0
fi
if [ "$1" = "--dir" ]; then while :; do /bin/sleep 1; done; fi
`
        ),
      ]);
      await Promise.all([
        chmod(join(directory, "docker"), 0o755),
        chmod(join(directory, "pnpm"), 0o755),
      ]);
      const agentation = await startFixtureAgentation(agentationPort);
      try {
        const supervisor = runCopiedSupervisor(repositoryRoot, [], {
          DEV_PROFILE: "connected",
          DEV_RUN_ID: `foreign-${randomBytes(8).toString("hex")}`,
          DEV_SUPERVISOR_LOG: logPath,
          KERNEL_API_KEY: "test-kernel-key",
          PATH: directory,
          PORT: String(appPort),
          MARKETING_PORT: String(marketingPort),
        });
        try {
          await waitForSupervisorLogEntry(logPath, "app launched");
        } catch (error) {
          const result = await supervisor;
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} stdout: ${result.stdout} stderr: ${result.stderr}`,
            { cause: error }
          );
        }
        let requests = 0;
        const foreign = createHttpServer((request, response) => {
          requests += 1;
          response.writeHead(200);
          response.end(
            request.url === "/eve/v1/health" ? "healthy" : "foreign"
          );
        });
        await listen(foreign, appPort, "127.0.0.1");
        const started = Date.now();
        try {
          const result = await supervisor;
          expect(result.code).toBe(1);
          expect(Date.now() - started).toBeLessThan(5_000);
          expect(requests).toBeGreaterThanOrEqual(2);
          expect(await readFile(logPath, "utf8")).toContain(" down");
        } finally {
          await closeServer(foreign);
        }
      } finally {
        await closeServer(agentation);
      }
    }, 15_000);

    it("rejects an explicit port occupied through IPv6 before Docker starts", async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "open-instinct-ipv6-port-")
      );
      temporaryDirectories.push(directory);
      const repositoryRoot = await createLifecycleRepository(directory);
      const logPath = join(directory, "commands.log");
      const blocker = createServer();
      await listen(blocker, 0, "::");
      const address = blocker.address();
      const parsedAddress = z.object({ port: z.number() }).safeParse(address);
      if (!parsedAddress.success) {
        throw new Error("Could not reserve an IPv6 test port.");
      }
      await writeFile(
        join(directory, "docker"),
        `#!/bin/sh\nprintf 'docker %s\\n' "$*" >> "$DEV_SUPERVISOR_LOG"\n`
      );
      await chmod(join(directory, "docker"), 0o755);
      try {
        const result = await runCopiedSupervisor(repositoryRoot, [], {
          KERNEL_API_KEY: "test-kernel-key",
          PATH: directory,
          DEV_SUPERVISOR_LOG: logPath,
          PORT: String(parsedAddress.data.port),
          MARKETING_PORT: String(await unusedPort()),
        });

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(
          `preflight: Application port ${String(parsedAddress.data.port)} is already in use.`
        );
        await expect(readFile(logPath, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        await closeServer(blocker);
      }
    });
  }
);

function expectIsolatedLifecycle(commands: string) {
  const lines = commands.trim().split("\n");
  const project = projectFromComposeCommand(lines[0]);
  expect(lines).toEqual([
    `compose --project-name ${project} up --detach --wait postgres`,
    `compose --project-name ${project} down`,
  ]);
}

function projectFromComposeCommand(command: string | undefined) {
  const project = command?.match(
    /^compose --project-name (open-instinct-[a-f0-9]{12}) /
  )?.[1];
  if (!project) {
    throw new Error(`Missing Compose project in: ${String(command)}`);
  }
  return project;
}

async function interruptDuringStartup(
  environment: Record<string, string> = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "open-instinct-dev-"));
  temporaryDirectories.push(directory);
  const repositoryRoot = await createLifecycleRepository(directory);
  const logPath = join(directory, "commands.log");
  const dockerPath = join(directory, "docker");
  const pnpmPath = join(directory, "pnpm");
  await Promise.all([
    writeFile(
      dockerPath,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$DEV_SUPERVISOR_LOG"
if [ "$4" = "\${DEV_BLOCK_ACTION:-up}" ]; then
  trap 'exit "\${DEV_STARTUP_EXIT:-130}"' INT TERM HUP
  while true; do /bin/sleep 0.1; done
fi
if [ "$4" = "port" ]; then
  printf '127.0.0.1:49152\n'
fi
if [ "$4" = "down" ]; then
  exit "\${DEV_DOWN_EXIT:-0}"
fi
`
    ),
    writeFile(
      pnpmPath,
      `#!/bin/sh
printf 'pnpm %s\\n' "$*" >> "$DEV_SUPERVISOR_LOG"
`
    ),
  ]);
  await Promise.all([chmod(dockerPath, 0o755), chmod(pnpmPath, 0o755)]);

  const supervisor = spawn(
    process.execPath,
    [join(repositoryRoot, "scripts", "dev.ts")],
    {
      cwd: repositoryRoot,
      env: {
        DEV_SUPERVISOR_LOG: logPath,
        KERNEL_API_KEY: "test-kernel-key",
        NODE_ENV: "test",
        PATH: directory,
        ...environment,
      },
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  let stderr = "";
  supervisor.stderr.setEncoding("utf8");
  supervisor.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = waitForSupervisorClose(supervisor);
  try {
    await waitForSupervisorLogEntry(
      logPath,
      environment.DEV_BLOCK_ACTION === "port"
        ? " port postgres 5432"
        : " up --detach --wait"
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} stderr: ${stderr}`,
      { cause: error }
    );
  }
  supervisor.kill("SIGINT");

  return {
    code: await exitCode,
    commands: await readFile(logPath, "utf8"),
    repositoryRoot,
  };
}

async function runSuccessfulSupervisor(
  environment: Record<string, string> = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "open-instinct-dev-"));
  temporaryDirectories.push(directory);
  const repositoryRoot = await createLifecycleRepository(directory);
  const logPath = join(directory, "commands.log");
  const dockerPath = join(directory, "docker");
  const pnpmPath = join(directory, "pnpm");
  await Promise.all([
    writeFile(
      dockerPath,
      `#!/bin/sh
printf '%s\n' "$*" >> "$DEV_SUPERVISOR_LOG"
if [ "$4" = "port" ]; then
  printf '127.0.0.1:49152\n'
fi
`
    ),
    writeFile(
      pnpmPath,
      `#!/bin/sh
printf 'pnpm %s %s\n' "$*" "$DATABASE_URL" >> "$DEV_SUPERVISOR_LOG"
if [ "$1" = "db:migrate" ]; then exit "\${DEV_MIGRATE_EXIT:-0}"; fi
`
    ),
  ]);
  await Promise.all([chmod(dockerPath, 0o755), chmod(pnpmPath, 0o755)]);

  const supervisor = spawn(
    process.execPath,
    [join(repositoryRoot, "scripts", "dev.ts")],
    {
      cwd: repositoryRoot,
      env: {
        DEV_SUPERVISOR_LOG: logPath,
        KERNEL_API_KEY: "test-kernel-key",
        NODE_ENV: "test",
        PATH: directory,
        ...environment,
      },
      stdio: "ignore",
    }
  );
  const exitCode = waitForSupervisorClose(supervisor);

  return {
    code: await exitCode,
    commands: await readFile(logPath, "utf8"),
  };
}

async function runWithoutKernelApiKey() {
  const directory = await mkdtemp(join(tmpdir(), "open-instinct-dev-"));
  temporaryDirectories.push(directory);
  const repositoryRoot = await createLifecycleRepository(directory);
  const logPath = join(directory, "commands.log");
  const dockerPath = join(directory, "docker");
  await writeFile(
    dockerPath,
    `#!/bin/sh
printf '%s\n' "$*" >> "$DEV_SUPERVISOR_LOG"
`
  );
  await chmod(dockerPath, 0o755);

  const supervisor = spawn(
    process.execPath,
    [join(repositoryRoot, "scripts", "dev.ts")],
    {
      cwd: repositoryRoot,
      env: {
        DEV_SUPERVISOR_LOG: logPath,
        NODE_ENV: "test",
        PATH: directory,
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

  return {
    code: await exitCode,
    commands: await readFile(logPath, "utf8").catch(() => ""),
    stderr,
  };
}

async function createLifecycleRepository(
  directory: string,
  agentationPort?: number
) {
  const repositoryRoot = join(directory, "repository");
  const localDirectory = join(repositoryRoot, "scripts", "local");
  await mkdir(localDirectory, { recursive: true });
  await Promise.all(
    [
      "scripts/dev.ts",
      "scripts/local/run-record.ts",
      "scripts/local/worktree-lease.ts",
      "scripts/local/service-supervisor.mjs",
      "scripts/local/fixture-network-guard.mjs",
    ].map(async (path) =>
      copyFile(join(sourceRoot, path), join(repositoryRoot, path))
    )
  );
  if (agentationPort !== undefined) {
    const developmentScriptPath = join(repositoryRoot, "scripts", "dev.ts");
    const developmentScript = await readFile(developmentScriptPath, "utf8");
    const configuredScript = developmentScript.replace(
      'const agentationOrigin = "http://127.0.0.1:4747";',
      `const agentationOrigin = "http://127.0.0.1:${String(agentationPort)}";`
    );
    if (configuredScript === developmentScript) {
      throw new Error(
        "Copied supervisor does not declare the Agentation origin."
      );
    }
    await writeFile(developmentScriptPath, configuredScript);
  }
  await Promise.all([
    mkdir(join(repositoryRoot, ".git", "refs", "heads"), { recursive: true }),
    mkdir(join(repositoryRoot, ".git", "objects"), { recursive: true }),
    symlink(
      join(sourceRoot, "node_modules"),
      join(repositoryRoot, "node_modules"),
      "dir"
    ),
  ]);
  await Promise.all([
    writeFile(join(repositoryRoot, ".git", "HEAD"), "ref: refs/heads/main\n"),
    writeFile(
      join(repositoryRoot, ".git", "config"),
      "[core]\nrepositoryformatversion = 0\nbare = false\n"
    ),
    writeFile(
      join(repositoryRoot, ".git", "refs", "heads", "main"),
      "7875a08348adf2d567120e7e7f3d803b101aa45a\n"
    ),
  ]);
  return repositoryRoot;
}

async function startFixtureAgentation(port: number) {
  const server = createHttpServer((request, response) => {
    if (request.url !== "/pending") {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end("[]");
  });
  await listen(server, port, "127.0.0.1");
  return server;
}

async function runCopiedSupervisor(
  repositoryRoot: string,
  arguments_: string[],
  environment: Record<string, string>
) {
  const child = spawn(
    process.execPath,
    [join(repositoryRoot, "scripts", "dev.ts"), ...arguments_],
    {
      cwd: repositoryRoot,
      env: syntheticEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return {
    code: await waitForSupervisorClose(child),
    stdout,
    stderr,
  };
}

async function unusedPort() {
  const server = createServer();
  await listen(server, 0, "127.0.0.1");
  const address = server.address();
  await closeServer(server);
  const parsedAddress = z.object({ port: z.number() }).safeParse(address);
  if (!parsedAddress.success) {
    throw new Error("Could not select a test port.");
  }
  return parsedAddress.data.port;
}

function listen(
  server: ReturnType<typeof createServer>,
  port: number,
  host: string
) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen({ host, port }, () => {
      resolvePromise();
    });
  });
}

async function closeServer(server: ReturnType<typeof createServer>) {
  if (!server.listening) return;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error === undefined) resolvePromise();
      else rejectPromise(error);
    });
  });
}

function waitForSupervisorOutput(supervisor: ChildProcess, expected: string) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const stdout = supervisor.stdout;
    if (stdout === null) {
      rejectPromise(new Error("Copied supervisor did not expose stdout."));
      return;
    }
    let output = "";
    const timeout = setTimeout(() => {
      rejectPromise(
        new Error(`Timed out waiting for ${expected}. Last output: ${output}`)
      );
    }, 5_000);
    stdout.setEncoding("utf8");
    stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolvePromise();
      }
    });
    supervisor.once("exit", () => {
      clearTimeout(timeout);
      if (!output.includes(expected)) {
        rejectPromise(
          new Error(`Supervisor exited before ${expected}: ${output}`)
        );
      }
    });
  });
}

/* oxlint-disable eslint/no-await-in-loop -- Each bounded poll must finish before the next lifecycle observation. */
async function onlyRunRecord(repositoryRoot: string) {
  const directory = join(repositoryRoot, ".eve", "dev-runs");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const entries = await (
      await import("node:fs/promises")
    )
      .readdir(directory)
      .catch(() => []);
    const records = entries.filter(
      (entry) => entry.startsWith("run-") && entry.endsWith(".json")
    );
    const [record] = records;
    if (records.length === 1 && record !== undefined)
      return join(directory, record);
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 20));
  }
  throw new Error(
    "The copied supervisor did not create exactly one run record."
  );
}

async function waitForExit(pid: number, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 20));
  }
  throw new Error(`Copied service PID ${String(pid)} did not exit.`);
}
/* oxlint-enable eslint/no-await-in-loop */

function killOwnedGroup(pid: number) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ESRCH")
    ) {
      throw error;
    }
  }
}

async function waitForFile(path: string) {
  const deadline = Date.now() + 5_000;
  /* oxlint-disable eslint/no-await-in-loop -- Each bounded poll must observe the child artifact before retrying. */
  while (Date.now() < deadline) {
    if (
      await stat(path)
        .then(() => true)
        .catch(() => false)
    )
      return;
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 20));
  }
  /* oxlint-enable eslint/no-await-in-loop */
  throw new Error(`Timed out waiting for copied child artifact ${path}.`);
}
