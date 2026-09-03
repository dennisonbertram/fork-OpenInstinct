import { spawn, type ChildProcess } from "node:child_process";
import { startFakeSquare } from "../evals/square/fake/server.ts";

// oxlint-disable-next-line eslint/no-restricted-properties -- forwards the caller's environment to the eve eval child process
const inheritedEnvironment = { ...process.env };

let activeChild: ChildProcess | undefined;
let shutdownSignal: NodeJS.Signals | undefined;

function interrupt(child: ChildProcess, signal: NodeJS.Signals) {
  const childPid = child.pid;
  try {
    if (process.platform === "win32") {
      child.kill(signal);
      return;
    }
    if (childPid === undefined) {
      throw new Error(
        "Cannot forward a signal before the child process starts."
      );
    }
    process.kill(-childPid, signal);
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ESRCH")
    ) {
      console.error(
        `Failed to forward ${signal} to ${String(childPid)}:`,
        error
      );
      process.exitCode = 1;
    }
  }
}

const shutdownSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const signal of shutdownSignals) {
  process.on(signal, () => {
    if (shutdownSignal === undefined) {
      shutdownSignal = signal;
      if (activeChild !== undefined) {
        interrupt(activeChild, signal);
      }
    }
  });
}

function childExitCode(child: ChildProcess) {
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
}

const fake = await startFakeSquare({ port: 0 });
console.error(`fake Square at ${fake.url}`);

try {
  const child = spawn(
    "pnpm",
    ["exec", "eve", "eval", "square", ...process.argv.slice(2)],
    {
      cwd: new URL("..", import.meta.url).pathname,
      detached: process.platform !== "win32",
      env: {
        ...inheritedEnvironment,
        SQUARE_BASE_URL: fake.url,
        SQUARE_SANDBOX_ACCESS_TOKEN: "eval-token",
        SQUARE_ENVIRONMENT: "sandbox",
      },
      stdio: "inherit",
    }
  );
  activeChild = child;

  const code = await childExitCode(child);
  activeChild = undefined;
  process.exitCode = code ?? 1;
} finally {
  await fake.close();
}
