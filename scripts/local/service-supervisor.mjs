import { spawn } from "node:child_process";

const separator = process.argv.indexOf("--");
const values = new Map();
for (let index = 2; index < separator; index += 2)
  values.set(process.argv[index], process.argv[index + 1]);
const command = process.argv[separator + 1];
const args = process.argv.slice(separator + 2);
const parentPid = Number(values.get("--parent-pid"));
const shutdownGrace = 5_000;

if (
  !Number.isSafeInteger(parentPid) ||
  parentPid <= 0 ||
  command === undefined ||
  values.get("--run-nonce") === undefined ||
  values.get("--repository-root") === undefined
) {
  throw new Error("Invalid local service supervisor arguments.");
}

const child = spawn(command, args, {
  detached: process.platform !== "win32",
  stdio: "inherit",
});
let forceStopTimer;

function stopChild(signal) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && error.code === "ESRCH")) throw error;
  }
}

function beginShutdown(signal) {
  stopChild(signal);
  if (forceStopTimer === undefined && signal !== "SIGKILL") {
    forceStopTimer = setTimeout(() => stopChild("SIGKILL"), shutdownGrace);
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => beginShutdown(signal));
}

const parentWatch = setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    beginShutdown("SIGTERM");
  }
}, 250);

child.once("exit", (code, signal) => {
  clearInterval(parentWatch);
  if (forceStopTimer !== undefined) clearTimeout(forceStopTimer);
  process.exitCode = code ?? (signal === "SIGTERM" ? 143 : 1);
});
