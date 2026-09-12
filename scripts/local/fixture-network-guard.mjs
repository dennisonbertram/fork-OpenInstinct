/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/restrict-template-expressions, anti-slop/no-runtime-typeof -- This preload replaces Node's mutable overload-rich fs, HTTP, socket, TLS, and fetch compatibility surfaces before fixture code starts. It validates environment-file paths and host inputs before forwarding every guarded call; focused subprocess tests cover the supported overloads. */
/*
 * The fixture guard is intentionally a Node preload rather than application
 * code. Node supplies overloaded, untyped arguments to these patched APIs.
 * Guard decisions occur before each original API call so a fixture cannot load
 * repository env files or resolve an external host.
 */

import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import path from "node:path";

// oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- The preload reads only its fixture-root selector and never application credentials.
const fixtureRepositoryRoot = process.env.DEV_FIXTURE_REPOSITORY_ROOT;
const protectedEnvironmentFiles = new Set(
  ["", "apps/marketing"].flatMap((directory) =>
    [".env", ".env.local", ".env.development", ".env.development.local"].map(
      (file) => path.resolve(fixtureRepositoryRoot ?? ".", directory, file)
    )
  )
);

function isProtectedEnvironmentFile(value) {
  const pathValue =
    value instanceof URL
      ? value.pathname
      : Buffer.isBuffer(value)
        ? value.toString()
        : value;
  return (
    typeof pathValue === "string" &&
    fixtureRepositoryRoot !== undefined &&
    protectedEnvironmentFiles.has(path.resolve(pathValue))
  );
}

function rejectEnvironmentFile(value) {
  if (isProtectedEnvironmentFile(value)) {
    const error = new Error(
      "Fixture runtime does not load repository environment files."
    );
    error.code = "ENOENT";
    throw error;
  }
}

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function guardedReadFileSync(value, ...args) {
  rejectEnvironmentFile(value);
  return originalReadFileSync.call(this, value, ...args);
};

const originalReadFile = fs.readFile;
fs.readFile = function guardedReadFile(value, ...args) {
  try {
    rejectEnvironmentFile(value);
  } catch (error) {
    const callback = args.at(-1);
    if (typeof callback === "function") {
      queueMicrotask(() => callback(error));
      return undefined;
    }
    throw error;
  }
  return originalReadFile.call(this, value, ...args);
};

const originalPromiseReadFile = fs.promises.readFile;
fs.promises.readFile = async function guardedPromiseReadFile(value, ...args) {
  rejectEnvironmentFile(value);
  return originalPromiseReadFile.call(this, value, ...args);
};

function hostnameFrom(options) {
  if (typeof options === "string") return new URL(options).hostname;
  if (options instanceof URL) return options.hostname;
  if (typeof Request !== "undefined" && options instanceof Request) {
    return new URL(options.url).hostname;
  }
  if (typeof options === "object" && options !== null) {
    return options.hostname ?? options.host?.split(":")[0];
  }
  return undefined;
}

function hostnameFromConnectArguments(args) {
  const [first, second] = Array.isArray(args[0]) ? args[0] : args;
  if (typeof first === "number")
    return typeof second === "string" ? second : undefined;
  if (typeof first === "string") return first;
  return hostnameFrom(first);
}

function isLoopback(hostname) {
  return (
    hostname === undefined ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function rejectExternal(options) {
  const hostname = hostnameFrom(options);
  if (!isLoopback(hostname)) {
    throw new Error(
      `Fixture runtime blocked external network access to ${hostname ?? "unknown host"}.`
    );
  }
}

for (const client of [http, https]) {
  const originalRequest = client.request;
  client.request = function guardedRequest(options, ...args) {
    rejectExternal(options);
    return originalRequest.call(this, options, ...args);
  };
  const originalGet = client.get;
  client.get = function guardedGet(options, ...args) {
    rejectExternal(options);
    return originalGet.call(this, options, ...args);
  };
}

const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedSocketConnect(...args) {
  const hostname = hostnameFromConnectArguments(args);
  if (!isLoopback(hostname)) {
    throw new Error(
      `Fixture runtime blocked external network access to ${hostname ?? "unknown host"}.`
    );
  }
  return originalSocketConnect.call(this, ...args);
};

const originalConnect = net.connect;
function guardedConnect(...args) {
  const hostname = hostnameFromConnectArguments(args);
  if (!isLoopback(hostname)) {
    throw new Error(
      `Fixture runtime blocked external network access to ${hostname ?? "unknown host"}.`
    );
  }
  return originalConnect.call(net, ...args);
}
net.connect = guardedConnect;
net.createConnection = guardedConnect;

const originalTlsConnect = tls.connect;
tls.connect = function guardedTlsConnect(...args) {
  const hostname = hostnameFromConnectArguments(args);
  if (!isLoopback(hostname)) {
    throw new Error(
      `Fixture runtime blocked external network access to ${hostname ?? "unknown host"}.`
    );
  }
  return originalTlsConnect.call(tls, ...args);
};

const originalFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input, init) {
  rejectExternal(input);
  return originalFetch.call(this, input, init);
};
