import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createRunId,
  createRunRecord,
  deleteRunRecord,
  DEV_RUN_SCHEMA_VERSION,
  isVerifiedProcess,
  isVerifiedRunChild,
  isVerifiedRunOwner,
  listRunRecords,
  processStartTime,
  type DevProfile,
  type DevRunProcess,
  type DevRunRecord,
  updateRunRecord,
} from "./local/run-record.ts";
import {
  acquireWorktreeLease,
  readWorktreeLease,
  releaseMatchingWorktreeLease,
  reuseVerificationLease,
} from "./local/worktree-lease.ts";

const repositoryRoot = realpathSync(
  resolvePath(fileURLToPath(new URL("..", import.meta.url)))
);
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
const shutdownTimeout = 8_000;
const agentationOrigin = "http://127.0.0.1:4747";
const fixtureAdministratorPhone = "+12025550123";
const executeFile = promisify(execFile);
let activeCommand: ChildProcess | undefined;
let readinessAbort: AbortController | undefined;
let shutdownSignal: NodeJS.Signals | undefined;

type ServiceName = "agentation" | "app" | "marketing";
interface RunningService {
  readonly name: ServiceName;
  readonly child: ChildProcess;
  readonly process: DevRunProcess;
}

class LifecycleError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) {
    super(`${stage}: ${message}`);
    this.stage = stage;
  }
}

class LifecycleInterrupted extends Error {}

function argumentsForRun() {
  const environmentProfile = process.env.DEV_PROFILE;
  if (
    environmentProfile !== undefined &&
    environmentProfile !== "connected" &&
    environmentProfile !== "fixture"
  )
    throw new LifecycleError(
      "arguments",
      "DEV_PROFILE must be connected or fixture."
    );
  let profile: DevProfile | undefined = environmentProfile;
  let control: "start" | "status" | "stop" = "start";
  let runNonce: string | undefined;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--profile") {
      const value = process.argv[index + 1];
      if (value !== "connected" && value !== "fixture")
        throw new LifecycleError(
          "arguments",
          "--profile must be connected or fixture."
        );
      profile = value;
      index += 1;
    } else if (argument === "--run-nonce") {
      const value = process.argv[index + 1];
      if (
        process.env.DEV_INTERNAL_SUPERVISOR !== "1" ||
        value === undefined ||
        !/^[a-f0-9]{48}$/u.test(value)
      )
        throw new LifecycleError(
          "arguments",
          "Internal supervisor nonce is invalid."
        );
      runNonce = value;
      index += 1;
    } else if (argument === "--status" || argument === "--stop") {
      if (control !== "start")
        throw new LifecycleError(
          "arguments",
          "Use only one lifecycle control flag."
        );
      control = argument === "--status" ? "status" : "stop";
    } else
      throw new LifecycleError(
        "arguments",
        `Unknown option: ${argument ?? "(missing)"}`
      );
  }
  if (control !== "start" && profile !== undefined)
    throw new LifecycleError(
      "arguments",
      "A profile cannot be combined with --status or --stop."
    );
  const selectedProfile: DevProfile =
    profile === "fixture" ? "fixture" : "connected";
  return {
    control,
    profile: selectedProfile,
    runNonce,
  };
}

const stableProject = () =>
  `open-instinct-${createHash("sha256").update(`${repositoryRoot}/`).digest("hex").slice(0, 12)}`;
const fixtureProject = (runId: string) =>
  `open-instinct-fixture-${createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 8)}-${createHash("sha256").update(runId).digest("hex").slice(0, 12)}`;
const compose = (project: string, ...args: string[]) => [
  "compose",
  "--project-name",
  project,
  ...args,
];
const origin = (port: number) => `http://127.0.0.1:${String(port)}`;

function requestedPort(name: "PORT" | "MARKETING_PORT") {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new LifecycleError("preflight", `${name} must be a TCP port.`);
  return port;
}

async function freePort(port: number) {
  return (
    await Promise.all(
      ["127.0.0.1", "::1", "0.0.0.0", "::"].map((host) =>
        freePortOnHost(port, host)
      )
    )
  ).every(Boolean);
}

async function freePortOnHost(port: number, host: string) {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port }, resolve);
    });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "EAFNOSUPPORT" || error.code === "EADDRNOTAVAIL")
    )
      return true;
    return false;
  } finally {
    if (server.listening)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
  }
}

async function choosePort(
  defaultPort: number,
  requested: number | undefined,
  service: string
) {
  if (requested !== undefined) {
    if (!(await freePort(requested)))
      throw new LifecycleError(
        "preflight",
        `${service} port ${String(requested)} is already in use.`
      );
    return requested;
  }
  if (await freePort(defaultPort)) return defaultPort;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createServer();
    // oxlint-disable-next-line no-await-in-loop -- Each candidate socket must close before the next allocation attempt.
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port: 0 }, resolve);
    });
    const address = server.address();
    // oxlint-disable-next-line no-await-in-loop -- The candidate port cannot be reused until this probe socket has closed.
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    if (
      address !== null &&
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Node returns this documented string-or-address union for a listening socket.
      typeof address !== "string" &&
      // oxlint-disable-next-line no-await-in-loop -- Recheck this candidate across the required bind families before selecting it.
      (await freePort(address.port))
    ) {
      console.log(
        `${service} default port ${String(defaultPort)} is occupied; selected ${String(address.port)}.`
      );
      return address.port;
    }
  }
  throw new LifecycleError(
    "preflight",
    "Could not select a free loopback port."
  );
}

function fixtureEnvironment(
  appOrigin: string,
  databaseUrl: string
): NodeJS.ProcessEnv {
  const guard = join(
    repositoryRoot,
    "scripts",
    "local",
    "fixture-network-guard.mjs"
  );
  const sendblueUiFixture = process.env.DEV_FIXTURE_SCENARIO === "sendblue-ui";
  const environment: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    TERM: process.env.TERM,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    NODE_ENV: "development",
    EVAL_CONTRACT_FIXTURE: sendblueUiFixture ? "0" : "1",
    KERNEL_API_KEY: "fixture-kernel-key",
    ADMIN_PHONE_NUMBERS: fixtureAdministratorPhone,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
    BETTER_AUTH_URL: appOrigin,
    WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
    DEV_FIXTURE_REPOSITORY_ROOT: repositoryRoot,
    NODE_OPTIONS: `--import=${guard}`,
  };
  if (sendblueUiFixture) Object.assign(environment, sendblueUiEnvironment());
  return environment;
}

function sendblueUiEnvironment() {
  return {
    VERCEL_ENV: "preview",
    BETTER_AUTH_SECRET: "e2e-better-auth-secret-for-playwright-sendblue-tests",
    SECRET_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    PHONE_OTP_PROVIDER: "sendblue",
    SENDBLUE_API_KEY_ID: "fixture-sendblue-key-id",
    SENDBLUE_API_SECRET_KEY: "fixture-sendblue-secret-key",
    SENDBLUE_FROM_NUMBER: "+12025550199",
  } satisfies Record<string, string>;
}

function connectedEnvironment(
  appOrigin: string,
  databaseUrl: string
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED: databaseUrl,
    BETTER_AUTH_URL: appOrigin,
  };
}

function migrationEnvironment(environment: NodeJS.ProcessEnv) {
  const testExit = process.env.DEV_MIGRATE_EXIT;
  if (testExit === undefined || !/^\d{1,3}$/u.test(testExit))
    return environment;
  // This narrow test-double control is passed to migrations only; fixture
  // services continue to receive the normal allowlisted environment.
  return { ...environment, DEV_MIGRATE_EXIT: testExit };
}

function requireKernel() {
  if (process.env.KERNEL_API_KEY?.trim()) return;
  throw new LifecycleError(
    "preflight",
    "KERNEL_API_KEY is required for connected local development. Add it to .env.local, then run ./init.sh again."
  );
}

function childExit(child: ChildProcess) {
  return new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
}

async function gitSha() {
  const child = spawn("/usr/bin/git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    env: { ...process.env, PATH: "/usr/bin:/bin" },
    stdio: "pipe",
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  if ((await childExit(child)) !== 0 || !/^[a-f0-9]{40}$/u.test(output.trim()))
    throw new LifecycleError(
      "claim",
      "Could not resolve the exact source revision."
    );
  return output.trim();
}

async function command(
  stage: string,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  output = "inherit"
) {
  const child = spawn(executable, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env,
    stdio: output === "inherit" ? "inherit" : ["ignore", "pipe", "inherit"],
  });
  activeCommand = child;
  let stdout = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  const code = await childExit(child);
  if (activeCommand === child) activeCommand = undefined;
  if (code !== 0 && shutdownSignal !== undefined)
    throw new LifecycleInterrupted();
  if (code !== 0)
    throw new LifecycleError(
      stage,
      `${executable} ${args.join(" ")} exited with ${String(code)}.`
    );
  return stdout;
}

async function boundedLog(path: string, chunk: Buffer) {
  const existing = await stat(path).catch(() => undefined);
  const remaining = 1_000_000 - (existing?.size ?? 0);
  if (remaining > 0)
    await appendFile(path, chunk.subarray(0, remaining), { mode: 0o600 });
}

async function startService(
  name: ServiceName,
  args: string[],
  env: NodeJS.ProcessEnv,
  logDirectory: string,
  nonce: string,
  onExit: (name: ServiceName, code: number | null) => void
) {
  const wrapper = join(
    repositoryRoot,
    "scripts",
    "local",
    "service-supervisor.mjs"
  );
  const child = spawn(
    process.execPath,
    [
      wrapper,
      "--repository-root",
      repositoryRoot,
      "--parent-pid",
      String(process.pid),
      "--run-nonce",
      nonce,
      "--",
      "pnpm",
      ...args,
    ],
    {
      cwd: repositoryRoot,
      detached: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  if (child.pid === undefined)
    throw new LifecycleError("services", `Could not start ${name}.`);
  const startTime = await processStartTime(child.pid);
  if (startTime === undefined)
    throw new LifecycleError(
      "services",
      `Could not establish process identity for ${name}.`
    );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      void boundedLog(join(logDirectory, `${name}.log`), chunk).catch(
        () => undefined
      );
    });
  child.once("exit", (code) => {
    onExit(name, code);
  });
  return {
    name,
    child,
    process: {
      pid: child.pid,
      processStartTime: startTime,
      processGroup: child.pid,
    },
  } satisfies RunningService;
}

async function waitHttp(
  url: string,
  stage: string,
  serviceFailure: () => string | undefined
) {
  const controller = new AbortController();
  readinessAbort = controller;
  const deadline = Date.now() + 30_000;
  let issue = "not reachable";
  try {
    while (Date.now() < deadline) {
      if (controller.signal.aborted || serviceFailure() !== undefined) {
        throw new LifecycleError(
          stage,
          serviceFailure() ?? "startup was interrupted."
        );
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Readiness probes must be ordered and abortable.
        const response = await fetch(url, {
          signal: AbortSignal.any([
            AbortSignal.timeout(800),
            controller.signal,
          ]),
        });
        if (response.ok) return;
        issue = `HTTP ${String(response.status)}`;
      } catch (error) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- An external signal can abort the fetch between dispatch and rejection.
        if (controller.signal.aborted)
          throw new LifecycleError(
            stage,
            serviceFailure() ?? "startup was interrupted."
          );
        issue = error instanceof Error ? error.message : String(error);
      }
      // oxlint-disable-next-line no-await-in-loop -- A bounded delay is required before the next readiness probe.
      await Promise.race([
        new Promise<void>((resolve) => setTimeout(resolve, 250)),
        new Promise<void>((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true }
          );
        }),
      ]);
    }
    throw new LifecycleError(
      stage,
      `readiness probe failed for ${url}: ${issue}`
    );
  } finally {
    if (readinessAbort === controller) readinessAbort = undefined;
  }
}

async function probe(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    return response.ok ? "ready" : `HTTP ${String(response.status)}`;
  } catch {
    return "unreachable";
  }
}

async function writeVerificationEvidence(record: DevRunRecord) {
  const requested = process.env.DEV_VERIFY_EVIDENCE_PATH;
  if (requested === undefined) return;
  const allowed = `${resolvePath(repositoryRoot, ".eve", "verify")}/`;
  const target = resolvePath(requested);
  if (!target.startsWith(allowed) || !target.endsWith(".json"))
    throw new LifecycleError(
      "evidence",
      "DEV_VERIFY_EVIDENCE_PATH must be a JSON file under .eve/verify/."
    );
  await mkdir(resolvePath(target, ".."), { recursive: true, mode: 0o700 });
  await writeFile(
    target,
    `${JSON.stringify({ schemaVersion: record.schemaVersion, runId: record.runId, profile: record.profile, composeProject: record.composeProject, volume: record.volume, origins: record.origins, readiness: { database: record.readiness.database, migrations: record.readiness.migrations } })}\n`,
    { mode: 0o600 }
  );
}

async function signalProcess(
  serviceProcess: DevRunProcess,
  nonce: string,
  signal: NodeJS.Signals
) {
  if (!(await isVerifiedProcess(serviceProcess, nonce))) return false;
  try {
    globalThis.process.kill(-serviceProcess.processGroup, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      try {
        globalThis.process.kill(serviceProcess.pid, signal);
        return true;
      } catch (fallbackError) {
        if (
          fallbackError instanceof Error &&
          "code" in fallbackError &&
          fallbackError.code === "ESRCH"
        )
          return true;
        throw fallbackError;
      }
    }
    throw error;
  }
}

async function exited(serviceProcess: DevRunProcess, timeout: number) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Process identity is polled sequentially until the bounded deadline.
    if ((await processStartTime(serviceProcess.pid)) === undefined) return true;
    // oxlint-disable-next-line no-await-in-loop -- The delay prevents a busy ownership poll.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return (await processStartTime(serviceProcess.pid)) === undefined;
}

async function directChildGroups(supervisor: DevRunProcess) {
  try {
    // The fixture test PATH deliberately contains only fake docker/pnpm
    // binaries. pgrep is an OS ownership probe, not a project command.
    const { stdout } = await executeFile("/usr/bin/pgrep", [
      "-P",
      String(supervisor.pid),
    ]);
    const pids = stdout
      .split(/\s+/u)
      .filter((value) => /^\d+$/u.test(value))
      .map(Number);
    return (
      await Promise.all(
        pids.map(async (pid) => {
          const startTime = await processStartTime(pid);
          return startTime === undefined
            ? undefined
            : { pid, processStartTime: startTime, processGroup: pid };
        })
      )
    ).filter((child): child is DevRunProcess => child !== undefined);
  } catch {
    return [];
  }
}

async function showStatus() {
  const records = await listRunRecords(repositoryRoot);
  if (records.length === 0) {
    console.log(
      "No active local development run record exists for this worktree."
    );
    return;
  }
  for (const { record } of records) {
    // oxlint-disable-next-line no-await-in-loop -- Each independent record is verified before it is displayed.
    const owner = await isVerifiedRunOwner(record, repositoryRoot);
    console.log(
      JSON.stringify({
        runId: record.runId,
        profile: record.profile,
        owner: owner ? "live" : "stale",
        // oxlint-disable-next-line no-await-in-loop -- Display only a liveness probe for this verified record.
        app: owner ? await probe(record.origins.app) : "stale",
        // oxlint-disable-next-line no-await-in-loop -- Display only a liveness probe for this verified record.
        marketing: owner ? await probe(record.origins.marketing) : "stale",
        composeProject: record.composeProject,
        origins: record.origins,
      })
    );
  }
}

async function stopOwned() {
  const records = await listRunRecords(repositoryRoot);
  if (records.length !== 1)
    throw new LifecycleError(
      "stop",
      records.length === 0
        ? "No active local development run record exists for this worktree."
        : "More than one run record exists; refuse to guess which run to stop."
    );
  const selected = records[0];
  if (selected === undefined)
    throw new LifecycleError(
      "stop",
      "No active local development run record exists for this worktree."
    );
  const { record } = selected;
  const lease = await readWorktreeLease(repositoryRoot);
  if (
    lease?.operation !== "development" ||
    lease.nonce !== record.leaseNonce ||
    lease.owner.pid !== record.owner.pid ||
    lease.owner.processStartTime !== record.owner.processStartTime
  ) {
    console.log(
      `Run ${record.runId} does not match the live worktree lease; nothing was signaled.`
    );
    return;
  }
  if (!(await isVerifiedRunOwner(record, repositoryRoot))) {
    const children = Object.values(record.children);
    const verifiedChildren: DevRunProcess[] = [];
    for (const child of children)
      if (await isVerifiedRunChild(record, child, repositoryRoot))
        verifiedChildren.push(child);
    const childGroups = (
      await Promise.all(verifiedChildren.map(directChildGroups))
    ).flat();
    for (const child of verifiedChildren)
      // oxlint-disable-next-line no-await-in-loop -- Signals are sent in record order and each result is checked.
      await signalProcess(child, record.nonce, "SIGTERM");
    for (const child of childGroups)
      // oxlint-disable-next-line no-await-in-loop -- These groups were observed as direct descendants of a verified service wrapper.
      await signalProcess(child, record.nonce, "SIGTERM");
    if (
      !(
        await Promise.all(
          [...verifiedChildren, ...childGroups].map((child) =>
            exited(child, 5_500)
          )
        )
      ).every(Boolean)
    ) {
      for (const child of childGroups)
        if (!(await exited(child, 0)))
          await signalProcess(child, record.nonce, "SIGKILL");
      if (
        !(
          await Promise.all(
            [...verifiedChildren, ...childGroups].map((child) =>
              exited(child, shutdownTimeout)
            )
          )
        ).every(Boolean)
      )
        throw new LifecycleError(
          "stop",
          `Run ${record.runId} has owned children that did not stop; its manifest and Compose resources were preserved.`
        );
    }
    const expectedProject =
      record.profile === "connected"
        ? stableProject()
        : fixtureProject(record.runId);
    if (
      record.composeProject !== expectedProject ||
      record.volume !== `${expectedProject}_postgres-data`
    ) {
      throw new LifecycleError(
        "stop",
        `Run ${record.runId} has an invalid recorded Compose identity; no resources were stopped.`
      );
    }
    const cleanupEnvironment =
      record.profile === "fixture"
        ? fixtureEnvironment(record.origins.app, "")
        : connectedEnvironment(record.origins.app, "");
    await command(
      "cleanup",
      "docker",
      compose(
        record.composeProject,
        "down",
        ...(record.profile === "fixture" ? ["--volumes"] : [])
      ),
      cleanupEnvironment
    );
    if (!(await releaseMatchingWorktreeLease(repositoryRoot, lease)))
      throw new LifecycleError(
        "stop",
        `Run ${record.runId} lost its exact worktree lease during recovery; its manifest was preserved.`
      );
    await deleteRunRecord(selected.path);
    console.log(
      `Recovered owned ${record.profile} resources for stale run ${record.runId}.`
    );
    return;
  }
  process.kill(record.owner.pid, "SIGTERM");
  if (!(await exited(record.owner, shutdownTimeout)))
    throw new LifecycleError(
      "stop",
      `Run ${record.runId} did not stop within ${String(shutdownTimeout)}ms.`
    );
  if (
    (await listRunRecords(repositoryRoot)).some(
      ({ record: current }) => current.runId === record.runId
    )
  ) {
    throw new LifecycleError(
      "stop",
      `Run ${record.runId} exited but did not confirm cleanup; inspect its manifest before retrying.`
    );
  }
  console.log(`Stopped owned ${record.profile} run ${record.runId}.`);
}

async function start(profile: DevProfile, nonce: string) {
  if (process.platform === "win32")
    throw new LifecycleError(
      "preflight",
      "Windows is unsupported for the local lifecycle because process-group ownership cannot be verified there."
    );
  if (profile === "connected") requireKernel();
  const delegatedNonce = process.env.DEV_VERIFY_LEASE_NONCE;
  if (delegatedNonce !== undefined && profile !== "fixture")
    throw new LifecycleError(
      "claim",
      "DEV_VERIFY_LEASE_NONCE is only valid for a fixture run."
    );
  const lease =
    delegatedNonce === undefined
      ? await acquireWorktreeLease(repositoryRoot, "development")
      : await reuseVerificationLease(repositoryRoot, delegatedNonce);
  shutdownSignal = undefined;
  try {
    const runId = createRunId(process.env.DEV_RUN_ID);
    const appPort = await choosePort(
      3000,
      requestedPort("PORT"),
      "Application"
    );
    const marketingPort = await choosePort(
      3210,
      requestedPort("MARKETING_PORT"),
      "Marketing"
    );
    if (appPort === marketingPort)
      throw new LifecycleError(
        "preflight",
        "Application and marketing ports must differ."
      );
    const existing = await listRunRecords(repositoryRoot);
    if (
      profile === "connected" &&
      (
        await Promise.all(
          existing.map(({ record }) =>
            isVerifiedRunOwner(record, repositoryRoot)
          )
        )
      ).some(Boolean)
    )
      throw new LifecycleError(
        "claim",
        "A connected local run already owns this worktree; use ./init.sh --status or --stop."
      );
    const ownerStartTime = await processStartTime(process.pid);
    if (ownerStartTime === undefined)
      throw new LifecycleError(
        "claim",
        "Could not establish supervisor process identity."
      );
    const project =
      profile === "connected" ? stableProject() : fixtureProject(runId);
    const appOrigin = origin(appPort),
      marketingOrigin = origin(marketingPort);
    const record: DevRunRecord = {
      schemaVersion: DEV_RUN_SCHEMA_VERSION,
      runId,
      nonce,
      leaseNonce: lease.record.nonce,
      profile,
      cwd: repositoryRoot,
      baseSha: await gitSha(),
      startedAt: new Date().toISOString(),
      owner: {
        pid: process.pid,
        processStartTime: ownerStartTime,
        processGroup: process.pid,
      },
      composeProject: project,
      volume: `${project}_postgres-data`,
      ports: { app: appPort, marketing: marketingPort },
      origins: { app: appOrigin, marketing: marketingOrigin },
      children: {},
      readiness: {
        database: "pending",
        migrations: "pending",
        agentation: "pending",
        app: "pending",
        eve: "pending",
        marketing: "pending",
        provider: profile === "fixture" ? "simulated" : "pending",
      },
    };
    const manifest = await createRunRecord(repositoryRoot, record);
    const logs = join(repositoryRoot, ".eve", "dev-runs", "logs", runId);
    await mkdir(logs, { recursive: true, mode: 0o700 });
    const services: RunningService[] = [];
    let terminating: NodeJS.Signals | undefined,
      serviceFailure: string | undefined,
      cleaned = false;
    const persist = () => updateRunRecord(manifest, record);
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      const failures: unknown[] = [];
      for (const service of services.toReversed())
        try {
          await signalProcess(service.process, record.nonce, "SIGTERM");
        } catch (error) {
          failures.push(error);
        }
      for (const service of services.toReversed())
        try {
          if (!(await exited(service.process, shutdownTimeout)))
            failures.push(
              new LifecycleError(
                "cleanup",
                `${service.name} did not stop after the owned supervisor grace period.`
              )
            );
        } catch (error) {
          failures.push(error);
        }
      const baseEnvironment =
        profile === "fixture"
          ? fixtureEnvironment(appOrigin, "")
          : connectedEnvironment(appOrigin, "");
      try {
        await command(
          "cleanup",
          "docker",
          compose(
            project,
            "down",
            ...(profile === "fixture" ? ["--volumes"] : [])
          ),
          baseEnvironment
        );
      } catch (error) {
        failures.push(error);
      }
      if (failures.length > 0)
        throw new LifecycleError(
          "cleanup",
          `Failed to clean up ${String(failures.length)} owned resource(s).`
        );
      await deleteRunRecord(manifest);
    };
    const signal = new Promise<NodeJS.Signals>((resolve) => {
      for (const value of signals)
        process.on(value, () => {
          if (terminating !== undefined) return;
          terminating = value;
          shutdownSignal = value;
          readinessAbort?.abort();
          if (activeCommand?.pid !== undefined) {
            try {
              globalThis.process.kill(-activeCommand.pid, value);
            } catch {
              /* Cleanup will report an owned-command failure. */
            }
          }
          resolve(value);
        });
    });
    try {
      console.log(
        JSON.stringify({
          lifecycle: "starting",
          profile,
          runId,
          app: appOrigin,
          marketing: marketingOrigin,
          composeProject: project,
        })
      );
      const beforeDatabase =
        profile === "fixture"
          ? fixtureEnvironment(appOrigin, "")
          : connectedEnvironment(appOrigin, "");
      await command(
        "storage",
        "docker",
        compose(project, "up", "--detach", "--wait", "postgres"),
        beforeDatabase
      );
      const postgres = await command(
        "storage",
        "docker",
        compose(project, "port", "postgres", "5432"),
        beforeDatabase,
        "pipe"
      );
      const postgresPort = /:(\d+)$/u.exec(postgres.trim())?.[1];
      if (postgresPort === undefined)
        throw new LifecycleError(
          "storage",
          "Could not resolve the owned PostgreSQL port."
        );
      const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/open_instinct`;
      const environment =
        profile === "fixture"
          ? fixtureEnvironment(appOrigin, databaseUrl)
          : connectedEnvironment(appOrigin, databaseUrl);
      record.readiness.database = "ready";
      await persist();
      await command(
        "migrations",
        "pnpm",
        ["db:migrate"],
        migrationEnvironment(environment)
      );
      record.readiness.migrations = "ready";
      await persist();
      const onServiceExit = (name: ServiceName, code: number | null) => {
        serviceFailure ??= `${name} exited with ${String(code)}.`;
        readinessAbort?.abort();
      };
      if ((await probe(`${agentationOrigin}/pending`)) === "ready")
        record.readiness.agentation = "external";
      else {
        const agentation = await startService(
          "agentation",
          ["dev:agentation"],
          environment,
          logs,
          record.nonce,
          onServiceExit
        );
        services.push(agentation);
        record.children.agentation = agentation.process;
        await waitHttp(
          `${agentationOrigin}/pending`,
          "agentation",
          () => serviceFailure
        );
        record.readiness.agentation = "ready";
      }
      const app = await startService(
        "app",
        ["dev:app", "--port", String(appPort), "--hostname", "127.0.0.1"],
        environment,
        logs,
        record.nonce,
        onServiceExit
      );
      services.push(app);
      record.children.app = app.process;
      const marketing = await startService(
        "marketing",
        [
          "--dir",
          "apps/marketing",
          "dev",
          "--port",
          String(marketingPort),
          "--hostname",
          "127.0.0.1",
        ],
        environment,
        logs,
        record.nonce,
        onServiceExit
      );
      services.push(marketing);
      record.children.marketing = marketing.process;
      await persist();
      await waitHttp(appOrigin, "app", () => serviceFailure);
      record.readiness.app = "ready";
      await waitHttp(`${appOrigin}/eve/v1/health`, "eve", () => serviceFailure);
      record.readiness.eve = "ready";
      await waitHttp(marketingOrigin, "marketing", () => serviceFailure);
      record.readiness.marketing = "ready";
      if (profile === "connected")
        record.readiness.provider =
          process.env.AI_GATEWAY_API_KEY?.trim() ||
          process.env.VERCEL_OIDC_TOKEN?.trim()
            ? "pending"
            : "failed";
      await persist();
      await writeVerificationEvidence(record);
      console.log(
        JSON.stringify({
          lifecycle: "ready",
          profile,
          runId,
          origins: record.origins,
          readiness: record.readiness,
        })
      );
      let failureTimer: NodeJS.Timeout | undefined;
      const outcome = await Promise.race([
        signal.then((value) => ({ kind: "signal" as const, value })),
        new Promise<{ kind: "failure"; value: string }>((resolve) => {
          failureTimer = setInterval(() => {
            if (serviceFailure !== undefined) {
              clearInterval(failureTimer);
              resolve({ kind: "failure", value: serviceFailure });
            }
          }, 100);
        }),
      ]);
      if (failureTimer !== undefined) clearInterval(failureTimer);
      if (outcome.kind === "failure")
        throw new LifecycleError("services", outcome.value);
      terminating = outcome.value;
    } finally {
      await cleanup();
      await lease.release();
    }
    process.exitCode =
      terminating === "SIGINT"
        ? 130
        : terminating === "SIGTERM"
          ? 143
          : terminating === "SIGHUP"
            ? 129
            : 0;
  } catch (error) {
    if (error instanceof LifecycleInterrupted) {
      process.exitCode = signalExitCode(shutdownSignal);
      return;
    }
    throw error;
  }
}

async function main() {
  const { control, profile, runNonce } = argumentsForRun();
  if (control === "status") return showStatus();
  if (control === "stop") return stopOwned();
  if (runNonce !== undefined) return start(profile, runNonce);
  const nonce = randomBytes(24).toString("hex");
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "--profile",
      profile,
      "--run-nonce",
      nonce,
    ],
    {
      cwd: repositoryRoot,
      detached: false,
      env: { ...process.env, DEV_INTERNAL_SUPERVISOR: "1" },
      stdio: "inherit",
    }
  );
  let forwardedSignal: NodeJS.Signals | undefined;
  for (const signal of signals)
    process.once(signal, () => {
      forwardedSignal ??= signal;
      if (child.pid !== undefined) child.kill(signal);
    });
  const code = await childExit(child);
  process.exitCode =
    code !== 0 && code !== null
      ? code
      : forwardedSignal === "SIGINT"
        ? 130
        : forwardedSignal === "SIGTERM"
          ? 143
          : forwardedSignal === "SIGHUP"
            ? 129
            : (code ?? 1);
}

function signalExitCode(signal: NodeJS.Signals | undefined) {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 129;
}

// oxlint-disable-next-line typescript/use-unknown-in-catch-callback-variable -- The top-level boundary formats the process error without passing it into application code.
main().catch((error: Error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
