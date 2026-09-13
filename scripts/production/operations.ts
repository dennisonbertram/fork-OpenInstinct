import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type {
  TargetReadInput,
  TargetReadResult,
} from "../diagnostics/read-target.ts";
import {
  findProductionTarget,
  readProductionInventory,
  type ProductionSurface,
  type ProductionTarget,
  type ProductionTargetInventory,
} from "./inventory.ts";

export type ProductionTargetRead = TargetReadResult;
type OperationKind = "release" | "rollback";

interface TargetSnapshot {
  readonly projectId: string;
  readonly environment: string;
  readonly origin: string;
  readonly deploymentId: string;
  readonly sourceSha: string;
}

export interface OperationPlan {
  readonly version: 1;
  readonly id: string;
  readonly fingerprint: string;
  readonly operation: OperationKind;
  readonly preparedAt: string;
  readonly expiresAt: string;
  readonly target: ProductionTargetInventory;
  readonly current: TargetSnapshot;
  readonly expectedSourceSha: string;
  readonly knownGood?: TargetSnapshot;
}

interface OperationReceipt {
  readonly version: 1;
  readonly planId: string;
  readonly operation: OperationKind;
  readonly target: Pick<
    ProductionTargetInventory,
    "surface" | "target" | "projectId"
  >;
  readonly state: "attempting" | "completed" | "uncertain";
  readonly handle?: string;
  readonly recordedAt: string;
  readonly reason?: string;
}

export interface ProductionOwner {
  readonly observeGitRelease: (input: {
    readonly target: ProductionTargetInventory;
    readonly expectedSourceSha: string;
  }) => Promise<OwnerOutcome>;
  readonly rollback: (input: {
    readonly target: ProductionTargetInventory;
    readonly deploymentId: string;
  }) => Promise<OwnerOutcome>;
}

interface OwnerOutcome {
  readonly deploymentId?: string;
  readonly state: "ready" | "pending" | "timeout" | "unknown";
}

interface ProductionOperationsOptions {
  readonly inventory: Awaited<ReturnType<typeof readProductionInventory>>;
  readonly receiptDirectory: string;
  readonly readTarget: (
    input: TargetReadInput
  ) => Promise<ProductionTargetRead>;
  readonly owner: ProductionOwner;
  readonly now: () => Date;
}

const operationSchema = z.enum(["release", "rollback"]);
const deploymentIdSchema = z.string().regex(/^dpl_[a-zA-Z0-9]+$/u);
const planIdSchema = z.string().regex(/^prod-plan-v1-[a-f0-9]{20}$/u);
const shaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const textSchema = z.string().min(1).max(512);
const snapshotSchema = z.object({
  projectId: textSchema,
  environment: textSchema,
  origin: textSchema,
  deploymentId: deploymentIdSchema,
  sourceSha: shaSchema,
});
const targetSchema = z.object({
  surface: z.enum(["app", "marketing"]),
  target: z.enum(["local", "preview", "production"]),
  projectId: textSchema,
  teamId: textSchema.optional(),
  projectName: textSchema.optional(),
  canonicalOrigin: textSchema.optional(),
  gitRef: textSchema.optional(),
});
const planSchema = z
  .object({
    version: z.literal(1),
    id: planIdSchema,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    operation: operationSchema,
    preparedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    target: targetSchema,
    current: snapshotSchema,
    expectedSourceSha: shaSchema,
    knownGood: snapshotSchema.optional(),
  })
  .superRefine((plan, context) => {
    if (plan.operation === "rollback" && plan.knownGood === undefined) {
      context.addIssue({
        code: "custom",
        message: "Rollback plan lacks known-good snapshot.",
      });
    }
  });
const receiptSchema = z.object({
  version: z.literal(1),
  planId: planIdSchema,
  operation: operationSchema,
  target: z.object({
    surface: z.enum(["app", "marketing"]),
    target: z.enum(["local", "preview", "production"]),
    projectId: textSchema,
  }),
  state: z.enum(["attempting", "completed", "uncertain"]),
  handle: deploymentIdSchema.optional(),
  recordedAt: z.iso.datetime(),
  reason: textSchema.optional(),
});

export function parseOperationPlan(source: string): OperationPlan {
  const parsed = planSchema.safeParse(JSON.parse(source));
  if (!parsed.success) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Invalid operation plan."
    );
  }
  return parsed.data;
}

export class ProductionOperationError extends Error {
  readonly code:
    | "INVENTORY_MISSING"
    | "PLAN_EXPIRED"
    | "PLAN_INVALID"
    | "TARGET_UNRESOLVED"
    | "LOCKED"
    | "UNCERTAIN_REPLAY"
    | "UNSUPPORTED_OPERATION";

  constructor(code: ProductionOperationError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "ProductionOperationError";
  }
}

export async function createProductionOperations(options: {
  readonly inventoryPath: string;
  readonly receiptDirectory: string;
  readonly readTarget: ProductionOperationsOptions["readTarget"];
  readonly owner: ProductionOwner;
  readonly now?: () => Date;
}) {
  const inventory = await readProductionInventory(options.inventoryPath);
  const now = options.now ?? (() => new Date());
  return new ProductionOperations({
    inventory,
    receiptDirectory: options.receiptDirectory,
    readTarget: options.readTarget,
    owner: options.owner,
    now,
  });
}

class ProductionOperations {
  constructor(private readonly options: ProductionOperationsOptions) {}

  async status(input: {
    readonly target: ProductionTarget;
    readonly surface?: ProductionSurface;
    readonly deploymentId?: string;
  }) {
    const surface = input.surface ?? "app";
    const target = findProductionTarget(this.options.inventory, {
      target: input.target,
      surface,
    });
    if (!target) {
      return {
        state: "partial" as const,
        gaps: ["inventory:missing"],
        target: { target: input.target, surface },
      };
    }
    const read = await this.read(target, input.deploymentId);
    const gaps = identityGaps(target, read, input.deploymentId !== undefined);
    return {
      state: statusState(gaps),
      gaps,
      target,
      capturedAt: read.capturedAt,
      facts: statusFacts(read),
      capabilities: read.capabilities,
      readerGaps: read.gaps,
    };
  }

  async plan(input: {
    readonly operation: string;
    readonly target: ProductionTarget;
    readonly surface?: ProductionSurface;
    readonly deploymentId?: string;
    readonly expectedSourceSha?: string;
    readonly knownGoodDeploymentId?: string;
  }): Promise<OperationPlan> {
    const operation = operationSchema.safeParse(input.operation);
    if (!operation.success) {
      throw new ProductionOperationError(
        "UNSUPPORTED_OPERATION",
        "Only release and rollback are supported."
      );
    }
    const surface = input.surface ?? "app";
    const target = findProductionTarget(this.options.inventory, {
      target: input.target,
      surface,
    });
    if (!target) {
      throw new ProductionOperationError(
        "INVENTORY_MISSING",
        `No inventory for ${surface}/${input.target}.`
      );
    }
    const currentDeployment = deploymentIdSchema.safeParse(input.deploymentId);
    if (!currentDeployment.success) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Plan requires an exact current deployment ID."
      );
    }
    if (operation.data === "release") {
      const expectedSha = shaSchema.safeParse(input.expectedSourceSha);
      if (!expectedSha.success) {
        throw new ProductionOperationError(
          "PLAN_INVALID",
          "Release requires an expected source SHA."
        );
      }
      const current = await this.snapshotFor(target, currentDeployment.data);
      const preparedAt = this.options.now().toISOString();
      const expiresAt = new Date(
        this.options.now().getTime() + 5 * 60_000
      ).toISOString();
      return finalizePlan({
        version: 1,
        operation: "release",
        preparedAt,
        expiresAt,
        target,
        current,
        expectedSourceSha: expectedSha.data,
      });
    }

    const current = await this.snapshotFor(target, currentDeployment.data);
    const knownGoodDeployment = deploymentIdSchema.safeParse(
      input.knownGoodDeploymentId
    );
    if (!knownGoodDeployment.success) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Rollback requires a known-good deployment ID."
      );
    }
    const knownGood = await this.snapshotFor(
      target,
      knownGoodDeployment.data,
      false
    );
    rollbackCompatible(
      current,
      knownGood,
      await this.read(target, currentDeployment.data),
      await this.read(target, knownGoodDeployment.data)
    );
    const preparedAt = this.options.now().toISOString();
    const expiresAt = new Date(
      this.options.now().getTime() + 5 * 60_000
    ).toISOString();
    return finalizePlan({
      version: 1,
      operation: "rollback",
      preparedAt,
      expiresAt,
      target,
      current,
      expectedSourceSha: knownGood.sourceSha,
      knownGood,
    });
  }

  async apply(plan: OperationPlan): Promise<OperationReceipt> {
    this.validatePlan(plan);
    this.assertNotExpired(plan);
    await this.requireSnapshot(plan.target, plan.current);
    if (plan.operation === "rollback") {
      const knownGood = plan.knownGood;
      if (!knownGood) {
        throw new ProductionOperationError(
          "PLAN_INVALID",
          "Rollback plan lacks known-good snapshot."
        );
      }
      const currentRead = await this.read(
        plan.target,
        plan.current.deploymentId
      );
      const knownGoodRead = await this.read(
        plan.target,
        knownGood.deploymentId
      );
      rollbackCompatible(plan.current, knownGood, currentRead, knownGoodRead);
    }

    const releaseLock = await this.acquireLock(plan.id);
    try {
      const existing = await this.readReceipt(plan.id);
      if (existing?.state === "completed") return existing;
      if (existing) {
        throw new ProductionOperationError(
          "UNCERTAIN_REPLAY",
          `Plan ${plan.id} already has ${existing.state} evidence.`
        );
      }
      const attempting = this.receipt(plan, "attempting");
      await this.writeReceipt(attempting);
      try {
        const outcome =
          plan.operation === "release"
            ? await this.options.owner.observeGitRelease({
                target: plan.target,
                expectedSourceSha: plan.expectedSourceSha,
              })
            : await this.options.owner.rollback({
                target: plan.target,
                deploymentId: this.rollbackDeployment(plan),
              });
        return await this.recordOutcome(plan, outcome);
      } catch {
        const uncertain = this.receipt(plan, "uncertain", "owner:unknown");
        await this.writeReceipt(uncertain);
        return uncertain;
      }
    } finally {
      await releaseLock();
    }
  }

  async verify(
    plan: OperationPlan,
    deploymentId: string
  ): Promise<OperationReceipt> {
    this.validatePlan(plan);
    const immutableDeployment = deploymentIdSchema.safeParse(deploymentId);
    if (!immutableDeployment.success) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Verify requires an exact immutable deployment ID."
      );
    }
    const receipt = await this.readReceipt(plan.id);
    if (!receipt) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        `No receipt exists for ${plan.id}.`
      );
    }
    try {
      const observed = await this.snapshotFor(
        plan.target,
        immutableDeployment.data
      );
      if (observed.sourceSha !== plan.expectedSourceSha) {
        throw new ProductionOperationError(
          "TARGET_UNRESOLVED",
          "Observed deployment source SHA does not match the plan."
        );
      }
      if (
        plan.operation === "rollback" &&
        observed.deploymentId !== this.rollbackDeployment(plan)
      ) {
        throw new ProductionOperationError(
          "TARGET_UNRESOLVED",
          "Rollback did not select the known-good deployment."
        );
      }
      const completed = this.receipt(
        plan,
        "completed",
        undefined,
        immutableDeployment.data
      );
      await this.writeReceipt(completed);
      return completed;
    } catch (error) {
      if (
        error instanceof ProductionOperationError &&
        error.code === "TARGET_UNRESOLVED"
      ) {
        throw error;
      }
      const uncertain = this.receipt(
        plan,
        "uncertain",
        "verify:unavailable",
        immutableDeployment.data
      );
      await this.writeReceipt(uncertain);
      return uncertain;
    }
  }

  private async recordOutcome(
    plan: OperationPlan,
    outcome: OwnerOutcome
  ): Promise<OperationReceipt> {
    const state =
      outcome.state === "unknown" || outcome.state === "timeout"
        ? "uncertain"
        : "attempting";
    const reason = state === "uncertain" ? `owner:${outcome.state}` : undefined;
    const receipt = this.receipt(plan, state, reason, outcome.deploymentId);
    await this.writeReceipt(receipt);
    return receipt;
  }

  private rollbackDeployment(plan: OperationPlan): string {
    const knownGood = plan.knownGood;
    if (!knownGood) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Rollback plan lacks known-good snapshot."
      );
    }
    return knownGood.deploymentId;
  }

  private async requireSnapshot(
    target: ProductionTargetInventory,
    expected: TargetSnapshot
  ) {
    const observed = await this.snapshotFor(target, expected.deploymentId);
    if (fingerprintSnapshot(observed) !== fingerprintSnapshot(expected)) {
      throw new ProductionOperationError(
        "TARGET_UNRESOLVED",
        "Target drifted since plan creation."
      );
    }
  }

  private read(target: ProductionTargetInventory, deploymentId?: string) {
    if (deploymentId === undefined) {
      return this.options.readTarget({
        target: target.target,
        surface: target.surface,
      });
    }
    return this.options.readTarget({
      target: target.target,
      surface: target.surface,
      deploymentId,
    });
  }

  private async snapshotFor(
    target: ProductionTargetInventory,
    deploymentId: string,
    requireCurrentAlias = target.target === "production"
  ) {
    const deploymentRead = await this.read(target, deploymentId);
    const aliasRead = requireCurrentAlias ? await this.read(target) : undefined;
    return snapshot(target, deploymentRead, deploymentId, aliasRead);
  }

  private receipt(
    plan: OperationPlan,
    state: OperationReceipt["state"],
    reason?: string,
    handle?: string
  ): OperationReceipt {
    const receipt: OperationReceipt = {
      version: 1,
      planId: plan.id,
      operation: plan.operation,
      target: {
        surface: plan.target.surface,
        target: plan.target.target,
        projectId: plan.target.projectId,
      },
      state,
      recordedAt: this.options.now().toISOString(),
    };
    return Object.assign(
      receipt,
      reason === undefined ? undefined : { reason },
      handle === undefined ? undefined : { handle }
    );
  }

  private receiptPath(planId: string) {
    return confined(this.options.receiptDirectory, `${planId}.json`);
  }

  private lockPath(planId: string) {
    return confined(this.options.receiptDirectory, `${planId}.lock`);
  }

  private async readReceipt(
    planId: string
  ): Promise<OperationReceipt | undefined> {
    try {
      return receiptSchema.parse(
        JSON.parse(await readFile(this.receiptPath(planId), "utf8"))
      );
    } catch (error) {
      if (error instanceof Error && isNotFound(error)) return undefined;
      throw error;
    }
  }

  private async writeReceipt(receipt: OperationReceipt) {
    await mkdir(this.options.receiptDirectory, {
      recursive: true,
      mode: 0o700,
    });
    const receiptPath = this.receiptPath(receipt.planId);
    const temporaryPath = confined(
      this.options.receiptDirectory,
      `${receipt.planId}.${process.pid.toString()}.${randomUUID()}.tmp`
    );
    await writeFile(temporaryPath, `${JSON.stringify(receipt)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, receiptPath);
  }

  private async acquireLock(planId: string) {
    await mkdir(this.options.receiptDirectory, {
      recursive: true,
      mode: 0o700,
    });
    try {
      const lock = await open(this.lockPath(planId), "wx", 0o600);
      await lock.writeFile(`${planId}\n`);
      await lock.close();
    } catch (error) {
      if (error instanceof Error && isExists(error)) {
        throw new ProductionOperationError(
          "LOCKED",
          `Another local operation owns ${planId}.`
        );
      }
      throw error;
    }
    return async () => {
      await rm(this.lockPath(planId), { force: true });
    };
  }

  private assertNotExpired(plan: OperationPlan) {
    const expiry = Date.parse(plan.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= this.options.now().getTime()) {
      throw new ProductionOperationError(
        "PLAN_EXPIRED",
        `Plan ${plan.id} is expired.`
      );
    }
  }

  private validatePlan(plan: OperationPlan) {
    const parsed = planSchema.safeParse(plan);
    if (!parsed.success) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Invalid operation plan."
      );
    }
    const { fingerprint, id, ...body } = parsed.data;
    if (
      fingerprint !== fingerprintPlan(body) ||
      id !== `prod-plan-v1-${fingerprint.slice(0, 20)}`
    ) {
      throw new ProductionOperationError(
        "PLAN_INVALID",
        "Plan fingerprint is invalid."
      );
    }
    const configured = findProductionTarget(this.options.inventory, {
      target: plan.target.target,
      surface: plan.target.surface,
    });
    if (
      !configured ||
      fingerprintTarget(configured) !== fingerprintTarget(plan.target)
    ) {
      throw new ProductionOperationError(
        "TARGET_UNRESOLVED",
        "Plan target no longer matches inventory."
      );
    }
  }
}

function finalizePlan(
  body: Omit<OperationPlan, "id" | "fingerprint">
): OperationPlan {
  const fingerprint = fingerprintPlan(body);
  return {
    ...body,
    fingerprint,
    id: `prod-plan-v1-${fingerprint.slice(0, 20)}`,
  };
}

function identityGaps(
  target: ProductionTargetInventory,
  read: ProductionTargetRead,
  requireDeployment: boolean
): string[] {
  const gaps: string[] = [];
  collectIdentityGap(gaps, "projectId", target.projectId, read);
  if (target.teamId !== undefined) {
    collectIdentityGap(gaps, "teamId", target.teamId, read);
  }
  collectIdentityGap(gaps, "environment", target.target, read);
  if (target.projectName !== undefined) {
    collectIdentityGap(gaps, "projectName", target.projectName, read);
  }
  if (target.canonicalOrigin !== undefined) {
    collectIdentityGap(
      gaps,
      "canonicalAliasOrigin",
      target.canonicalOrigin,
      read
    );
  }
  if (requireDeployment) {
    collectIdentityGap(gaps, "deploymentId", undefined, read);
  }
  return gaps;
}

function collectIdentityGap(
  gaps: string[],
  name: string,
  expected: string | undefined,
  read: ProductionTargetRead
) {
  const fact = read.facts[name];
  if (fact?.status !== "observed") {
    gaps.push(`${name}:${fact?.status ?? "unknown"}`);
    return;
  }
  if (expected !== undefined && fact.value !== expected) {
    gaps.push(`${name}:mismatch`);
  }
}

function statusState(gaps: readonly string[]) {
  if (gaps.some((gap) => gap.endsWith(":mismatch"))) return "blocked" as const;
  return gaps.length === 0 ? ("ready" as const) : ("partial" as const);
}

function statusFacts(read: ProductionTargetRead) {
  const names = [
    "projectId",
    "projectName",
    "teamId",
    "environment",
    "deploymentId",
    "currentDeploymentId",
    "deploymentState",
    "immutableDeploymentOrigin",
    "canonicalAliasOrigin",
    "canonicalAuthOrigin",
    "aliasOrigin",
    "declaredSourceSha",
    "schemaVersion",
    "configVersion",
    "rollbackCompatibility",
  ];
  const facts: Record<
    string,
    ProductionTargetRead["facts"][string] | undefined
  > = {};
  for (const name of names) facts[name] = read.facts[name];
  return facts;
}

function snapshot(
  target: ProductionTargetInventory,
  deploymentRead: ProductionTargetRead,
  deploymentId: string,
  aliasRead?: ProductionTargetRead
): TargetSnapshot {
  const result: TargetSnapshot = {
    projectId: observedString(deploymentRead, "projectId"),
    environment: observedString(deploymentRead, "environment"),
    origin:
      aliasRead === undefined
        ? observedString(deploymentRead, "immutableDeploymentOrigin")
        : observedString(aliasRead, "canonicalAliasOrigin", "aliasOrigin"),
    deploymentId: observedString(deploymentRead, "deploymentId"),
    sourceSha: observedString(deploymentRead, "declaredSourceSha"),
  };
  if (
    result.projectId !== target.projectId ||
    result.environment !== target.target ||
    result.deploymentId !== deploymentId
  ) {
    throw new ProductionOperationError(
      "TARGET_UNRESOLVED",
      "Observed target does not match the selected inventory and deployment."
    );
  }
  if (
    aliasRead !== undefined &&
    (result.origin !== target.canonicalOrigin ||
      observedString(aliasRead, "currentDeploymentId") !== deploymentId)
  ) {
    throw new ProductionOperationError(
      "TARGET_UNRESOLVED",
      "The production alias does not select the planned deployment."
    );
  }
  return result;
}

function observedString(
  read: ProductionTargetRead,
  ...names: readonly string[]
): string {
  for (const name of names) {
    const fact = read.facts[name];
    if (fact?.status !== "observed") continue;
    const parsed = textSchema.safeParse(fact.value);
    if (parsed.success) return parsed.data;
  }
  throw new ProductionOperationError(
    "TARGET_UNRESOLVED",
    `Required target fact is unavailable: ${names.join("/")}.`
  );
}

function rollbackCompatible(
  current: TargetSnapshot,
  knownGood: TargetSnapshot,
  currentRead: ProductionTargetRead,
  knownGoodRead: ProductionTargetRead
) {
  if (
    !isCompatible(current, knownGood) ||
    !sameObservedText(currentRead, knownGoodRead, "teamId") ||
    !sameObservedText(currentRead, knownGoodRead, "schemaVersion") ||
    !sameObservedText(currentRead, knownGoodRead, "configVersion") ||
    !sameObservedText(currentRead, knownGoodRead, "databaseLogicalIdentity") ||
    !observedTrue(currentRead, "rollbackCompatibility") ||
    !observedTrue(knownGoodRead, "rollbackCompatibility")
  ) {
    throw new ProductionOperationError(
      "TARGET_UNRESOLVED",
      "Rollback compatibility is not proven for both deployments."
    );
  }
}

function isCompatible(current: TargetSnapshot, knownGood: TargetSnapshot) {
  return (
    current.projectId === knownGood.projectId &&
    current.environment === knownGood.environment
  );
}

function sameObservedText(
  currentRead: ProductionTargetRead,
  knownGoodRead: ProductionTargetRead,
  name: string
) {
  try {
    return (
      observedString(currentRead, name) === observedString(knownGoodRead, name)
    );
  } catch {
    return false;
  }
}

function observedTrue(read: ProductionTargetRead, name: string) {
  const fact = read.facts[name];
  return fact?.status === "observed" && fact.value === true;
}

function fingerprintPlan(value: Omit<OperationPlan, "id" | "fingerprint">) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fingerprintSnapshot(value: TargetSnapshot) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fingerprintTarget(value: ProductionTargetInventory) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function confined(directory: string, fileName: string) {
  const base = resolve(directory);
  const candidate = resolve(base, fileName);
  if (!candidate.startsWith(`${base}/`)) {
    throw new ProductionOperationError(
      "PLAN_INVALID",
      "Receipt path escapes its private directory."
    );
  }
  return candidate;
}

function isNotFound(error: Error) {
  return z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
}

function isExists(error: Error) {
  return z.object({ code: z.literal("EEXIST") }).safeParse(error).success;
}
