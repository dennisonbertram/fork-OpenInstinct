import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  beginManifestAttempt,
  completeManifestAttempt,
  createEvalRunManifest,
  manifestCostStatus,
} from "../evals/run-manifest.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const composeProject = `open-instinct-evals-${createHash("sha256")
  .update(repositoryRoot)
  .digest("hex")
  .slice(0, 8)}-${randomBytes(4).toString("hex")}`;
const composeArguments = (...args: string[]) => [
  "compose",
  "--project-name",
  composeProject,
  ...args,
];

// oxlint-disable-next-line eslint/no-restricted-properties -- the eval supervisor must forward model credentials and provider configuration to its child processes
const inheritedEnvironment = { ...process.env };
let activeChild: ChildProcess | undefined;
let composeAttempted = false;
let interrupted = false;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => {
    interrupted = true;
    process.exitCode =
      signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129;
    interrupt(activeChild, signal);
  });
}

await runAgentEvals();

async function runAgentEvals() {
  try {
    requireModelCredentials();
    const options = parseAgentEvalOptions(process.argv.slice(2));
    const manifestPath = await createEvalRunManifest({
      caseDirectory: "evals/agent",
      fixtureClock: null,
      judgeModel: "openai/gpt-5.4-mini",
      maxConcurrency: 1,
      maxCostUsd: options.maxCostUsd,
      mode: "agent",
      reasoning: "low",
      repetitions: options.repetitions,
      repositoryRoot,
      requestedModel: options.model,
      timeoutMs: options.timeoutMs,
    });
    console.error(`eval-run manifest: ${manifestPath}`);
    composeAttempted = true;
    const databaseStarted = await requireSuccess(
      "docker",
      composeArguments("up", "--detach", "--wait", "postgres")
    );
    if (!databaseStarted) return;

    const address = await output(
      "docker",
      composeArguments("port", "postgres", "5432")
    );
    const port = /:(\d+)\s*$/u.exec(address)?.[1];
    if (!port) throw new Error("Could not resolve the local PostgreSQL port.");

    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/open_instinct`;
    const environment = {
      ...inheritedEnvironment,
      BETTER_AUTH_URL: "http://127.0.0.1:9",
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
      KERNEL_API_KEY: "unused-by-agent-evals",
      KERNEL_BASE_URL: "http://127.0.0.1:9",
      NODE_ENV: "development" as const,
    };

    const migrated = await requireSuccess("pnpm", ["db:migrate"], environment);
    if (!migrated) return;
    const setupArguments = ["exec", "tsx", "evals/square/setup-access.ts"];
    if (options.model) setupArguments.push("--model", options.model);
    const setup = await requireSuccess("pnpm", setupArguments, environment);
    if (!setup) return;

    let failed = false;
    for (
      let repetition = 0;
      repetition < options.repetitions;
      repetition += 1
    ) {
      const attemptId = await beginManifestAttempt(manifestPath);
      const exitCode = await run(
        "pnpm",
        [
          "exec",
          "eve",
          "eval",
          "agent",
          "--strict",
          "--max-concurrency",
          "1",
          ...options.evalArguments,
        ],
        {
          ...environment,
          EVAL_RUN_MANIFEST_ATTEMPT_ID: attemptId,
          EVAL_RUN_MANIFEST_PATH: manifestPath,
        }
      );
      await completeManifestAttempt(manifestPath, attemptId, exitCode);
      failed ||= exitCode !== 0;
      if (interrupted) return;
      if (repetition + 1 >= options.repetitions) continue;

      const cost = await manifestCostStatus(manifestPath);
      if (cost.unknown) {
        throw new Error(
          "Stopping paid eval repetitions because at least one attempt has unknown cost."
        );
      }
      if (cost.knownCostUsd >= options.maxCostUsd) {
        throw new Error(
          `Stopping paid eval repetitions at $${cost.knownCostUsd.toFixed(6)} because it reached --max-cost-usd $${options.maxCostUsd.toFixed(6)}.`
        );
      }
    }
    if (!interrupted) process.exitCode = failed ? 1 : 0;
  } finally {
    if (composeAttempted) {
      const exitCode = await run(
        "docker",
        composeArguments("down", "--volumes"),
        inheritedEnvironment
      );
      if (exitCode !== 0) {
        console.error(
          `docker compose teardown exited with ${String(exitCode)}`
        );
        process.exitCode = 1;
      }
    }
  }
}

function parseAgentEvalOptions(args: string[]) {
  let maxCostUsd: number | undefined;
  let model: string | undefined;
  let repetitions = 1;
  const evalArguments: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      argument === "--max-cost-usd" ||
      argument === "--model" ||
      argument === "--repetitions"
    ) {
      const value = args[++index];
      if (!value || value.startsWith("-"))
        throw unsupportedEvalArgument(argument);
      if (argument === "--max-cost-usd")
        maxCostUsd = parsePositiveNumber(argument, value);
      if (argument === "--model") model = parseModelId(value);
      if (argument === "--repetitions") repetitions = parseRepetitions(value);
      continue;
    }
    evalArguments.push(argument ?? "");
  }
  if (maxCostUsd === undefined) {
    throw new Error(
      "Paid agent evals require --max-cost-usd <USD> before they start."
    );
  }
  const validated = validateEvalArguments(evalArguments);
  const timeoutArgument = validated.find(
    (argument) => argument === "--timeout" || argument.startsWith("--timeout=")
  );
  const timeoutValue = timeoutArgument?.includes("=")
    ? timeoutArgument.slice("--timeout=".length)
    : timeoutArgument
      ? validated[validated.indexOf(timeoutArgument) + 1]
      : undefined;
  return {
    evalArguments: validated,
    maxCostUsd,
    model: model ?? null,
    repetitions,
    timeoutMs: timeoutValue ? Number(timeoutValue) : 180_000,
  };
}

function parsePositiveNumber(option: string, value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000) {
    throw new Error(
      `${option} must be a number greater than 0 and at most 1000.`
    );
  }
  return parsed;
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

function parseRepetitions(value: string) {
  const repetitions = Number(value);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    throw new Error("--repetitions must be an integer from 1 to 5.");
  }
  return repetitions;
}

function validateEvalArguments(args: string[]) {
  const booleanOptions = new Set([
    "--json",
    "--list",
    "--skip-report",
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
      throw unsupportedEvalArgument(argument);
    }

    if (equalsIndex !== -1) {
      if (argument.slice(equalsIndex + 1).length === 0) {
        throw unsupportedEvalArgument(argument);
      }
      validated.push(argument);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      throw unsupportedEvalArgument(argument);
    }
    validated.push(argument, value);
    index += 1;
  }

  return validated;
}

function unsupportedEvalArgument(argument: string) {
  return new Error(
    `Unsupported agent eval argument "${argument}". Use only filtering, output, or timeout options; the harness owns the eval path, target, strictness, and concurrency.`
  );
}

function requireModelCredentials() {
  if (
    inheritedEnvironment.AI_GATEWAY_API_KEY?.trim() ||
    inheritedEnvironment.VERCEL_OIDC_TOKEN?.trim()
  ) {
    return;
  }

  throw new Error(
    "Agent evals require AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN. Add one to .env.local or the current environment."
  );
}

async function requireSuccess(
  command: string,
  args: string[],
  environment = inheritedEnvironment
) {
  const exitCode = await run(command, args, environment);
  if (exitCode !== 0 && !interrupted) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${String(exitCode)}`
    );
  }
  return exitCode === 0 && !interrupted;
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env: environment,
    stdio: "inherit",
  });
  activeChild = child;

  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (activeChild === child) activeChild = undefined;
      resolve(code);
    });
  });
}

async function output(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env: inheritedEnvironment,
    stdio: ["inherit", "pipe", "inherit"],
  });
  activeChild = child;
  child.stdout.setEncoding("utf8");
  let value = "";
  child.stdout.on("data", (chunk: string) => {
    value += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (activeChild === child) activeChild = undefined;
  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${String(exitCode)}`
    );
  }
  return value;
}

function interrupt(child: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ESRCH")
    ) {
      throw error;
    }
  }
}
