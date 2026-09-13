import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, rename } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export type LaneStatus =
  | "passed"
  | "failed"
  | "flaky"
  | "blocked"
  | "incomplete"
  | "cancelled";

export interface ArtifactReceipt {
  path: string;
  sha256: string;
  bytes: number;
}

export interface VerificationReceipt<TLane> {
  schemaVersion: 1;
  runId: string;
  mode: "full" | "quick" | "lane";
  coverage: "complete" | "complete-fallback" | "partial";
  status:
    | "running"
    | "passed"
    | "failed"
    | "flaky"
    | "blocked"
    | "incomplete"
    | "stale"
    | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  repositoryRoot: string;
  baseSha: string | null;
  headSha: string;
  sourceFingerprint: string;
  sourceChangedPaths: string[];
  excludedInputs: string[];
  toolchain: {
    node: string;
    packageManager: string;
    platform: string;
    architecture: string;
  };
  inputDigests: Record<string, string>;
  selectedLanes: string[];
  environmentProfile: string;
  lanes: Record<string, TLane>;
  sourceFingerprintAtEnd?: string;
  worktreeLease?: "released" | "release-failed";
  error?: string;
}

export async function initializeReceiptDirectory(
  repositoryRoot: string,
  runId: string
) {
  const eveRoot = join(repositoryRoot, ".eve");
  await ensureDirectory(eveRoot, 0o700, false);
  const root = join(eveRoot, "verify");
  await ensureDirectory(root, 0o700, true);
  const runRoot = join(root, runId);
  await mkdir(runRoot, { mode: 0o700 });
  await chmod(runRoot, 0o700);
  const receiptPath = join(runRoot, "receipt.json");
  return { root, runRoot, receiptPath };
}

export async function writeReceipt<TLane>(
  path: string,
  receipt: VerificationReceipt<TLane>
) {
  if (!(await isSafeDirectoryChain(dirname(path)))) {
    throw new Error(
      "Verification receipt directory is not a private directory."
    );
  }
  const temporaryPath = path + ".tmp";
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(receipt, null, 2) + "\n", "utf8");
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
}

async function ensureDirectory(
  path: string,
  mode: number,
  enforceMode: boolean
) {
  const metadata = await lstat(path).catch(ignoreMissingPath);
  if (metadata === undefined) {
    await mkdir(path, { mode });
    return;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Verification output path is not a safe directory.");
  }
  if (enforceMode) await chmod(path, mode);
}

export async function describeArtifact(
  repositoryRoot: string,
  path: string
): Promise<ArtifactReceipt | undefined> {
  const absolutePath = join(repositoryRoot, path);
  const metadata = await lstat(absolutePath).catch(ignoreMissingPath);
  if (metadata === undefined) return undefined;
  if (metadata.isSymbolicLink()) return undefined;
  if (metadata.isFile()) {
    const contents = await readNoFollow(absolutePath);
    if (contents === undefined) return undefined;
    return {
      path,
      sha256: createHash("sha256").update(contents).digest("hex"),
      bytes: metadata.size,
    };
  }
  if (!metadata.isDirectory()) return undefined;

  const hash = createHash("sha256");
  let bytes = 0;
  for (const file of await filesBelow(absolutePath)) {
    const childPath = relative(repositoryRoot, file).replaceAll("\\", "/");
    // oxlint-disable-next-line eslint/no-await-in-loop -- Read and hash artifacts in sorted order into one stateful digest.
    const childMetadata = await lstat(file);
    if (!childMetadata.isFile()) continue;
    hash.update(childPath + "\0");
    // oxlint-disable-next-line eslint/no-await-in-loop -- Read and hash artifacts in sorted order into one stateful digest.
    const contents = await readNoFollow(file);
    if (contents === undefined) continue;
    hash.update(contents);
    bytes += childMetadata.size;
  }
  return { path, sha256: hash.digest("hex"), bytes };
}

async function readNoFollow(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) return undefined;
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function isSafeDirectoryChain(path: string) {
  const absolutePath = resolve(path);
  const components = absolutePath.split(sep).filter(Boolean);
  let current = absolutePath.startsWith(sep) ? sep : "";
  for (const component of components) {
    current = join(current, component);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Check each path component before advancing so symlinked parents are rejected.
    const metadata = await lstat(current).catch(ignoreMissingPath);
    if (
      metadata === undefined ||
      !metadata.isDirectory() ||
      metadata.isSymbolicLink()
    ) {
      return false;
    }
  }
  return true;
}

export async function describeArtifacts(
  repositoryRoot: string,
  paths: readonly string[]
) {
  const results: ArtifactReceipt[] = [];
  for (const path of new Set(paths)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve stable bounded artifact collection in listed path order.
    const artifact = await describeArtifact(repositoryRoot, path);
    if (artifact !== undefined) results.push(artifact);
  }
  return results.toSorted((left, right) => left.path.localeCompare(right.path));
}

export async function assertReceiptPathIgnored(repositoryRoot: string) {
  try {
    await execFileAsync(
      "git",
      ["check-ignore", "-q", ".eve/verify/probe.json"],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
  } catch {
    throw new Error(
      ".eve/verify is not ignored by Git; refusing to write receipts."
    );
  }
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) return [];
      if (entry.isDirectory()) return filesBelow(path);
      return entry.isFile() ? [path] : [];
    })
  );
  return children.flat().toSorted();
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Node may throw any value; only this checked ENOENT shape is accepted as absence.
function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Node may throw any value; only the checked ENOENT shape becomes an absent path.
function ignoreMissingPath(error: unknown) {
  if (isNotFound(error)) return undefined;
  throw error;
}
