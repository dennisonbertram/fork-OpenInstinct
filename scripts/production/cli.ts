import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { readTarget } from "../diagnostics/read-target.ts";
import type { ProductionSurface, ProductionTarget } from "./inventory.ts";
import {
  ProductionOperationError,
  createProductionOperations,
  parseOperationPlan,
  type OperationPlan,
  type ProductionOwner,
} from "./operations.ts";

const executeFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const inventoryPath = fileURLToPath(
  new URL("../../config/production-targets.json", import.meta.url)
);
const receiptDirectory = fileURLToPath(
  new URL("../../.eve/production-operations", import.meta.url)
);
const deploymentIdSchema = z.string().regex(/^dpl_[a-zA-Z0-9]+$/u);
const planIdSchema = z.string().regex(/^prod-plan-v1-[a-f0-9]{20}$/u);
const shaSchema = z.string().regex(/^[a-f0-9]{7,64}$/iu);
const supportedOptionNames = new Set([
  "--target",
  "--surface",
  "--deployment",
  "--plan",
  "--known-good",
  "--expected-sha",
]);

interface Arguments {
  command: "status" | "plan" | "apply" | "verify" | "rollback";
  operation?: "release" | "rollback";
  planId?: string;
  planPath?: string;
  target?: ProductionTarget;
  surface: ProductionSurface;
  deploymentId?: string;
  knownGoodDeploymentId?: string;
  expectedSourceSha?: string;
}

async function main(rawArguments = process.argv.slice(2)) {
  try {
    const parsed = parseArguments(rawArguments);
    const operations = await createProductionOperations({
      inventoryPath,
      receiptDirectory,
      readTarget,
      owner: createOwner(),
    });
    const result = await execute(operations, parsed);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code =
      error instanceof ProductionOperationError ? error.code : "UNAVAILABLE";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

export function parseArguments(rawArguments: readonly string[]): Arguments {
  const [command, ...rest] = rawArguments;
  if (!isCommand(command)) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Expected status, plan, apply, verify, or rollback."
    );
  }
  const values = new Map<string, string>();
  const parsed: Arguments = { command, surface: "app" };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === undefined) {
      throw new ProductionOperationError("PLAN_INVALID", "Missing argument.");
    }
    if (
      command === "plan" &&
      index === 0 &&
      (argument === "release" || argument === "rollback")
    ) {
      parsed.operation = argument;
      continue;
    }
    if (command === "plan" && index === 0 && !argument.startsWith("--")) {
      throw new ProductionOperationError(
        "UNSUPPORTED_OPERATION",
        "Provisioning, migration, rotation, and channel activation require their owning reviewed runbooks."
      );
    }
    if (
      (command === "apply" || command === "verify" || command === "rollback") &&
      index === 0 &&
      planIdSchema.safeParse(argument).success
    ) {
      parsed.planId = argument;
      continue;
    }
    const next = rest[index + 1];
    if (
      !isKnownOption(argument) ||
      values.has(argument) ||
      next === undefined ||
      next.startsWith("--")
    ) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Invalid production operation arguments."
      );
    }
    values.set(argument, next);
    index += 1;
  }
  populateValues(parsed, values);
  validateArguments(parsed);
  return parsed;
}

function populateValues(
  arguments_: Arguments,
  values: ReadonlyMap<string, string>
) {
  const target = values.get("--target");
  if (target !== undefined) {
    arguments_.target = parseTarget(target);
  }
  const surface = values.get("--surface");
  if (surface !== undefined) {
    arguments_.surface = parseSurface(surface);
  }
  const deploymentId = values.get("--deployment");
  if (deploymentId !== undefined) arguments_.deploymentId = deploymentId;
  const planPath = values.get("--plan");
  if (planPath !== undefined) arguments_.planPath = planPath;
  const knownGood = values.get("--known-good");
  if (knownGood !== undefined) arguments_.knownGoodDeploymentId = knownGood;
  const expectedSha = values.get("--expected-sha");
  if (expectedSha !== undefined) arguments_.expectedSourceSha = expectedSha;
}

function validateArguments(arguments_: Arguments) {
  const { command } = arguments_;
  if (command === "status" && arguments_.target === undefined) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Status requires --target."
    );
  }
  if (
    command === "plan" &&
    (arguments_.operation === undefined || arguments_.target === undefined)
  ) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Plan requires an operation and --target."
    );
  }
  if (
    arguments_.target === "preview" &&
    arguments_.deploymentId === undefined
  ) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Preview requires --deployment <immutable-id>."
    );
  }
  if (
    (command === "apply" || command === "rollback" || command === "verify") &&
    (arguments_.planId === undefined || arguments_.planPath === undefined)
  ) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      `${command} requires a reviewed plan ID and --plan <path>.`
    );
  }
  if (command === "verify" && arguments_.deploymentId === undefined) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Verify requires --deployment <immutable-id>."
    );
  }
}

async function execute(
  operations: Awaited<ReturnType<typeof createProductionOperations>>,
  arguments_: Arguments
) {
  if (arguments_.command === "status") {
    const target = required(arguments_.target, "Status requires --target.");
    return arguments_.deploymentId === undefined
      ? operations.status({ target, surface: arguments_.surface })
      : operations.status({
          target,
          surface: arguments_.surface,
          deploymentId: arguments_.deploymentId,
        });
  }
  if (arguments_.command === "plan") {
    const target = required(arguments_.target, "Plan requires --target.");
    const operation = required(
      arguments_.operation,
      "Plan requires an operation."
    );
    return operations.plan({
      operation,
      target,
      surface: arguments_.surface,
      deploymentId: arguments_.deploymentId,
      knownGoodDeploymentId: arguments_.knownGoodDeploymentId,
      expectedSourceSha: arguments_.expectedSourceSha,
    });
  }
  const plan = await readPlan(
    required(arguments_.planPath, "Operation requires --plan."),
    required(arguments_.planId, "Operation requires a reviewed plan ID.")
  );
  if (arguments_.command === "verify") {
    return operations.verify(
      plan,
      required(arguments_.deploymentId, "Verify requires --deployment.")
    );
  }
  if (arguments_.command === "rollback" && plan.operation !== "rollback") {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Rollback requires a rollback plan."
    );
  }
  return operations.apply(plan);
}

async function readPlan(path: string, id: string): Promise<OperationPlan> {
  const plan = parseOperationPlan(await readFile(path, "utf8"));
  if (plan.id !== id) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Plan file does not match the reviewed plan ID."
    );
  }
  return plan;
}

function createOwner(): ProductionOwner {
  return {
    async observeGitRelease(input) {
      if (input.target.target === "preview") return { state: "pending" };
      const read = await readTarget({
        target: input.target.target,
        surface: input.target.surface,
      });
      const deployment =
        read.facts.currentDeploymentId ?? read.facts.deploymentId;
      const sourceSha = shaSchema.safeParse(
        read.facts.declaredSourceSha?.value
      );
      if (!sourceSha.success || sourceSha.data !== input.expectedSourceSha) {
        return { state: "pending" };
      }
      const id = deploymentIdSchema.safeParse(deployment?.value);
      return id.success
        ? { deploymentId: id.data, state: "ready" as const }
        : { state: "unknown" as const };
    },
    async rollback(input) {
      const deploymentId = deploymentIdSchema.safeParse(input.deploymentId);
      if (!deploymentId.success) {
        throw new ProductionOperationError(
          "PLAN_INVALID",
          "Rollback requires a stable Vercel deployment ID."
        );
      }
      if (input.target.teamId === undefined) {
        throw new ProductionOperationError(
          "TARGET_UNRESOLVED",
          "Rollback target requires a configured Vercel team ID."
        );
      }
      await executeFile(
        "pnpm",
        [
          "exec",
          "vercel",
          "rollback",
          deploymentId.data,
          "--non-interactive",
          "--yes",
          "--scope",
          input.target.teamId,
        ],
        { cwd: repositoryRoot, maxBuffer: 16 * 1024, timeout: 30_000 }
      );
      return { deploymentId: deploymentId.data, state: "ready" as const };
    },
  };
}

function required<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) {
    throw new ProductionOperationError("PLAN_INVALID", message);
  }
  return value;
}

function parseTarget(value: string): ProductionTarget {
  if (value === "local" || value === "preview" || value === "production") {
    return value;
  }
  throw new ProductionOperationError("PLAN_INVALID", "Invalid --target.");
}

function parseSurface(value: string): ProductionSurface {
  if (value === "app" || value === "marketing") return value;
  throw new ProductionOperationError("PLAN_INVALID", "Invalid --surface.");
}

function isKnownOption(value: string) {
  return supportedOptionNames.has(value);
}

function isCommand(value: string | undefined): value is Arguments["command"] {
  return (
    value === "status" ||
    value === "plan" ||
    value === "apply" ||
    value === "verify" ||
    value === "rollback"
  );
}

if (import.meta.main) await main();
