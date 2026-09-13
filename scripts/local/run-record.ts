import { randomBytes } from "node:crypto";
import {
  open,
  mkdir,
  realpath,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
  rename,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";

export const DEV_RUN_SCHEMA_VERSION = 1;

export type DevProfile = "connected" | "fixture";

export interface DevRunProcess {
  readonly pid: number;
  readonly processStartTime: string;
  readonly processGroup: number;
}

export interface DevRunRecord {
  readonly schemaVersion: typeof DEV_RUN_SCHEMA_VERSION;
  readonly runId: string;
  readonly nonce: string;
  readonly leaseNonce: string;
  readonly profile: DevProfile;
  readonly cwd: string;
  readonly baseSha: string | null;
  readonly startedAt: string;
  readonly owner: DevRunProcess;
  readonly composeProject: string;
  readonly volume: string;
  readonly ports: { readonly app: number; readonly marketing: number };
  readonly origins: { readonly app: string; readonly marketing: string };
  readonly children: Partial<
    Record<"agentation" | "app" | "marketing", DevRunProcess>
  >;
  readonly readiness: Record<
    string,
    "pending" | "ready" | "failed" | "simulated" | "external"
  >;
}

const processSchema = z.object({
  pid: z.number().int().positive(),
  processStartTime: z.string().min(1),
  processGroup: z.number().int().positive(),
});
const runRecordSchema = z.object({
  schemaVersion: z.literal(DEV_RUN_SCHEMA_VERSION),
  runId: z.string(),
  nonce: z.string(),
  leaseNonce: z.string(),
  profile: z.enum(["connected", "fixture"]),
  cwd: z.string(),
  baseSha: z.string().nullable(),
  startedAt: z.string(),
  owner: processSchema,
  composeProject: z.string(),
  volume: z.string(),
  ports: z.object({ app: z.number().int(), marketing: z.number().int() }),
  origins: z.object({ app: z.string(), marketing: z.string() }),
  children: z.object({
    agentation: processSchema.optional(),
    app: processSchema.optional(),
    marketing: processSchema.optional(),
  }),
  readiness: z.record(
    z.string(),
    z.enum(["pending", "ready", "failed", "simulated", "external"])
  ),
});

const execFileAsync = promisify(execFile);

export function runDirectory(repositoryRoot: string) {
  return join(repositoryRoot, ".eve", "dev-runs");
}

export function createRunId(requested?: string) {
  if (requested !== undefined && /^[a-z0-9][a-z0-9-]{0,47}$/u.test(requested)) {
    return requested;
  }
  return randomBytes(12).toString("hex");
}

export async function processStartTime(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  if (process.platform === "linux") {
    try {
      const contents = await readFile(`/proc/${String(pid)}/stat`, "utf8");
      const afterCommand = contents.lastIndexOf(") ");
      const fields = contents
        .slice(afterCommand + 2)
        .trim()
        .split(/\s+/u);
      const bootId = (
        await readFile("/proc/sys/kernel/random/boot_id", "utf8")
      ).trim();
      return fields[19] === undefined || bootId.length === 0
        ? undefined
        : `linux:${bootId}:${fields[19]}`;
    } catch {
      return undefined;
    }
  }
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("/bin/ps", [
        "-o",
        "lstart=",
        "-p",
        String(pid),
      ]);
      const value = stdout.trim();
      return value.length === 0 ? undefined : `darwin:${value}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function ensureRunDirectory(repositoryRoot: string) {
  const directory = runDirectory(repositoryRoot);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmodIfNeeded(directory, 0o700);
  return directory;
}

export async function createRunRecord(
  repositoryRoot: string,
  record: DevRunRecord
) {
  const directory = await ensureRunDirectory(repositoryRoot);
  const path = join(directory, `run-${record.runId}.json`);
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(record, undefined, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  return path;
}

export async function updateRunRecord(path: string, record: DevRunRecord) {
  const temporaryPath = join(
    dirname(path),
    `.${record.runId}.${randomBytes(8).toString("hex")}.tmp`
  );
  await writeFile(temporaryPath, `${JSON.stringify(record, undefined, 2)}\n`, {
    mode: 0o600,
  });
  await chmodIfNeeded(temporaryPath, 0o600);
  await rename(temporaryPath, path);
}

export async function deleteRunRecord(path: string) {
  await rm(path, { force: true });
}

export async function listRunRecords(repositoryRoot: string) {
  const directory = runDirectory(repositoryRoot);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && isNotFound(error)) return [];
    throw error;
  }
  const records = await Promise.all(
    entries
      .filter((entry) => /^run-[a-z0-9][a-z0-9-]{0,47}\.json$/u.test(entry))
      .map(async (entry) => {
        const path = join(directory, entry);
        return { path, record: parseRunRecord(await readFile(path, "utf8")) };
      })
  );
  return records;
}

export async function isVerifiedRunOwner(
  record: DevRunRecord,
  repositoryRoot: string
) {
  if (resolve(record.cwd) !== resolve(repositoryRoot)) return false;
  if (
    (await processStartTime(record.owner.pid)) !== record.owner.processStartTime
  )
    return false;
  return processCommandIncludes(record.owner.pid, [
    "--run-nonce",
    record.nonce,
  ]);
}

async function processCommandIncludes(
  pid: number,
  expected: readonly string[]
) {
  const command = await processCommand(pid);
  return (
    command !== undefined && expected.every((value) => command.includes(value))
  );
}

async function processCommandOptionResolvesTo(
  pid: number,
  option: string,
  expected: string
) {
  const command = await processCommand(pid);
  const optionIndex = command?.indexOf(option) ?? -1;
  const value = optionIndex >= 0 ? command?.[optionIndex + 1] : undefined;
  return value !== undefined && (await samePath(value, expected));
}

async function samePath(left: string, right: string) {
  try {
    return (await realpath(left)) === (await realpath(right));
  } catch {
    return resolve(left) === resolve(right);
  }
}

async function processCommand(pid: number) {
  try {
    return process.platform === "linux"
      ? (await readFile(`/proc/${String(pid)}/cmdline`, "utf8")).split("\0")
      : (
          await execFileAsync("/bin/ps", ["-o", "command=", "-p", String(pid)])
        ).stdout
          .trim()
          .split(/\s+/u);
  } catch {
    return undefined;
  }
}

export async function isVerifiedProcess(process: DevRunProcess, nonce: string) {
  return (
    /^[a-f0-9]{48}$/u.test(nonce) &&
    Number.isSafeInteger(process.processGroup) &&
    process.processGroup > 0 &&
    (await processStartTime(process.pid)) === process.processStartTime
  );
}

export async function isVerifiedRunChild(
  record: DevRunRecord,
  child: DevRunProcess,
  repositoryRoot: string
) {
  return (
    (await isVerifiedProcess(child, record.nonce)) &&
    (await processCommandIncludes(child.pid, ["--run-nonce", record.nonce])) &&
    (await processCommandOptionResolvesTo(
      child.pid,
      "--repository-root",
      repositoryRoot
    ))
  );
}

function parseRunRecord(source: string): DevRunRecord {
  try {
    return runRecordSchema.parse(JSON.parse(source));
  } catch {
    throw new Error("Invalid local development run record.");
  }
}

async function chmodIfNeeded(path: string, mode: number) {
  const current = await stat(path);
  if ((current.mode & 0o777) !== mode) {
    const { chmod } = await import("node:fs/promises");
    await chmod(path, mode);
  }
}

function isNotFound(error: Error) {
  return "code" in error && error.code === "ENOENT";
}
