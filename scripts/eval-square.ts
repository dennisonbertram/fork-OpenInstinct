import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { startFakeSquare } from "../evals/square/fake/server.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

// oxlint-disable-next-line eslint/no-restricted-properties -- forwards the caller's environment to the eve eval child process
const inheritedEnvironment = { ...process.env };

// Local placeholders so `eve eval square` can boot the app outside a
// developer's machine (CI, a fresh checkout) without hand-set secrets.
// Never overrides a value the caller already set.
const localDefaults = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "eval-square-local-better-auth-secret-placeholder",
  SECRET_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  KERNEL_API_KEY: "eval-kernel-key",
};

const environment = { ...inheritedEnvironment };
const appliedDefaults: string[] = [];
for (const [key, value] of Object.entries(localDefaults)) {
  if (!environment[key]) {
    environment[key] = value;
    appliedDefaults.push(key);
  }
}
if (appliedDefaults.length > 0) {
  console.error(
    `eval-square: applied local defaults for ${appliedDefaults.join(", ")}`
  );
}

const rawArguments = process.argv.slice(2);
const withDatabase =
  rawArguments.includes("--with-database") ||
  environment.EVAL_SQUARE_DATABASE === "compose";
const forwardedArguments = rawArguments.filter(
  (arg) => arg !== "--with-database"
);

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

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env,
    stdio: "inherit",
  });
  activeChild = child;
  try {
    const code = await childExitCode(child);
    if (code !== 0 && shutdownSignal === undefined) {
      throw new Error(
        `${command} ${args.join(" ")} exited with ${String(code)}`
      );
    }
  } finally {
    if (activeChild === child) activeChild = undefined;
  }
}

async function runForOutput(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env: inheritedEnvironment,
    stdio: ["inherit", "pipe", "inherit"],
  });
  activeChild = child;
  child.stdout.setEncoding("utf8");
  let output = "";
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  try {
    const code = await childExitCode(child);
    if (code !== 0 && shutdownSignal === undefined) {
      throw new Error(
        `${command} ${args.join(" ")} exited with ${String(code)}`
      );
    }
    return output;
  } finally {
    if (activeChild === child) activeChild = undefined;
  }
}

// ponytail: duplicates scripts/dev.ts's Compose-up/migrate sequence rather
// than extracting a shared helper — dev.ts's version is entangled with its
// own long-running "dev server" signal-forwarding loop, so sharing it would
// cost more than the ~20 duplicated lines below.
const composeProject = `open-instinct-${createHash("sha256")
  .update(repositoryRoot)
  .digest("hex")
  .slice(0, 12)}`;
const composeArguments = (...args: string[]) => [
  "compose",
  "--project-name",
  composeProject,
  ...args,
];

async function withComposeDatabase<T>(body: () => Promise<T>): Promise<T> {
  await run(
    "docker",
    composeArguments("up", "--detach", "--wait"),
    inheritedEnvironment
  );
  try {
    const portOutput = await runForOutput(
      "docker",
      composeArguments("port", "postgres", "5432")
    );
    const port = /:(\d+)$/.exec(portOutput.trim())?.[1];
    if (!port) throw new Error("Could not resolve the local PostgreSQL port.");
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/open_instinct`;
    environment.DATABASE_URL = databaseUrl;
    environment.DATABASE_URL_UNPOOLED = databaseUrl;
    await run("pnpm", ["db:migrate"], environment);
    return await body();
  } finally {
    await run("docker", composeArguments("down"), inheritedEnvironment);
  }
}

async function runEval() {
  const fake = await startFakeSquare({ port: 0 });
  console.error(`fake Square at ${fake.url}`);

  try {
    const child = spawn(
      "pnpm",
      ["exec", "eve", "eval", "square", ...forwardedArguments],
      {
        cwd: repositoryRoot,
        detached: process.platform !== "win32",
        env: {
          ...environment,
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
}

if (withDatabase) {
  await withComposeDatabase(runEval);
} else {
  await runEval();
}
