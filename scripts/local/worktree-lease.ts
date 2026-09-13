import { open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  DEV_RUN_SCHEMA_VERSION,
  processStartTime,
  runDirectory,
  type DevRunProcess,
} from "./run-record.ts";

export type WorktreeOperation = "development" | "verification";

export interface WorktreeLeaseRecord {
  readonly schemaVersion: typeof DEV_RUN_SCHEMA_VERSION;
  readonly operation: WorktreeOperation;
  readonly cwd: string;
  readonly nonce: string;
  readonly owner: DevRunProcess;
}

const leaseProcessSchema = z.object({
  pid: z.number().int().positive(),
  processStartTime: z.string().min(1),
  processGroup: z.number().int().positive(),
});
const leaseSchema = z.object({
  schemaVersion: z.literal(DEV_RUN_SCHEMA_VERSION),
  operation: z.enum(["development", "verification"]),
  cwd: z.string(),
  nonce: z.string(),
  owner: leaseProcessSchema,
});

export async function acquireWorktreeLease(
  repositoryRoot: string,
  operation: WorktreeOperation
) {
  const directory = await (
    await import("./run-record.ts")
  ).ensureRunDirectory(repositoryRoot);
  const path = join(directory, "worktree-operation.json");
  const ownerStartTime = await processStartTime(process.pid);
  if (ownerStartTime === undefined)
    throw new Error(
      "Could not establish the worktree operation owner identity."
    );
  const record: WorktreeLeaseRecord = {
    schemaVersion: DEV_RUN_SCHEMA_VERSION,
    operation,
    cwd: repositoryRoot,
    nonce: randomBytes(24).toString("hex"),
    owner: {
      pid: process.pid,
      processStartTime: ownerStartTime,
      processGroup: process.pid,
    },
  };
  try {
    return await createLease(path, record);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST"))
      throw error;
  }
  const existing = await readLease(path);
  if (
    existing !== undefined &&
    resolve(existing.cwd) === resolve(repositoryRoot) &&
    (await processStartTime(existing.owner.pid)) ===
      existing.owner.processStartTime
  ) {
    throw new Error(
      `A ${existing.operation} operation already owns this worktree (PID ${String(existing.owner.pid)}).`
    );
  }
  throw new Error(
    `The worktree operation lease is stale or invalid at ${path}. Inspect it and remove only that metadata file after confirming no owner is active.`
  );
}

/**
 * A verification parent may delegate its live lease to a fixture child. The
 * child can validate but never release or replace the parent's lease.
 */
export async function reuseVerificationLease(
  repositoryRoot: string,
  nonce: string
) {
  if (!/^[a-f0-9]{48}$/u.test(nonce))
    throw new Error("DEV_VERIFY_LEASE_NONCE is invalid.");
  const path = join(runDirectory(repositoryRoot), "worktree-operation.json");
  const current = await readLease(path);
  if (current?.operation !== "verification") {
    throw new Error("The verification lease does not match this fixture run.");
  }
  if (
    resolve(current.cwd) !== resolve(repositoryRoot) ||
    current.nonce !== nonce
  )
    throw new Error("The verification lease does not match this fixture run.");
  if (
    (await processStartTime(current.owner.pid)) !==
    current.owner.processStartTime
  ) {
    throw new Error("The verification lease owner is no longer live.");
  }
  return {
    path,
    record: current,
    async release() {
      return false;
    },
  };
}

export async function readWorktreeLease(repositoryRoot: string) {
  return readLease(
    join(runDirectory(repositoryRoot), "worktree-operation.json")
  );
}

/**
 * Removes a development lease only when the caller has already matched its
 * complete recorded identity. Stale recovery calls this after its owned
 * processes and exact Compose project have both stopped.
 */
export async function releaseMatchingWorktreeLease(
  repositoryRoot: string,
  expected: WorktreeLeaseRecord
) {
  const path = join(runDirectory(repositoryRoot), "worktree-operation.json");
  const current = await readLease(path);
  if (
    current?.operation !== expected.operation ||
    current.nonce !== expected.nonce ||
    current.owner.pid !== expected.owner.pid ||
    current.owner.processStartTime !== expected.owner.processStartTime ||
    resolve(current.cwd) !== resolve(repositoryRoot)
  )
    return false;
  await rm(path, { force: true });
  return true;
}

async function createLease(path: string, record: WorktreeLeaseRecord) {
  const handle = await open(path, "wx", 0o600);
  await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
  await handle.close();
  return {
    path,
    record,
    async release() {
      const current = await readLease(path);
      if (
        current?.nonce !== record.nonce ||
        current.owner.pid !== record.owner.pid ||
        current.owner.processStartTime !== record.owner.processStartTime
      )
        return false;
      await rm(path, { force: true });
      return true;
    },
  };
}

async function readLease(path: string) {
  try {
    return leaseSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}
