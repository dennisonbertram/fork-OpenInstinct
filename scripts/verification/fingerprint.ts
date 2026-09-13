import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export interface SourceFingerprint {
  digest: string;
  headSha: string;
  changedPaths: string[];
  unsafeInputs: string[];
}

export async function getRepositoryRoot(cwd: string) {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--show-toplevel"],
    {
      cwd,
      encoding: "utf8",
    }
  );
  return resolve(stdout.trim());
}

async function getHeadSha(repositoryRoot: string) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return stdout.trim();
}

export async function resolveCommit(repositoryRoot: string, input: string) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(input)) {
    throw new Error("--base must be a full commit SHA.");
  }
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--verify", `${input}^{commit}`],
    { cwd: repositoryRoot, encoding: "utf8" }
  );
  return stdout.trim();
}

export async function assertAncestor(repositoryRoot: string, baseSha: string) {
  await execFileAsync("git", ["merge-base", "--is-ancestor", baseSha, "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

export async function collectChangedPaths(
  repositoryRoot: string,
  baseSha: string
) {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", "--find-renames", "-z", baseSha, "--"],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  const changed = parseNameStatus(stdout.toString("utf8"));
  const untrackedOutput = await execFileAsync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  for (const path of untrackedOutput.stdout.toString("utf8").split("\0")) {
    if (path) changed.add(normalizePath(path));
  }
  return [...changed].toSorted();
}

export async function fingerprintSource(
  repositoryRoot: string
): Promise<SourceFingerprint> {
  const headSha = await getHeadSha(repositoryRoot);
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", "--find-renames", "-z", "HEAD", "--"],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  const changedPaths = parseNameStatus(stdout.toString("utf8"));
  const untracked = await execFileAsync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );
  for (const path of untracked.stdout.toString("utf8").split("\0")) {
    if (path) changedPaths.add(normalizePath(path));
  }

  const hash = createHash("sha256");
  hash.update(`head\0${headSha}\0`);
  const unsafeInputs: string[] = [];
  for (const path of [...changedPaths].toSorted()) {
    hash.update(`path\0${path}\0`);
    if (isPrivateEnvironmentFile(path)) {
      unsafeInputs.push(path);
      hash.update("environment-file-content-excluded\0");
      continue;
    }
    if (isPrivateTracePath(path)) {
      unsafeInputs.push(path);
      hash.update("private-trace-content-excluded\0");
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Hash each path in sorted order into one stateful digest.
    await hashCurrentPath(hash, repositoryRoot, path);
  }
  return {
    digest: hash.digest("hex"),
    headSha,
    changedPaths: [...changedPaths].toSorted(),
    unsafeInputs,
  };
}

export async function digestFile(repositoryRoot: string, path: string) {
  try {
    const contents = await readFile(join(repositoryRoot, path));
    return createHash("sha256").update(contents).digest("hex");
  } catch {
    return "not-applicable";
  }
}

function parseNameStatus(source: string) {
  const fields = source.split("\0");
  const paths = new Set<string>();
  for (let index = 0; index < fields.length;) {
    const status = fields[index];
    if (!status) break;
    index += 1;
    const pathCount = /^[RC]/u.test(status) ? 2 : 1;
    for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
      const path = fields[index];
      if (path) paths.add(normalizePath(path));
      index += 1;
    }
  }
  return paths;
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function isPrivateEnvironmentFile(path: string) {
  return /(?:^|\/)\.env(?:$|\.(?!example(?:$|\.)))/iu.test(path);
}

function isPrivateTracePath(path: string) {
  return (
    path.startsWith(".eve/") ||
    path.startsWith("playwright-report/") ||
    path.startsWith("test-results/") ||
    /(?:^|\/)[^/]*\.(?:trace|trace\.zip|har)$/iu.test(path)
  );
}

async function hashCurrentPath(
  hash: ReturnType<typeof createHash>,
  repositoryRoot: string,
  path: string
) {
  const absolutePath = join(repositoryRoot, path);
  try {
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      const resolvedTarget = resolve(dirname(absolutePath), target);
      const targetRelative = relative(repositoryRoot, resolvedTarget);
      if (
        targetRelative.startsWith(`..${sep}`) ||
        targetRelative === ".." ||
        relative(repositoryRoot, resolvedTarget).startsWith(sep)
      ) {
        throw new Error(
          "Changed source contains a symlink outside the worktree."
        );
      }
      hash.update(`symlink\0${String(metadata.mode & 0o777)}\0${target}\0`);
      return;
    }
    if (metadata.isFile()) {
      hash.update(
        `file\0${String(metadata.mode & 0o777)}\0${String(metadata.size)}\0`
      );
      hash.update(await readFile(absolutePath));
      return;
    }
    hash.update(`non-file\0${String(metadata.mode & 0o777)}\0`);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["rev-parse", `HEAD:${path}`],
          { cwd: repositoryRoot, encoding: "utf8" }
        );
        hash.update(`deleted-blob\0${stdout.trim()}\0`);
      } catch {
        hash.update("deleted-untracked\0");
      }
      return;
    }
    throw error;
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Node may throw any value; only a checked ENOENT code affects fingerprint selection.
function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
