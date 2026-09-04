import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { startFakeSquare } from "../evals/square/fake/server.ts";
import {
  beginManifestAttempt,
  completeManifestAttempt,
  createEvalRunManifest,
  manifestCostStatus,
  readFixtureClock,
} from "../evals/run-manifest.ts";
import {
  parsePositiveUsd,
  parseRepetitions,
  parseTimeoutMs,
  reserveEstimatedCost,
} from "../evals/paid-run-policy.ts";
import { evalRunDefaults } from "../evals/eval-run-defaults.ts";
import { rootAgentReasoning } from "../agent/agent-settings.ts";

// oxlint-disable eslint/no-await-in-loop -- paid attempts must serialize reservation, execution, and recorded spend.

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

const options = parseSquareEvalOptions(process.argv.slice(2));
reserveEstimatedCost(options, 0, false);
const withDatabase =
  options.withDatabase || environment.EVAL_SQUARE_DATABASE === "compose";
if (options.model && !withDatabase) {
  throw new Error(
    "--model requires --with-database so the isolated workspace setting can be seeded."
  );
}
const manifestPath = await createEvalRunManifest({
  caseDirectory: "evals/square",
  fixtureClock: await readFixtureClock(
    repositoryRoot,
    "evals/square/fake/fixture.json"
  ),
  effectiveArguments: options.evalArguments,
  estimatedCostUsd: options.estimatedCostUsd,
  judgeModel: evalRunDefaults.judgeModel,
  maxConcurrency: evalRunDefaults.maxConcurrency,
  maxCostUsd: options.maxCostUsd,
  mode: "square",
  reasoning: rootAgentReasoning,
  repetitions: options.repetitions,
  repositoryRoot,
  requestedModel: options.model,
  timeoutMs: options.timeoutMs,
});
console.error(`eval-run manifest: ${manifestPath}`);

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
    shutdownSignal ??= signal;
    if (activeChild !== undefined) {
      interrupt(activeChild, signal);
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
  try {
    await run(
      "docker",
      composeArguments("up", "--detach", "--wait"),
      inheritedEnvironment
    );
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
    await run(
      "pnpm",
      [
        "exec",
        "tsx",
        "evals/square/setup-access.ts",
        ...(options.model ? ["--model", options.model] : []),
      ],
      environment
    );
    return await body();
  } finally {
    await run("docker", composeArguments("down"), inheritedEnvironment);
  }
}

async function runEval() {
  const fake = await startFakeSquare({ port: 0 });
  console.error(`fake Square at ${fake.url}`);

  try {
    let failed = false;
    for (
      let repetition = 0;
      repetition < options.repetitions;
      repetition += 1
    ) {
      const attemptId = await beginManifestAttempt(manifestPath);
      const child = spawn(
        "pnpm",
        [
          "exec",
          "eve",
          "eval",
          "square",
          "--max-concurrency",
          String(evalRunDefaults.maxConcurrency),
          "--timeout",
          String(options.timeoutMs),
          ...options.evalArguments,
        ],
        {
          cwd: repositoryRoot,
          detached: process.platform !== "win32",
          env: {
            ...environment,
            EVAL_RUN_MANIFEST_ATTEMPT_ID: attemptId,
            EVAL_RUN_MANIFEST_PATH: manifestPath,
            SQUARE_BASE_URL: fake.url,
            SQUARE_SANDBOX_ACCESS_TOKEN: "eval-token",
            SQUARE_ENVIRONMENT: "sandbox",
          },
          stdio: "inherit",
        }
      );
      activeChild = child;
      const code = await childExitCode(child);
      if (activeChild === child) activeChild = undefined;
      await completeManifestAttempt(manifestPath, attemptId, code);
      failed ||= code !== 0;
      if (shutdownSignal) return;
      if (repetition + 1 >= options.repetitions) continue;

      const cost = await manifestCostStatus(manifestPath);
      reserveEstimatedCost(options, cost.knownCostUsd, cost.unknown);
    }
    process.exitCode = failed ? 1 : 0;
  } finally {
    await fake.close();
  }
}

function parseSquareEvalOptions(args: string[]) {
  let estimatedCostUsd: number | undefined;
  let maxCostUsd: number | undefined;
  let model: string | null = null;
  let repetitions = 1;
  let includeDatabase = false;
  const evalArguments: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--with-database") {
      includeDatabase = true;
      continue;
    }
    if (
      argument === "--max-cost-usd" ||
      argument === "--estimated-cost-usd" ||
      argument === "--model" ||
      argument === "--repetitions"
    ) {
      const value = args[++index];
      if (!value || value.startsWith("-"))
        throw new Error(`${argument} requires a value.`);
      if (argument === "--max-cost-usd")
        maxCostUsd = parsePositiveUsd(argument, value);
      if (argument === "--estimated-cost-usd")
        estimatedCostUsd = parsePositiveUsd(argument, value);
      if (argument === "--model") model = parseModelId(value);
      if (argument === "--repetitions") repetitions = parseRepetitions(value);
      continue;
    }
    evalArguments.push(argument ?? "");
  }
  if (maxCostUsd === undefined) {
    throw new Error(
      "Paid Square evals require --max-cost-usd <USD> before they start."
    );
  }
  if (estimatedCostUsd === undefined) {
    throw new Error(
      "Paid Square evals require --estimated-cost-usd <USD> before they start."
    );
  }
  const validatedArguments = validateSquareEvalArguments(evalArguments);
  const timeout = readTimeout(validatedArguments);
  return {
    evalArguments: withoutTimeout(validatedArguments),
    estimatedCostUsd,
    maxCostUsd,
    model,
    repetitions,
    timeoutMs:
      timeout === undefined
        ? evalRunDefaults.timeoutMs
        : parseTimeoutMs(String(timeout)),
    withDatabase: includeDatabase,
  };
}

function parseModelId(value: string) {
  const model = value.trim();
  if (!model || model.length > 300) {
    throw new Error(
      "--model must be a non-empty model ID of at most 300 characters."
    );
  }
  return model;
}

function readTimeout(args: readonly string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument?.startsWith("--timeout=")) return Number(argument.slice(10));
    if (argument === "--timeout") return Number(args[index + 1]);
  }
  return undefined;
}

function withoutTimeout(args: readonly string[]) {
  return args.filter(
    (argument, index) =>
      !argument.startsWith("--timeout=") &&
      argument !== "--timeout" &&
      args[index - 1] !== "--timeout"
  );
}

function validateSquareEvalArguments(args: readonly string[]) {
  const booleanOptions = new Set([
    "--json",
    "--list",
    "--skip-report",
    "--strict",
    "--verbose",
  ]);
  const valueOptions = new Set([
    "--exclude-tag",
    "--junit",
    "--tag",
    "--timeout",
  ]);
  const validated: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (booleanOptions.has(argument)) {
      validated.push(argument);
      continue;
    }
    const equalsIndex = argument.indexOf("=");
    const option =
      equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    if (!valueOptions.has(option)) {
      throw new Error(
        `Unsupported Square eval argument "${argument}". The harness owns the eval path, target, and concurrency.`
      );
    }
    if (equalsIndex !== -1) {
      if (argument.slice(equalsIndex + 1).length === 0)
        throw new Error(`${option} requires a value.`);
      validated.push(argument);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("-"))
      throw new Error(`${option} requires a value.`);
    validated.push(argument, value);
    index += 1;
  }
  return validated;
}

if (withDatabase) {
  await withComposeDatabase(runEval);
} else {
  await runEval();
}
