import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// CI/test-only supervisor, not an alternative application startup path.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const project = `open-instinct-ci-${randomUUID().replaceAll("-", "")}`;
const compose = (...args: string[]) => [
  "compose",
  "--project-name",
  project,
  ...args,
];
const environment: NodeJS.ProcessEnv = {
  // oxlint-disable-next-line eslint/no-restricted-properties -- test supervisor sanitizes inherited model credentials and owns the database overrides.
  ...process.env,
  REAL_PG: "1",
  REAL_PG_COMPOSE_PROJECT: project,
};
delete environment.AI_GATEWAY_API_KEY;
delete environment.VERCEL_OIDC_TOKEN;

let activeChild: ChildProcess | undefined;
let interrupted = false;
let cleaningUp = false;
let stopping: ReturnType<typeof setTimeout> | undefined;
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
    await mkdir(new URL("../.eve/ci/", import.meta.url), { recursive: true });
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
          "--outputFile=.eve/ci/real-postgres.xml",
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
          console.error("Owned Compose teardown failed.");
          process.exitCode = 1;
        }
      } catch (error) {
        console.error(
          error instanceof Error
            ? error.message
            : "Owned Compose teardown failed."
        );
        process.exitCode = 1;
      }
    }
  }
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
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (activeChild === child) activeChild = undefined;
      clearTimeout(stopping);
      resolve(code);
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
