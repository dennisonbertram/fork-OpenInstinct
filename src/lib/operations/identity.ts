import nextPackage from "next/package.json";
import migrationJournal from "../../../db/migrations/meta/_journal.json";
import {
  readDatabaseIdentity,
  type DatabaseIdentity,
} from "@/db/services/operations-identity";
import { env, isFeatureEnabled, isWorkflowResumeTimingEnabled } from "@/env";

// Next statically replaces these non-secret `next.config.ts` env values in the
// server artifact. Do not route them through the dynamic environment proxy: it
// cannot retain config-provided build identity values in a production bundle.
const bundledBuildIdentity = {
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Next requires this direct static read to inline the non-secret config build fingerprint.
  declaredEvePatch: process.env.OPENINSTINCT_BUILD_EVE_PATCH_DECLARATION,
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Next requires this direct static read to inline the non-secret config build fingerprint.
  declaredEvePatchSha256: process.env.OPENINSTINCT_BUILD_EVE_PATCH_SHA256,
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Next requires this direct static read to inline the non-secret config build fingerprint.
  eveVersion: process.env.OPENINSTINCT_BUILD_EVE_VERSION,
  // oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- Next requires this direct static read to inline the non-secret config build fingerprint.
  lockSha256: process.env.OPENINSTINCT_BUILD_LOCK_SHA256,
};

type IdentityFact<Value extends string | boolean = string | boolean> =
  | { readonly status: "observed"; readonly value: Value }
  | { readonly status: "unknown"; readonly reason: IdentityUnknownReason }
  | {
      readonly status: "mismatch";
      readonly reason: IdentityMismatchReason;
    };

type IdentityUnknownReason =
  | "not_configured"
  | "not_bundled"
  | "not_runtime_attested"
  | "not_exposed_by_application_config"
  | "unsafe_public_origin"
  | "unsupported_runtime_value";

type IdentityMismatchReason = "configuration_mismatch";

type ConfigurationState =
  | "configured-not-validated"
  | "incomplete-not-validated"
  | "not-configured";

type RuntimeEnvironment =
  | "development"
  | "production"
  | "preview"
  | "local-development"
  | "standalone-production"
  | "test";

export interface OperationsIdentity {
  readonly capturedAt: string;
  /** A configured public origin, never a request-controlled host. */
  readonly serverOrigin: IdentityFact<string>;
  readonly facts: {
    readonly buildRevision: IdentityFact<string>;
    readonly adminAllowlist: IdentityFact<ConfigurationState>;
    readonly deploymentId: IdentityFact<string>;
    readonly deploymentOrigin: IdentityFact<string>;
    readonly environment: IdentityFact<RuntimeEnvironment>;
    readonly declaredEvePatch: IdentityFact<string>;
    readonly declaredEvePatchSha256: IdentityFact<string>;
    readonly appliedEvePatch: IdentityFact<string>;
    readonly eveVersion: IdentityFact<string>;
    readonly featureDeveloperActivity: IdentityFact<boolean>;
    readonly kernel: IdentityFact<ConfigurationState>;
    readonly lockSha256: IdentityFact<string>;
    readonly nodeVersion: IdentityFact<string>;
    readonly nextVersion: IdentityFact<string>;
    readonly privateBlob: IdentityFact<ConfigurationState>;
    readonly projectId: IdentityFact<string>;
    readonly providerGoogle: IdentityFact<ConfigurationState>;
    readonly providerLinq: IdentityFact<ConfigurationState>;
    readonly providerSendblue: IdentityFact<ConfigurationState>;
    readonly providerSquare: IdentityFact<ConfigurationState>;
    readonly otpProvider: IdentityFact<"linq" | "sendblue">;
    readonly sendblueConversations: IdentityFact<"on" | "off">;
    readonly squareEnvironment: IdentityFact<"sandbox" | "production">;
    readonly workflowResumeTiming: IdentityFact<boolean>;
    readonly database: DatabaseIdentity;
  };
}

/**
 * Returns deployment-scoped configuration evidence. It never validates a
 * credential or makes provider calls; configured only means present in this
 * runtime, not usable by a real customer journey.
 */
export async function readOperationsIdentity(): Promise<OperationsIdentity> {
  const serverOrigin = configuredServerOrigin();
  const database = await readDatabaseIdentity({
    pooledUrl: env.DATABASE_URL,
    directUrl: env.DATABASE_URL_UNPOOLED,
    expectedMigrationCreatedAt: migrationJournal.entries.at(-1)?.when,
  });

  return {
    capturedAt: new Date().toISOString(),
    serverOrigin,
    facts: {
      adminAllowlist: observed(
        configurationState(env.ADMIN_PHONE_NUMBERS.trim() || undefined)
      ),
      buildRevision: revisionFact(env.VERCEL_GIT_COMMIT_SHA),
      deploymentId: deploymentIdFact(env.VERCEL_DEPLOYMENT_ID),
      deploymentOrigin: publicOriginFact(env.VERCEL_URL, "not_configured"),
      environment: observed(runtimeEnvironment()),
      // The build fingerprints prove declared source inputs, not that a
      // package manager applied a patch to the deployed runtime artifact.
      declaredEvePatch: buildMetadataFact(
        bundledBuildIdentity.declaredEvePatch
      ),
      declaredEvePatchSha256: buildMetadataFact(
        bundledBuildIdentity.declaredEvePatchSha256
      ),
      appliedEvePatch: unknown("not_runtime_attested"),
      eveVersion: buildVersionFact(bundledBuildIdentity.eveVersion),
      featureDeveloperActivity: observed(isFeatureEnabled("developerActivity")),
      kernel: observed("configured-not-validated"),
      lockSha256: buildMetadataFact(bundledBuildIdentity.lockSha256),
      nodeVersion: packageVersionFact(process.versions.node),
      nextVersion: packageVersionFact(nextPackage.version),
      privateBlob: observed(
        configurationState(env.BLOB_STORE_ID, env.BLOB_READ_WRITE_TOKEN)
      ),
      projectId: projectIdFact(env.VERCEL_PROJECT_ID),
      providerGoogle: observed(configurationState(env.GOOGLE_CONNECTOR_UID)),
      providerLinq: observed(
        configurationState(env.LINQ_CONNECTOR, env.LINQ_PHONE_NUMBER)
      ),
      providerSendblue: observed(
        configurationState(
          env.SENDBLUE_API_KEY_ID,
          env.SENDBLUE_API_SECRET_KEY,
          env.SENDBLUE_ACCOUNT_ID,
          env.SENDBLUE_FROM_NUMBER,
          env.SENDBLUE_WEBHOOK_SECRET
        )
      ),
      providerSquare: observed(configurationState(env.SQUARE_CONNECTOR_UID)),
      otpProvider: observed(env.PHONE_OTP_PROVIDER),
      sendblueConversations: observed(env.SENDBLUE_CONVERSATIONS),
      squareEnvironment: observed(env.SQUARE_ENVIRONMENT),
      workflowResumeTiming: observed(isWorkflowResumeTimingEnabled()),
      database,
    },
  };
}

function configuredServerOrigin(): IdentityFact<string> {
  if (env.BETTER_AUTH_URL) {
    return publicOriginFact(env.BETTER_AUTH_URL, "not_configured");
  }
  return publicOriginFact(
    env.VERCEL_PROJECT_PRODUCTION_URL ??
      env.VERCEL_URL ??
      env.VERCEL_BRANCH_URL,
    "not_configured"
  );
}

function publicOriginFact(
  candidate: string | undefined,
  absentReason: IdentityUnknownReason
): IdentityFact<string> {
  if (!candidate) return unknown(absentReason);

  try {
    const url = candidate.includes("://")
      ? new URL(candidate)
      : new URL(`https://${candidate}`);
    if (
      !isAllowedConfiguredOrigin(url) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return unknown("unsafe_public_origin");
    }
    return observed(url.origin);
  } catch {
    return unknown("unsafe_public_origin");
  }
}

function isAllowedConfiguredOrigin(url: URL) {
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    env.VERCEL_ENV === undefined &&
    env.NODE_ENV === "development" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

function runtimeEnvironment(): RuntimeEnvironment {
  if (env.VERCEL_ENV) return env.VERCEL_ENV;
  if (env.NODE_ENV === "development") return "local-development";
  if (env.NODE_ENV === "test") return "test";
  return "standalone-production";
}

function revisionFact(value: string | undefined): IdentityFact<string> {
  return value && /^[a-f0-9]{7,64}$/i.test(value)
    ? observed(value)
    : unknown(value ? "unsupported_runtime_value" : "not_configured");
}

function deploymentIdFact(value: string | undefined): IdentityFact<string> {
  return value && /^dpl_[A-Za-z0-9]+$/.test(value)
    ? observed(value)
    : unknown(value ? "unsupported_runtime_value" : "not_configured");
}

function projectIdFact(value: string | undefined): IdentityFact<string> {
  return value && /^prj_[A-Za-z0-9]+$/.test(value)
    ? observed(value)
    : unknown(value ? "unsupported_runtime_value" : "not_configured");
}

function packageVersionFact(value: string): IdentityFact<string> {
  return /^\d+\.\d+\.\d+/.test(value)
    ? observed(value)
    : unknown("unsupported_runtime_value");
}

function buildMetadataFact(value: string | undefined): IdentityFact<string> {
  return value ? observed(value) : unknown("not_bundled");
}

function buildVersionFact(value: string | undefined): IdentityFact<string> {
  return value ? packageVersionFact(value) : unknown("not_bundled");
}

function configurationState(
  ...values: (string | undefined)[]
): ConfigurationState {
  const configured = values.filter((value) => value !== undefined).length;
  if (configured === 0) return "not-configured";
  return configured === values.length
    ? "configured-not-validated"
    : "incomplete-not-validated";
}

function observed<Value extends string | boolean>(
  value: Value
): IdentityFact<Value> {
  return { status: "observed", value };
}

function unknown(reason: IdentityUnknownReason): IdentityFact<never> {
  return { status: "unknown", reason };
}
