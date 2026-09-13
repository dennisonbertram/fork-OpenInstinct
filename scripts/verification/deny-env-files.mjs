/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/no-unsafe-argument, typescript/restrict-template-expressions -- This preloaded instrumentation deliberately replaces Node's overload-rich mutable fs compatibility surface; focused contract tests cover every guarded form. */
/*
 * This preload intentionally replaces overload-rich Node `fs` exports before a
 * verification child starts. Node supplies the untyped overload arguments; the
 * focused contract test exercises synchronous, callback, promise, stream, and
 * existence paths. The guard never forwards a protected path to an original API.
 */
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// oxlint-disable-next-line eslint/no-restricted-properties -- This preloaded guard reads only its verification-root selector and never caller credentials.
const repositoryRoot = process.env.VERIFY_REPO_ROOT;

function isProtectedPath(value) {
  if (repositoryRoot === undefined) return false;
  let candidate;
  try {
    candidate = path.resolve(
      value instanceof URL ? fileURLToPath(value) : String(value)
    );
  } catch {
    return false;
  }
  const relative = path.relative(path.resolve(repositoryRoot), candidate);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return false;
  }
  return /(?:^|\/)\.env(?:$|\.(?!example(?:$|\.)))/iu.test(relative);
}

function missingEnvironmentFile(value) {
  if (!isProtectedPath(value)) return;
  const error = new Error(
    "Verification does not load repository environment files."
  );
  error.code = "ENOENT";
  error.path = String(value);
  throw error;
}

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function guardedReadFileSync(file, ...args) {
  missingEnvironmentFile(file);
  return originalReadFileSync.call(this, file, ...args);
};

const originalOpenSync = fs.openSync;
fs.openSync = function guardedOpenSync(file, ...args) {
  missingEnvironmentFile(file);
  return originalOpenSync.call(this, file, ...args);
};

const originalCreateReadStream = fs.createReadStream;
fs.createReadStream = function guardedCreateReadStream(file, ...args) {
  missingEnvironmentFile(file);
  return originalCreateReadStream.call(this, file, ...args);
};

const originalStatSync = fs.statSync;
fs.statSync = function guardedStatSync(file, ...args) {
  if (isProtectedPath(file) && args[0]?.throwIfNoEntry === false) {
    return undefined;
  }
  missingEnvironmentFile(file);
  return originalStatSync.call(this, file, ...args);
};

const originalExistsSync = fs.existsSync;
fs.existsSync = function guardedExistsSync(file) {
  if (isProtectedPath(file)) return false;
  return originalExistsSync.call(this, file);
};

const originalReadFile = fs.readFile;
fs.readFile = function guardedReadFile(file, ...args) {
  try {
    missingEnvironmentFile(file);
  } catch (error) {
    const callback = args.at(-1);
    if (callback instanceof Function) {
      queueMicrotask(() => callback(error));
      return undefined;
    }
    throw error;
  }
  return originalReadFile.call(this, file, ...args);
};

const originalOpen = fs.open;
fs.open = function guardedOpen(file, ...args) {
  try {
    missingEnvironmentFile(file);
  } catch (error) {
    const callback = args.at(-1);
    if (callback instanceof Function) {
      queueMicrotask(() => callback(error));
      return undefined;
    }
    throw error;
  }
  return originalOpen.call(this, file, ...args);
};

const originalStat = fs.stat;
fs.stat = function guardedStat(file, ...args) {
  try {
    missingEnvironmentFile(file);
  } catch (error) {
    const callback = args.at(-1);
    if (callback instanceof Function) {
      queueMicrotask(() => callback(error));
      return undefined;
    }
    throw error;
  }
  return originalStat.call(this, file, ...args);
};

const originalReadFilePromise = fs.promises.readFile.bind(fs.promises);
fs.promises.readFile = async (file, ...args) => {
  missingEnvironmentFile(file);
  return originalReadFilePromise(file, ...args);
};

const originalOpenPromise = fs.promises.open.bind(fs.promises);
fs.promises.open = async (file, ...args) => {
  missingEnvironmentFile(file);
  return originalOpenPromise(file, ...args);
};

const originalStatPromise = fs.promises.stat.bind(fs.promises);
fs.promises.stat = async (file, ...args) => {
  missingEnvironmentFile(file);
  return originalStatPromise(file, ...args);
};

syncBuiltinESMExports();
