// Evaluation supervisor only: never imported by the application.
/* oxlint-disable eslint/no-restricted-properties -- explicitly constructs isolated child environments */
/* oxlint-disable eslint/no-await-in-loop -- trials and lifecycle steps must run serially for fixture isolation and shared spending attribution. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGateway } from "ai";
import { z } from "zod";
import { startBudgetGateway } from "./budget";
import { startConversationFixtures } from "./fixtures";
import {
  makeTrialManifest,
  writeReport,
  writeTrial,
  readTrial,
  type TrialRecord,
} from "./report";

const root = fileURLToPath(new URL("../../", import.meta.url));
const inherited = { ...process.env };
const args = process.argv.slice(2);
const budgetUsd = Number(args[1]);
const resumeId = args[2] === "--resume" ? args[3] : undefined;
if (
  args[0] !== "--budget-usd" ||
  ![10, 20].includes(budgetUsd) ||
  !(args.length === 2 || (args.length === 4 && resumeId)) ||
  (resumeId && !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/u.test(resumeId))
) {
  throw new Error(
    "Use --conversation-baseline --budget-usd 10|20 [--resume run-id]; use only the explicitly authorized cumulative budget."
  );
}
const checkpointId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const runId = resumeId ?? checkpointId;
const outputDir = join(root, ".eve/conversation-baseline", runId);
const records = makeTrialManifest();
const resumedProvenance = resumeId
  ? z
      .object({
        status: z.literal("interrupted"),
        cleanup: z.literal("completed"),
        commitSha: z.string().regex(/^[a-f0-9]{40}$/u),
        agentSourceHash: z.string(),
        rubricHash: z.string(),
        scenarioHash: z.string(),
        agentModel: z.string(),
        judgeModel: z.string(),
      })
      .parse(
        JSON.parse(await readFile(join(outputDir, "provenance.json"), "utf8"))
      )
  : undefined;
if (resumedProvenance) {
  const previousBudget = z
    .object({
      poisoned: z.literal(false),
      requests: z.array(
        z.object({
          trialKey: z.string().nullable(),
          costUsd: z.number(),
          status: z.literal("reconciled"),
        })
      ),
    })
    .parse(JSON.parse(await readFile(join(outputDir, "budget.json"), "utf8")));
  const previousManifest = z
    .array(z.object({ key: z.string() }))
    .parse(
      JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"))
    );
  if (
    JSON.stringify(previousManifest.map((record) => record.key)) !==
    JSON.stringify(records.map((record) => record.key))
  )
    throw new Error("Resume manifest differs from the authored suite");
  for (const [index, scheduled] of records.entries()) {
    const prior = await readTrial(outputDir, scheduled.key);
    if (
      prior.status === "completed" &&
      !["pending"].includes(prior.judge.status)
    )
      records[index] = prior;
    else if (
      prior.status !== "blocked" ||
      prior.turns.length !== 0 ||
      previousBudget.requests.some((request) => request.trialKey === prior.key)
    )
      throw new Error(
        `Resume refuses to replace an attempted trial: ${prior.key}`
      );
  }
  const checkpoint = join(outputDir, "checkpoints", checkpointId);
  await mkdir(checkpoint, { recursive: true });
  for (const name of [
    "provenance.json",
    "summary.json",
    "report.md",
    "budget.json",
    "native-budget-verification.json",
  ])
    await copyFile(join(outputDir, name), join(checkpoint, name));
} else {
  await mkdir(outputDir, { recursive: true });
  for (const record of records) await writeTrial(outputDir, record);
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(records, null, 2),
    { flag: "wx" }
  );
}
console.log(`Conversation baseline artifacts: ${outputDir}`);

const project = `jory-conversation-${randomBytes(6).toString("hex")}`;
let child: ChildProcess | undefined;
const lifecycle = { interrupted: false };
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => {
    lifecycle.interrupted = true;
    if (child?.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        /* child already stopped */
      }
    }
  });
}
async function command(
  commandName: string,
  commandArgs: string[],
  environment: NodeJS.ProcessEnv,
  capture = false
) {
  if (lifecycle.interrupted && !commandArgs.includes("down"))
    throw new Error("Evaluation interrupted");
  const current = spawn(commandName, commandArgs, {
    cwd: root,
    env: environment,
    detached: true,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  child = current;
  let output = "";
  let errors = "";
  current.stdout?.on("data", (part: Buffer) => {
    output += part.toString();
  });
  current.stderr?.on("data", (part: Buffer) => {
    errors += part.toString();
  });
  const code = await new Promise<number | null>((resolveCode, reject) => {
    current.once("error", reject);
    current.once("close", resolveCode);
  });
  if (child === current) child = undefined;
  return { code, output, errors };
}
const compose = (...parts: string[]) => [
  "compose",
  "--project-name",
  project,
  ...parts,
];
const cleanEnvironment: NodeJS.ProcessEnv = { NODE_ENV: "development" };
for (const key of [
  "PATH",
  "HOME",
  "TMPDIR",
  "SHELL",
  "USER",
  "PNPM_HOME",
  "LANG",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
]) {
  if (inherited[key]) cleanEnvironment[key] = inherited[key];
}
const systemEnvironment = { ...cleanEnvironment };
let databaseAttempted = false;
let fixtures: Awaited<ReturnType<typeof startConversationFixtures>> | undefined;
let budget: Awaited<ReturnType<typeof startBudgetGateway>> | undefined;
interface BaselineProvenance {
  status: string;
  budgetUsd: number;
  scenarioCount: number;
  variantCount: number;
  plannedTrials: number;
  judgmentCalibration: string;
  channel: string;
  visibleRendering: string;
  recipientReceipt: string;
  agentOutputTokenCap: number;
  judgeOutputTokenCap: number;
  nativeBudget?: {
    keyId: string;
    limitUsd: number;
    refreshPeriod: "none";
    verifiedAt: string;
  };
  searchReservationHeadroomUsd: number;
  commitSha?: string;
  agentSourceHash?: string;
  rubricHash?: string;
  scenarioHash?: string;
  harnessSourceHash?: string;
  agentModel?: string;
  judgeModel?: string;
  reasoning?: string;
  priceSource?: string;
  priceFetchedAt?: string;
  reservationRates?: Record<
    string,
    {
      inputUsdPerToken: number;
      outputUsdPerToken: number;
    }
  >;
  error?: string;
  cleanup?: string;
  squareRegressionGate?: { exitCode: number | null; results: string | null };
  resumedFromCheckpoint?: string;
  retainedCompletedTrials?: number;
}
const provenance: BaselineProvenance = {
  status: "initializing",
  budgetUsd,
  scenarioCount: 20,
  variantCount: 21,
  plannedTrials: 63,
  judgmentCalibration: "uncalibrated",
  channel: "local Eve HTTP/SSE",
  visibleRendering: "unobserved",
  recipientReceipt: "unobserved",
  agentOutputTokenCap: 4096,
  judgeOutputTokenCap: 2048,
  searchReservationHeadroomUsd: 2,
};
if (resumeId) {
  provenance.resumedFromCheckpoint = checkpointId;
  provenance.retainedCompletedTrials = records.filter(
    (record) => record.status === "completed"
  ).length;
}
try {
  for (const name of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
  ]) {
    try {
      await readFile(join(root, name));
      throw new Error(
        "Baseline requires a clean worktree without dotenv files"
      );
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
  }
  const keyFile = inherited.CONVERSATION_GATEWAY_KEY_FILE;
  if (!keyFile)
    throw new Error(
      "Set CONVERSATION_GATEWAY_KEY_FILE to the dedicated budgeted key credential file"
    );
  const credential = z
    .object({
      apiKey: z.string().startsWith("vck_"),
      keyId: z.string().min(1),
      teamId: z.string().startsWith("team_"),
    })
    .parse(JSON.parse(await readFile(keyFile, "utf8")));
  const verified = await command(
    "pnpm",
    [
      "exec",
      "vercel",
      "ai-gateway",
      "api-keys",
      "list",
      "--format",
      "json",
      "--scope",
      credential.teamId,
    ],
    systemEnvironment,
    true
  );
  if (verified.code !== 0)
    throw new Error(
      "Unable to verify the dedicated Gateway key's current budget"
    );
  const keys = z
    .object({
      apiKeys: z.array(
        z.object({
          id: z.string(),
          teamId: z.string(),
          createdAt: z.number(),
          activeAt: z.number().nullable(),
          expiresAt: z.number().nullable(),
          quota: z.unknown().optional(),
        })
      ),
    })
    .parse(JSON.parse(verified.output));
  const key = keys.apiKeys.find(
    (item) => item.id === credential.keyId && item.teamId === credential.teamId
  );
  if (
    !key ||
    key.activeAt === null ||
    (key.expiresAt !== null && key.expiresAt <= Date.now())
  )
    throw new Error("Dedicated Gateway key is missing, inactive, or expired");
  const quota = z
    .object({
      limitAmount: z
        .union([z.literal(8), z.literal(18)])
        .refine((value) => value === budgetUsd - 2),
      currentSpend: z
        .number()
        .nonnegative()
        .max(budgetUsd - 2),
      includeByokInQuota: z.literal(true),
      refreshPeriod: z.literal("none"),
      active: z.literal(true),
      archived: z.literal(false),
      createdAt: z.number(),
      updatedAt: z.number(),
    })
    .parse(key.quota);
  if (Date.now() - Math.max(key.createdAt, quota.updatedAt) < 120_000)
    throw new Error(
      "Wait at least two minutes after key budget creation or update before running inference"
    );
  const verifiedNativeBudget = {
    keyId: key.id,
    limitUsd: quota.limitAmount,
    refreshPeriod: quota.refreshPeriod,
    verifiedAt: new Date().toISOString(),
  };
  provenance.nativeBudget = verifiedNativeBudget;
  await writeFile(
    join(outputDir, "native-budget-verification.json"),
    JSON.stringify(
      {
        keyId: key.id,
        teamId: key.teamId,
        quota,
        verifiedAt: verifiedNativeBudget.verifiedAt,
      },
      null,
      2
    )
  );

  const sha = await command(
    "git",
    ["rev-parse", "HEAD"],
    cleanEnvironment,
    true
  );
  provenance.commitSha = sha.output.trim();
  const diff = await command(
    "git",
    ["diff", "HEAD", "--", "agent", "db/services/settings.ts"],
    cleanEnvironment,
    true
  );
  if (diff.output.trim())
    throw new Error(
      "Agent instructions/model source must be unchanged for the baseline"
    );
  provenance.agentSourceHash = createHash("sha256")
    .update(await readFile(join(root, "agent/agent.ts")))
    .digest("hex");
  provenance.rubricHash = createHash("sha256")
    .update(await readFile(join(root, "docs/evaluation/rubric.md")))
    .digest("hex");
  provenance.scenarioHash = createHash("sha256")
    .update(await readFile(join(root, "evals/conversation/cases.ts")))
    .digest("hex");

  const harnessHash = createHash("sha256");
  for (const file of [
    "run.ts",
    "setup.ts",
    "execute.ts",
    "cases.ts",
    "budget.ts",
    "fixtures.ts",
    "report.ts",
    "preload.mjs",
  ]) {
    harnessHash
      .update(file)
      .update(await readFile(join(root, "evals/conversation", file)));
  }
  provenance.harnessSourceHash = harnessHash.digest("hex");

  if (resumedProvenance) {
    const agentDrift = await command(
      "git",
      [
        "diff",
        resumedProvenance.commitSha,
        "--",
        "agent",
        "db/services/settings.ts",
      ],
      cleanEnvironment,
      true
    );
    const measurementDrift = await command(
      "git",
      [
        "diff",
        "HEAD",
        "--",
        "evals/conversation/execute.ts",
        "evals/conversation/fixtures.ts",
        "evals/conversation/preload.mjs",
        "evals/conversation/setup.ts",
      ],
      cleanEnvironment,
      true
    );
    if (
      agentDrift.code !== 0 ||
      agentDrift.output.trim() ||
      measurementDrift.code !== 0 ||
      measurementDrift.output.trim() ||
      resumedProvenance.agentSourceHash !== provenance.agentSourceHash ||
      resumedProvenance.rubricHash !== provenance.rubricHash ||
      resumedProvenance.scenarioHash !== provenance.scenarioHash
    )
      throw new Error("Resume requires the same agent, scenarios, and rubric");
  }

  databaseAttempted = true;
  if (
    (
      await command(
        "docker",
        compose("up", "--detach", "--wait", "postgres"),
        cleanEnvironment
      )
    ).code !== 0
  )
    throw new Error("Isolated PostgreSQL failed to start");
  const address = await command(
    "docker",
    compose("port", "postgres", "5432"),
    cleanEnvironment,
    true
  );
  const port = /:(\d+)\s*$/u.exec(address.output)?.[1];
  if (!port) throw new Error("No isolated database port");
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/open_instinct`;
  Object.assign(cleanEnvironment, {
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
    BETTER_AUTH_URL: "http://127.0.0.1:9",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    SECRET_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    KERNEL_API_KEY: "unused-by-conversation-evals",
    KERNEL_BASE_URL: "http://127.0.0.1:9",
    WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
  });
  if ((await command("pnpm", ["db:migrate"], cleanEnvironment)).code !== 0)
    throw new Error("Isolated migration failed");
  // The metadata helper reads the existing model selection contract in this fresh DB.
  const metadata = await command(
    "pnpm",
    ["exec", "tsx", "evals/conversation/setup.ts"],
    cleanEnvironment,
    true
  );
  if (metadata.code !== 0)
    throw new Error("Unable to provision the isolated eval scope/model");
  const modelLine = metadata.output
    .split("\n")
    .find((line) => line.startsWith("CONVERSATION_MODEL="));
  const agentModel = modelLine?.slice("CONVERSATION_MODEL=".length);
  if (!agentModel) throw new Error("Missing configured model metadata");
  const judgeModel = "openai/gpt-5.4-mini";
  if (
    resumedProvenance &&
    (resumedProvenance.agentModel !== agentModel ||
      resumedProvenance.judgeModel !== judgeModel)
  )
    throw new Error(
      "Resume model or judge differs from the paused measurement"
    );
  provenance.agentModel = agentModel;
  provenance.judgeModel = judgeModel;
  provenance.reasoning = "low";
  let authHeaders: Record<string, string> | undefined;
  const gateway = createGateway({
    apiKey: credential.apiKey,
    fetch: async (url, init) => {
      authHeaders = Object.fromEntries(new Headers(init?.headers).entries());
      return fetch(url, init);
    },
  });
  await gateway.getAvailableModels();
  if (!authHeaders) throw new Error("No Gateway authentication available");
  const catalogResponse = await fetch(
    "https://ai-gateway.vercel.sh/v1/models",
    { headers: authHeaders, redirect: "error" }
  );
  if (!catalogResponse.ok)
    throw new Error(
      `Gateway model metadata failed (${String(catalogResponse.status)})`
    );
  const catalog = z
    .object({
      data: z.array(
        z.object({ id: z.string(), pricing: z.record(z.string(), z.unknown()) })
      ),
    })
    .parse(await catalogResponse.json());
  const models: Record<
    string,
    {
      inputUsdPerToken: number;
      outputUsdPerToken: number;
    }
  > = {};
  for (const id of [agentModel, judgeModel]) {
    const entry = catalog.data.find((model) => model.id === id);
    if (!entry)
      throw new Error(
        `Configured model missing from authoritative catalog: ${id}`
      );
    const maxima = { input: 0, output: 0 };
    // This is the authoritative pricing JSON boundary; all positive prices are
    // considered so long-context, cache-write and regional tiers are covered.
    /* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- traverse external variable-depth pricing metadata, accepting only finite positive numeric strings. */
    const walk = (value: unknown, path = "") => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item, path);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [field, item] of Object.entries(value))
          walk(item, `${path}.${field}`);
        return;
      }
      if (typeof value !== "string") return;
      const number = Number(value);
      if (!(number > 0 && Number.isFinite(number))) return;
      if (path.includes("output"))
        maxima.output = Math.max(maxima.output, number);
      else if (path.includes("input"))
        maxima.input = Math.max(maxima.input, number);
    };
    /* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof */
    walk(entry.pricing);
    models[id] = {
      inputUsdPerToken: maxima.input,
      outputUsdPerToken: maxima.output,
    };
  }
  provenance.priceSource = "Authenticated Gateway /v1/models";
  provenance.priceFetchedAt = new Date().toISOString();
  provenance.reservationRates = models;
  await writeFile(
    join(outputDir, "provenance.json"),
    JSON.stringify(provenance, null, 2)
  );
  budget = await startBudgetGateway({
    budgetUsd,
    outputDir,
    ledgerDirectory: join(root, ".eve/conversation-baseline/budget-control"),
    authHeaders,
    models,
    agentModel,
    judgeModel,
    verifiedNativeBudget,
    resumeOutput: Boolean(resumeId),
  });
  fixtures = await startConversationFixtures();
  Object.assign(cleanEnvironment, {
    AI_GATEWAY_API_KEY: "evaluation-proxy-placeholder",
    VERCEL_OIDC_TOKEN: "synthetic-connect-evaluation-token",
    SQUARE_BASE_URL: fixtures.url,
    SQUARE_ENVIRONMENT: "sandbox",
    CONVERSATION_FIXTURE_URL: fixtures.url,
    CONVERSATION_FIXTURE_TOKEN: fixtures.token,
    CONVERSATION_BUDGET_URL: budget.url,
    CONVERSATION_BUDGET_TOKEN: budget.token,
    CONVERSATION_OUTPUT_DIR: outputDir,
    CONVERSATION_DATABASE_URL: databaseUrl,
    CONVERSATION_AGENT_MODEL: agentModel,
    CONVERSATION_JUDGE_MODEL: judgeModel,
    CONVERSATION_ALLOWED_READ_URLS: JSON.stringify([
      "https://raw.githubusercontent.com/square/connect-api-specification/551af55f16fce178780e6556570973aaf660e52a/api.json",
    ]),
    NODE_OPTIONS: `--import ${join(root, "evals/conversation/preload.mjs")}`,
  });
  for (const trial of records) {
    if (trial.status === "completed") continue;
    const group =
      trial.variant === "never-connected"
        ? "disconnected"
        : trial.variant === "revoked"
          ? "revoked"
          : "connected";
    if (lifecycle.interrupted || budget.snapshot().poisoned) break;
    const environment = { ...cleanEnvironment };
    if (group === "connected")
      environment.SQUARE_SANDBOX_ACCESS_TOKEN = "eval-token";
    else environment.SQUARE_CONNECTOR_UID = "conversation-square";
    environment.CONVERSATION_AUTH_MODE = group;
    environment.CONVERSATION_TRIAL_KEY = trial.key;
    console.log(`Starting ${trial.key}`);
    const result = await command(
      "pnpm",
      [
        "exec",
        "eve",
        "eval",
        "--tag",
        `conversation-trial-${trial.key}`,
        "--max-concurrency",
        "1",
      ],
      environment
    );
    // Behavioral failures are the intended baseline evidence; keep running other packs.
    if (result.code === 2)
      throw new Error(`Eve configuration failed for ${group}`);
    const outcome = await readTrial(outputDir, trial.key);
    console.log(
      `${trial.key}: ${outcome.status}; cumulative charged/reserved $${budget.snapshot().chargedOrReservedUsd.toFixed(4)}`
    );
    if (
      outcome.status === "failed" &&
      !budget
        .snapshot()
        .requests.some(
          (request) => request.runId === runId && request.trialKey === trial.key
        )
    ) {
      throw new Error(
        `Trial ${trial.key} failed before a billable request; inspect its runtime error before continuing`
      );
    }
    if (outcome.status === "blocked" && outcome.turns.length === 0) {
      throw new Error(outcome.reason ?? "Trial setup failed before inference");
    }
  }
  if (!lifecycle.interrupted && !budget.snapshot().poisoned) {
    console.log(
      "Running the existing Square regression gate under the same budget"
    );
    await fetch(`${budget.url}/__budget/context`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${budget.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        trialKey: "square-regression-gate",
        stage: "agent",
      }),
    });
    const gateEnvironment = { ...cleanEnvironment };
    delete gateEnvironment.CONVERSATION_OUTPUT_DIR;
    const gate = await command(
      "pnpm",
      [
        "eval:square",
        "--max-concurrency",
        "1",
        "--exclude-tag",
        "conversation-baseline",
      ],
      gateEnvironment,
      true
    );
    await writeFile(
      join(outputDir, "square-regression.log"),
      gate.output + gate.errors
    );
    const results =
      gate.output.split("\n").find((line) => line.includes("Results:")) ?? null;
    provenance.squareRegressionGate = { exitCode: gate.code, results };
    console.log(
      results ?? `Square regression gate exited ${String(gate.code)}`
    );
    if (gate.code !== 0) process.exitCode = 1;
  }
  provenance.status = lifecycle.interrupted ? "interrupted" : "finished";
} catch (error) {
  provenance.status = "blocked";
  provenance.error =
    error instanceof Error ? error.message : "Unknown supervisor error";
  console.error(provenance.error);
  process.exitCode = 1;
} finally {
  if (budget) await budget.close();
  if (fixtures) await fixtures.close();
  if (databaseAttempted) {
    if (
      (await command("docker", compose("down", "--volumes"), systemEnvironment))
        .code !== 0
    ) {
      provenance.cleanup = "failed";
      process.exitCode = 1;
    } else provenance.cleanup = "completed";
  }
  if (resumedProvenance && !budget && provenance.cleanup !== "failed") {
    const checkpoint = join(outputDir, "checkpoints", checkpointId);
    await writeFile(
      join(checkpoint, "resume-error.json"),
      JSON.stringify(provenance, null, 2)
    );
    // No paid requests were dispatched. Keep the prior evidence and resume point intact.
    for (const name of [
      "provenance.json",
      "summary.json",
      "report.md",
      "budget.json",
      "native-budget-verification.json",
    ])
      await copyFile(join(checkpoint, name), join(outputDir, name));
  } else {
    const final: TrialRecord[] = [];
    for (const { key } of records) {
      const record = await readTrial(outputDir, key);
      if (record.status === "pending" || record.status === "running") {
        record.status = "blocked";
        record.reason =
          provenance.error ??
          "Trial did not settle; inspect runner and budget evidence";
        await writeTrial(outputDir, record);
      }
      final.push(record);
    }
    await writeReport(outputDir, {
      provenance: { ...provenance },
      records: final,
      budget: budget?.snapshot() ?? {
        budgetUsd,
        verifiedNativeBudget: null,
        searchHeadroomUsd: null,
        chargedOrReservedUsd: 0,
        poisoned: false,
        requests: [],
      },
    });
    await writeFile(
      join(outputDir, "provenance.json"),
      JSON.stringify(provenance, null, 2)
    );
    console.log(`Report: ${join(outputDir, "report.md")}`);
    if (final.some((record) => record.status === "blocked"))
      process.exitCode = 1;
  }
}
