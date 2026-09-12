import { delimiter, join } from "node:path";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer, type Server } from "node:net";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { VerificationLaneId } from "./lanes.ts";

const inheritedPathKeys = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
] as const;

export async function createLaneEnvironment({
  repositoryRoot,
  runId,
  lane,
  artifactRoot,
  sourceFingerprint,
  leaseNonce,
}: {
  repositoryRoot: string;
  runId: string;
  lane: VerificationLaneId;
  artifactRoot: string;
  sourceFingerprint: string;
  leaseNonce: string;
}) {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV:
      lane === "build" || lane === "contract-evals" || lane === "e2e"
        ? lane === "build"
          ? "production"
          : "development"
        : "test",
  };
  // oxlint-disable-next-line eslint/no-restricted-properties -- Copy only the documented process-path values, never the caller's credential environment.
  const parentEnvironment = process.env;
  for (const key of inheritedPathKeys) {
    if (parentEnvironment[key] !== undefined)
      environment[key] = parentEnvironment[key];
  }

  const guardUrl = pathToFileURL(
    join(repositoryRoot, "scripts/verification/deny-env-files.mjs")
  ).href;
  environment.NODE_OPTIONS = "--import=" + guardUrl;
  environment.VERIFY_REPO_ROOT = repositoryRoot;
  environment.VERIFY_RUN_ID = runId;
  environment.VERIFY_SOURCE_FINGERPRINT = sourceFingerprint;
  environment.VERIFY_ARTIFACT_ROOT = artifactRoot;
  environment.CI = "1";
  environment.NO_COLOR = "1";
  environment.FORCE_COLOR = "0";
  environment.npm_config_userconfig =
    process.platform === "win32" ? "NUL" : "/dev/null";
  environment.PLAYWRIGHT_HTML_OPEN = "never";

  switch (lane) {
    case "checks":
      environment.REAL_PG = "0";
      environment.TURBO_FORCE = "true";
      environment.TURBO_TELEMETRY_DISABLED = "1";
      environment.TURBO_NO_UPDATE_NOTIFIER = "1";
      break;
    case "build":
      environment.DATABASE_URL =
        "postgresql://postgres:postgres@127.0.0.1:9/open_instinct";
      environment.KERNEL_API_KEY = "ci-kernel-key";
      environment.BETTER_AUTH_SECRET = "ci-auth-secret-synthetic-0123456789";
      environment.BETTER_AUTH_URL = "http://127.0.0.1:3000";
      environment.SECRET_ENCRYPTION_KEY =
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
      break;
    case "real-postgres":
      environment.REAL_PG = "1";
      environment.VERIFY_EVIDENCE_PATH = join(
        artifactRoot,
        "real-postgres-supervisor.json"
      );
      environment.VERIFY_REAL_PG_JUNIT_PATH = join(
        artifactRoot,
        "real-postgres.xml"
      );
      break;
    case "contract-evals":
      environment.VERIFY_EVIDENCE_PATH = join(
        artifactRoot,
        "contract-supervisor.json"
      );
      environment.CONTRACT_DELIVERY_PROVIDER_SNAPSHOT_PATH = join(
        artifactRoot,
        "contract-delivery-provider-snapshot.json"
      );
      break;
    case "e2e":
      environment.DEV_PROFILE = "fixture";
      environment.DEV_RUN_ID =
        "verify-" + runId.replaceAll("-", "").slice(0, 20) + "-web";
      environment.DEV_VERIFY_LEASE_NONCE = leaseNonce;
      environment.DEV_FIXTURE_REPOSITORY_ROOT = repositoryRoot;
      environment.DEV_VERIFY_EVIDENCE_PATH = join(
        artifactRoot,
        "development-web.json"
      );
      {
        const [appPort, marketingPort] = await findFreeLoopbackPorts(2);
        environment.PLAYWRIGHT_PORT = String(appPort);
        environment.MARKETING_PORT = String(marketingPort);
      }
      break;
  }
  return environment;
}

export function makePlaywrightEnvironment(
  base: NodeJS.ProcessEnv,
  step: "web" | "sendblue",
  artifactRoot: string,
  runId: string,
  leaseNonce: string,
  repositoryRoot: string
) {
  const environment = { ...base };
  if (step === "sendblue") {
    environment.DEV_FIXTURE_SCENARIO = "sendblue-ui";
  }
  environment.DEV_RUN_ID =
    "verify-" + runId.replaceAll("-", "").slice(0, 20) + "-" + step;
  environment.DEV_VERIFY_EVIDENCE_PATH = join(
    artifactRoot,
    "development-" + step + ".json"
  );
  environment.PLAYWRIGHT_JSON_OUTPUT_NAME = join(
    artifactRoot,
    "playwright-" + step + ".json"
  );
  environment.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE = join(
    artifactRoot,
    "playwright-" + step + "-last-run.json"
  );
  environment.PLAYWRIGHT_HTML_OUTPUT_DIR = join(
    artifactRoot,
    "playwright-" + step + "-report"
  );
  environment.DEV_VERIFY_LEASE_NONCE = leaseNonce;
  environment.DEV_FIXTURE_REPOSITORY_ROOT = repositoryRoot;
  return environment;
}

export async function canExecute(command: string): Promise<boolean> {
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Resolving required executables needs the inherited PATH only.
  const searchPath = process.env.PATH ?? "";
  const candidates = searchPath
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, command));
  for (const candidate of candidates) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Probe PATH entries in order and stop at the first executable.
      await access(candidate, constants.X_OK);
      return true;
    } catch {
      // Continue through PATH without inspecting the executable or its output.
    }
  }
  return false;
}

async function findFreeLoopbackPorts(count: number): Promise<number[]> {
  const servers: Server[] = [];
  const ports: number[] = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const server = createServer();
      servers.push(server);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Reserve ports one at a time so simultaneous fixtures never receive the same ephemeral port.
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port: 0 }, resolve);
      });
      const address = z
        .object({ port: z.number().int().min(1).max(65535) })
        .safeParse(server.address());
      if (!address.success) {
        throw new Error("Could not allocate a loopback verification port.");
      }
      ports.push(address.data.port);
    }
    return ports;
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          })
      )
    );
  }
}
