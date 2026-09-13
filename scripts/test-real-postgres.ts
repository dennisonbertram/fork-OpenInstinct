import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// CI/test-only supervisor, not an alternative application startup path.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const project = `open-instinct-ci-${randomUUID().replaceAll("-", "")}`;
const compose = (...args: string[]) => [
  "compose",
  "--project-name",
  project,
  ...args,
];
// oxlint-disable-next-line eslint/no-restricted-properties -- The supervisor preserves its existing invocation environment, then applies the owned database settings below.
const inheritedEnvironment: NodeJS.ProcessEnv = { ...process.env };
const environment: NodeJS.ProcessEnv = {
  ...inheritedEnvironment,
  REAL_PG: "1",
  REAL_PG_COMPOSE_PROJECT: project,
};
delete environment.AI_GATEWAY_API_KEY;
delete environment.VERCEL_OIDC_TOKEN;

let activeChild: ChildProcess | undefined;
let interrupted = false;
let cleaningUp = false;
let stopping: ReturnType<typeof setTimeout> | undefined;
let cleanupStatus: "passed" | "failed" | "not-attempted" = "not-attempted";
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = true;
    process.exitCode =
      signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129;
    // Let an already-running teardown finish rather than interrupting removal.
    if (cleaningUp) return;
    const child = activeChild;
    interrupt(child, signal);
    stopping = setTimeout(() => {
      interrupt(child, "SIGKILL");
    }, 2_000);
    stopping.unref();
  });
}

await runRequiredTests();

async function runRequiredTests() {
  let composeAttempted = false;
  try {
    if (process.argv.length !== 2)
      throw new Error(
        "This required lane does not accept test filters or skip options."
      );
    const junitPath = configuredEvidencePath(
      environment.VERIFY_REAL_PG_JUNIT_PATH,
      "real-postgres.xml"
    );
    await mkdir(
      dirname(
        junitPath ??
          fileURLToPath(
            new URL("../.eve/ci/real-postgres.xml", import.meta.url)
          )
      ),
      { recursive: true }
    );
    if (!interrupted) {
      composeAttempted = true;
      const startupCode = await run(
        "docker",
        compose("up", "--detach", "--wait", "postgres")
      );
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- a signal handler can change interrupted while startup is awaited.
      if (!interrupted && startupCode === 0) {
        const testCode = await run("pnpm", [
          "test:integration",
          "tests/integration/real-postgres.test.ts",
          "--reporter=default",
          "--reporter=junit",
          `--outputFile=${junitPath ?? ".eve/ci/real-postgres.xml"}`,
        ]);
        process.exitCode ??= testCode ?? 1;
      } else {
        process.exitCode ??= startupCode ?? 1;
      }
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Real Postgres lane failed."
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(stopping);
    cleaningUp = true;
    if (composeAttempted) {
      try {
        const code = await run("docker", compose("down", "--volumes"));
        if (code !== 0) {
          cleanupStatus = "failed";
          console.error("Owned Compose teardown failed.");
          process.exitCode = 1;
        } else {
          cleanupStatus = "passed";
        }
      } catch (error) {
        cleanupStatus = "failed";
        console.error(
          error instanceof Error
            ? error.message
            : "Owned Compose teardown failed."
        );
        process.exitCode = 1;
      }
    }
    const evidencePath = configuredEvidencePath(
      environment.VERIFY_EVIDENCE_PATH,
      "real-postgres-supervisor.json"
    );
    if (evidencePath !== undefined) {
      try {
        const journalText = await readFile(
          fileURLToPath(
            new URL("../db/migrations/meta/_journal.json", import.meta.url)
          ),
          "utf8"
        );
        const journalInput: unknown = JSON.parse(journalText);
        const journal = z
          .object({ entries: z.array(z.object({ tag: z.string() })) })
          .parse(journalInput);
        const migrationRevision = journal.entries.at(-1)?.tag;
        if (migrationRevision === undefined) {
          console.error("Migration revision is unavailable.");
          process.exitCode = 1;
        } else {
          const evidence = {
            schemaVersion: 1,
            lane: "real-postgres",
            composeProject: project,
            database:
              "temporary test databases owned by the integration harness",
            migration: {
              sourceRevision: migrationRevision,
              evidence:
                "The real-Postgres harness applies the source migrations before the required tests.",
            },
            cleanup: cleanupStatus,
          };
          const handle = await open(evidencePath, "wx", 0o600);
          try {
            await handle.writeFile(
              `${JSON.stringify(evidence, null, 2)}\n`,
              "utf8"
            );
          } finally {
            await handle.close();
          }
        }
      } catch {
        console.error(
          "Could not write the bounded verification evidence file."
        );
        process.exitCode = 1;
      }
    }
  }
}

function configuredEvidencePath(
  value: string | undefined,
  expectedName: string
) {
  if (value === undefined) return undefined;
  const resolved = isAbsolute(value)
    ? resolve(value)
    : resolve(repositoryRoot, value);
  const verifyRoot = resolve(repositoryRoot, ".eve", "verify");
  const relativePath = relative(verifyRoot, resolved);
  const parts = relativePath.split(sep);
  if (
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath) ||
    parts.length !== 2 ||
    !/^[0-9a-f-]{36}$/u.test(parts[0] ?? "") ||
    basename(resolved) !== expectedName
  ) {
    throw new Error(
      "Verification evidence paths must stay inside their run directory."
    );
  }
  return resolved;
}

function run(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: environment,
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
  activeChild = child;
  const timeout = setTimeout(
    () => {
      interrupt(child, "SIGKILL");
    },
    cleaningUp ? 30_000 : 600_000
  );
  timeout.unref();
  return new Promise<number | null>((settle, reject) => {
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (activeChild === child) activeChild = undefined;
      clearTimeout(stopping);
      settle(code);
    });
  });
}

function interrupt(child: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
      throw error;
  }
}
