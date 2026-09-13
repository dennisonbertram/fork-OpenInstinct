import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { startDemoMcp } from "../evals/contract/fixtures/demo-mcp/server.ts";
import { startContractDeliveryProvider } from "../evals/contract/fixtures/delivery-provider/server.ts";
import { startFakeSquare } from "../evals/square/fake/server.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const demoExtensionRoot = fileURLToPath(
  new URL("../evals/contract/fixtures/demo-extension", import.meta.url)
);
const mountHarnessRoot = fileURLToPath(
  new URL("../evals/contract/mount-harness", import.meta.url)
);
const migrationsJournalPath = fileURLToPath(
  new URL("../db/migrations/meta/_journal.json", import.meta.url)
);
const contractMcpToken = "contract-mcp-credential";
const composeProject = `open-instinct-contract-${createHash("sha256")
  .update(repositoryRoot)
  .digest("hex")
  .slice(0, 8)}-${randomBytes(4).toString("hex")}`;
const composeArguments = (...args: string[]) => [
  "compose",
  "--project-name",
  composeProject,
  ...args,
];
// oxlint-disable-next-line eslint/no-restricted-properties -- The supervisor forwards its existing invocation environment after explicitly removing model credentials.
const inheritedEnvironment = { ...process.env };
const verificationEvidencePath = configuredEvidencePath(
  inheritedEnvironment.VERIFY_EVIDENCE_PATH,
  "contract-supervisor.json"
);
const deliverySnapshotPath =
  inheritedEnvironment.CONTRACT_DELIVERY_PROVIDER_SNAPSHOT_PATH ??
  join(
    mountHarnessRoot,
    ".eve",
    "evals",
    "contract-delivery-provider-snapshot.json"
  );
delete inheritedEnvironment.CONTRACT_DELIVERY_PROVIDER_SNAPSHOT_PATH;
delete inheritedEnvironment.AI_GATEWAY_API_KEY;
delete inheritedEnvironment.VERCEL_OIDC_TOKEN;
delete inheritedEnvironment.VERCEL_ENV;

let activeChild: ChildProcess | undefined;
let activeDemo: Awaited<ReturnType<typeof startDemoMcp>> | undefined;
let activeDeliveryProvider:
  | Awaited<ReturnType<typeof startContractDeliveryProvider>>
  | undefined;
let activeFake: Awaited<ReturnType<typeof startFakeSquare>> | undefined;
let composeAttempted = false;
let interrupted = false;
let cleanupStatus: "passed" | "failed" | "not-attempted" = "not-attempted";

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => {
    interrupted = true;
    process.exitCode =
      signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129;
    interrupt(activeChild, signal);
  });
}

await runContractEvals();

async function runContractEvals() {
  try {
    const rawArguments = process.argv.slice(2);
    const mountOnly = rawArguments.includes("--mount-only");
    const evalArguments = validateEvalArguments(
      rawArguments.filter((argument) => argument !== "--mount-only")
    );
    composeAttempted = true;
    if (
      !(await requireSuccess(
        "docker",
        composeArguments("up", "--detach", "--wait", "postgres")
      ))
    ) {
      return;
    }

    const address = await output(
      "docker",
      composeArguments("port", "postgres", "5432")
    );
    const port = /:(\d+)\s*$/u.exec(address)?.[1];
    if (!port) throw new Error("Could not resolve the local PostgreSQL port.");

    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/open_instinct`;
    activeFake = await startFakeSquare({ port: 0 });
    activeDemo = await startDemoMcp({ token: contractMcpToken });
    activeDeliveryProvider = await startContractDeliveryProvider({ port: 0 });
    const environment: NodeJS.ProcessEnv = {
      ...inheritedEnvironment,
      BETTER_AUTH_SECRET: "contract-eval-local-auth-secret-placeholder",
      BETTER_AUTH_URL: "http://127.0.0.1:9",
      CONTRACT_MCP_URL: activeDemo.url,
      CONTRACT_MCP_TOKEN: contractMcpToken,
      CONTRACT_DELIVERY_PROVIDER_URL: activeDeliveryProvider.url,
      DATABASE_URL: databaseUrl,
      DATABASE_URL_UNPOOLED: databaseUrl,
      EVAL_CONTRACT_FIXTURE: "1",
      KERNEL_API_KEY: "unused-by-contract-evals",
      KERNEL_BASE_URL: "http://127.0.0.1:9",
      NODE_ENV: "development",
      SECRET_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      SQUARE_BASE_URL: activeFake.url,
      SQUARE_ENVIRONMENT: "sandbox",
      SQUARE_SANDBOX_ACCESS_TOKEN: "contract-eval-token",
      WORKSPACE_SCOPE_ENFORCEMENT: "enforce",
    };

    if (!(await requireSuccess("pnpm", ["db:migrate"], environment))) return;
    if (
      !(await requireSuccess(
        "pnpm",
        ["exec", "tsx", "evals/square/setup-access.ts"],
        environment
      ))
    ) {
      return;
    }
    if (
      !(await requireSuccess(
        "pnpm",
        ["exec", "eve", "extension", "build"],
        environment,
        demoExtensionRoot
      ))
    ) {
      return;
    }
    if (!mountOnly) {
      const coreExitCode = await run(
        "pnpm",
        [
          "exec",
          "eve",
          "eval",
          "contract",
          "--strict",
          "--tag",
          "contract",
          "--max-concurrency",
          "1",
          "--skip-report",
          ...evalArguments,
        ],
        environment
      );
      if (coreExitCode !== 0 || interrupted) {
        if (!interrupted) process.exitCode = coreExitCode ?? 1;
        return;
      }
    }
    const mountExitCode = await run(
      "pnpm",
      [
        "exec",
        "eve",
        "eval",
        ...(mountOnly ? ["linq-final-delivery"] : []),
        "--strict",
        "--tag",
        "contract-mount",
        "--max-concurrency",
        "1",
        "--skip-report",
        ...mountEvalArguments(evalArguments),
      ],
      environment,
      mountHarnessRoot
    );
    process.exitCode = process.exitCode ?? mountExitCode ?? 1;
  } finally {
    let cleanupFailed = false;
    if (activeDeliveryProvider) {
      try {
        await mkdir(dirname(deliverySnapshotPath), { recursive: true });
        await writeFile(
          deliverySnapshotPath,
          `${JSON.stringify(activeDeliveryProvider.snapshot(), null, 2)}\n`
        );
      } catch {
        cleanupFailed = true;
        console.error(
          "Could not write the contract delivery provider snapshot."
        );
        process.exitCode = 1;
      }
    }
    try {
      await activeDeliveryProvider?.close();
    } catch {
      cleanupFailed = true;
      process.exitCode = 1;
      console.error("Contract delivery fixture cleanup failed.");
    }
    activeDeliveryProvider = undefined;
    try {
      await activeDemo?.close();
    } catch {
      cleanupFailed = true;
      process.exitCode = 1;
      console.error("Contract MCP fixture cleanup failed.");
    }
    activeDemo = undefined;
    try {
      await activeFake?.close();
    } catch {
      cleanupFailed = true;
      process.exitCode = 1;
      console.error("Fake Square fixture cleanup failed.");
    }
    activeFake = undefined;
    if (composeAttempted) {
      try {
        const exitCode = await run(
          "docker",
          composeArguments("down", "--volumes"),
          inheritedEnvironment
        );
        if (exitCode !== 0) {
          cleanupFailed = true;
          console.error("Owned contract Compose teardown failed.");
          process.exitCode = 1;
        }
      } catch {
        cleanupFailed = true;
        console.error("Owned contract Compose teardown failed.");
        process.exitCode = 1;
      }
      cleanupStatus = cleanupFailed ? "failed" : "passed";
    }
    if (verificationEvidencePath !== undefined) {
      try {
        const journalText = await readFile(migrationsJournalPath, "utf8");
        const journalInput: unknown = JSON.parse(journalText);
        const journal = z
          .object({ entries: z.array(z.object({ tag: z.string() })) })
          .parse(journalInput);
        const migrationRevision = journal.entries.at(-1)?.tag;
        if (migrationRevision === undefined) {
          console.error("Migration revision is unavailable.");
          process.exitCode = 1;
        } else {
          const evidence = {
            schemaVersion: 1,
            lane: "contract-evals",
            composeProject,
            database: "contract fixture database",
            migration: {
              sourceRevision: migrationRevision,
              evidence:
                "The owned db:migrate command succeeded before contract execution.",
            },
            cleanup: cleanupStatus,
          };
          const handle = await open(verificationEvidencePath, "wx", 0o600);
          try {
            await handle.writeFile(
              `${JSON.stringify(evidence, null, 2)}\n`,
              "utf8"
            );
          } finally {
            await handle.close();
          }
        }
      } catch {
        console.error(
          "Could not write the bounded verification evidence file."
        );
        process.exitCode = 1;
      }
    }
  }
}

function configuredEvidencePath(
  value: string | undefined,
  expectedName: string
) {
  if (value === undefined) return undefined;
  const resolvedPath = isAbsolute(value)
    ? resolve(value)
    : resolve(repositoryRoot, value);
  const verifyRoot = resolve(repositoryRoot, ".eve", "verify");
  const relativePath = relative(verifyRoot, resolvedPath);
  const parts = relativePath.split(sep);
  if (
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath) ||
    parts.length !== 2 ||
    !/^[0-9a-f-]{36}$/u.test(parts[0] ?? "") ||
    basename(resolvedPath) !== expectedName
  ) {
    throw new Error(
      "Verification evidence paths must stay inside their run directory."
    );
  }
  return resolvedPath;
}

function validateEvalArguments(args: string[]) {
  const booleanOptions = new Set(["--json", "--list", "--verbose"]);
  const valueOptions = new Set(["--junit", "--timeout"]);
  const validated: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument || argument === "--") continue;
    if (booleanOptions.has(argument)) {
      validated.push(argument);
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const option =
      equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    if (!valueOptions.has(option)) throw unsupportedEvalArgument(argument);
    if (equalsIndex !== -1) {
      if (!argument.slice(equalsIndex + 1)) {
        throw unsupportedEvalArgument(argument);
      }
      validated.push(argument);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      throw unsupportedEvalArgument(argument);
    }
    validated.push(argument, value);
    index += 1;
  }
  return validated;
}

function unsupportedEvalArgument(argument: string) {
  return new Error(
    `Unsupported contract eval argument "${argument}". The harness owns the eval path, tag, target, strictness, reporters, and concurrency.`
  );
}

function mountEvalArguments(args: string[]) {
  return args.map((argument, index) => {
    if (argument.startsWith("--junit=")) {
      return `--junit=${mountJunitPath(argument.slice("--junit=".length))}`;
    }
    if (args[index - 1] === "--junit") return mountJunitPath(argument);
    return argument;
  });
}

function mountJunitPath(path: string) {
  return path.endsWith(".xml")
    ? `${path.slice(0, -".xml".length)}-mount.xml`
    : `${path}-mount.xml`;
}

async function requireSuccess(
  command: string,
  args: string[],
  environment = inheritedEnvironment,
  cwd = repositoryRoot
) {
  const exitCode = await run(command, args, environment, cwd);
  if (exitCode !== 0 && !interrupted) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${String(exitCode)}`
    );
  }
  return exitCode === 0 && !interrupted;
}

function run(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  cwd = repositoryRoot
) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: environment,
    stdio: "inherit",
  });
  activeChild = child;
  return new Promise<number | null>((settle, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (activeChild === child) activeChild = undefined;
      settle(code);
    });
  });
}

async function output(command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env: inheritedEnvironment,
    stdio: ["inherit", "pipe", "inherit"],
  });
  activeChild = child;
  child.stdout.setEncoding("utf8");
  let value = "";
  child.stdout.on("data", (chunk: string) => {
    value += chunk;
  });
  const exitCode = await new Promise<number | null>((settle, reject) => {
    child.once("error", reject);
    child.once("exit", settle);
  });
  if (activeChild === child) activeChild = undefined;
  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${String(exitCode)}`
    );
  }
  return value;
}

function interrupt(child: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ESRCH")
    ) {
      throw error;
    }
  }
}
