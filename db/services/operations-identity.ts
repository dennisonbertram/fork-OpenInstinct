import { Pool } from "pg";
import type { PoolClient, QueryResult } from "pg";

type IdentityStatus = "observed" | "unknown" | "mismatch";

interface SafeProbeFact {
  status: IdentityStatus;
  reason?: DatabaseIdentityReason;
}

type DatabaseIdentityReason =
  | "configuration_missing"
  | "unsupported_endpoint"
  | "probe_unavailable"
  | "database_mismatch"
  | "migration_mismatch"
  | "migration_unavailable"
  | "endpoint_unverified";

export interface DatabaseIdentity {
  status: IdentityStatus;
  value?: "same-database";
  reason?: DatabaseIdentityReason;
  pooled?: SafeProbeFact;
  direct?: SafeProbeFact;
}

interface DatabaseProbe {
  databaseName: string;
  migrationHash: string;
  migrationCreatedAt: number;
}

type ProbeResult =
  | { status: "observed"; probe: DatabaseProbe }
  | { status: "unknown"; reason: DatabaseIdentityReason };

type DatabaseEndpoint =
  | { provider: "neon"; identity: string }
  | { provider: "loopback"; identity: string };

const CONNECTION_TIMEOUT_MILLIS = 1_500;
const STATEMENT_TIMEOUT_MILLIS = 1_500;

/**
 * Compares runtime and migration URLs without returning either URL, host,
 * database name, migration hash, or a driver error.
 */
export async function readDatabaseIdentity(input: {
  pooledUrl: string | undefined;
  directUrl: string | undefined;
  expectedMigrationCreatedAt?: number;
}): Promise<DatabaseIdentity> {
  const pooledEndpoint = parseDatabaseEndpoint(input.pooledUrl);
  const directEndpoint = parseDatabaseEndpoint(input.directUrl);
  const pooledConfigured = Boolean(input.pooledUrl);
  const directConfigured = Boolean(input.directUrl);

  if (
    pooledEndpoint &&
    directEndpoint &&
    (pooledEndpoint.provider !== directEndpoint.provider ||
      pooledEndpoint.identity !== directEndpoint.identity)
  ) {
    return {
      status: "unknown",
      reason: "endpoint_unverified",
      pooled: { status: "unknown", reason: "endpoint_unverified" },
      direct: { status: "unknown", reason: "endpoint_unverified" },
    };
  }

  const [pooled, direct] = await Promise.all([
    probeIfSupported(input.pooledUrl, pooledEndpoint),
    probeIfSupported(input.directUrl, directEndpoint),
  ]);
  const pooledFact = toSafeFact(pooled);
  const directFact = toSafeFact(direct);

  if (pooled.status !== "observed" || direct.status !== "observed") {
    const reason =
      pooled.status === "unknown" && pooled.reason === "migration_unavailable"
        ? "migration_unavailable"
        : direct.status === "unknown" &&
            direct.reason === "migration_unavailable"
          ? "migration_unavailable"
          : !pooledConfigured || !directConfigured
            ? "configuration_missing"
            : !pooledEndpoint || !directEndpoint
              ? "unsupported_endpoint"
              : "probe_unavailable";
    return {
      status: "unknown",
      reason,
      pooled: pooledFact,
      direct: directFact,
    };
  }

  if (pooled.probe.databaseName !== direct.probe.databaseName) {
    return {
      status: "mismatch",
      reason: "database_mismatch",
      pooled: pooledFact,
      direct: directFact,
    };
  }

  if (pooled.probe.migrationHash !== direct.probe.migrationHash) {
    return {
      status: "mismatch",
      reason: "migration_mismatch",
      pooled: pooledFact,
      direct: directFact,
    };
  }

  if (input.expectedMigrationCreatedAt === undefined) {
    return {
      status: "unknown",
      reason: "migration_unavailable",
      pooled: pooledFact,
      direct: directFact,
    };
  }

  if (
    pooled.probe.migrationCreatedAt !== input.expectedMigrationCreatedAt ||
    direct.probe.migrationCreatedAt !== input.expectedMigrationCreatedAt
  ) {
    return {
      status: "mismatch",
      reason: "migration_mismatch",
      pooled: pooledFact,
      direct: directFact,
    };
  }

  return {
    status: "observed",
    value: "same-database",
    pooled: pooledFact,
    direct: directFact,
  };
}

async function probeIfSupported(
  connectionString: string | undefined,
  endpoint: DatabaseEndpoint | undefined
): Promise<ProbeResult> {
  if (!connectionString || !endpoint) {
    return {
      status: "unknown",
      reason: connectionString
        ? "unsupported_endpoint"
        : "configuration_missing",
    };
  }

  return probeDatabase(connectionString);
}

async function probeDatabase(connectionString: string): Promise<ProbeResult> {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  let transactionStarted = false;
  let destroyClient = false;

  try {
    pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MILLIS,
      statement_timeout: STATEMENT_TIMEOUT_MILLIS,
      idleTimeoutMillis: CONNECTION_TIMEOUT_MILLIS,
      allowExitOnIdle: true,
    });
    pool.on("error", () => undefined);
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '1500ms'");

    const databaseResult = await client.query<{ database_name: string }>(
      "SELECT current_database() AS database_name"
    );
    const databaseName = databaseResult.rows[0]?.database_name;
    if (!databaseName)
      return { status: "unknown", reason: "probe_unavailable" };

    let migrationResult: QueryResult<{
      migration_hash: string;
      migration_created_at: string | number;
    }>;
    try {
      migrationResult = await client.query<{
        migration_hash: string;
        migration_created_at: string | number;
      }>(
        `SELECT hash AS migration_hash, created_at AS migration_created_at
         FROM drizzle.__drizzle_migrations
         ORDER BY created_at DESC
         LIMIT 1`
      );
    } catch {
      return { status: "unknown", reason: "migration_unavailable" };
    }
    const latestMigration = migrationResult.rows[0];
    const migrationCreatedAt = Number(latestMigration?.migration_created_at);
    if (
      !latestMigration?.migration_hash ||
      !Number.isFinite(migrationCreatedAt)
    ) {
      return { status: "unknown", reason: "migration_unavailable" };
    }

    return {
      status: "observed",
      probe: {
        databaseName,
        migrationHash: latestMigration.migration_hash,
        migrationCreatedAt,
      },
    };
  } catch {
    return { status: "unknown", reason: "probe_unavailable" };
  } finally {
    if (client) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          destroyClient = true;
        }
      }
      try {
        client.release(destroyClient);
      } catch {
        // A release failure does not make connection details safe to return.
      }
    }
    if (pool) {
      try {
        await pool.end();
      } catch {
        // The probe result is derived above; shutdown errors reveal no safe fact.
      }
    }
  }
}

function toSafeFact(result: ProbeResult): SafeProbeFact {
  return result.status === "observed"
    ? { status: "observed" }
    : { status: "unknown", reason: result.reason };
}

function parseDatabaseEndpoint(
  connectionString: string | undefined
): DatabaseEndpoint | undefined {
  if (!connectionString) return undefined;

  try {
    const url = new URL(connectionString);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      return undefined;
    }
    const hostname = url.hostname.toLowerCase();
    if (hasRoutingOverride(url)) return undefined;

    if (hostname.endsWith(".neon.tech")) {
      const labels = hostname.split(".");
      const endpointLabel = labels[0];
      if (!endpointLabel?.startsWith("ep-")) return undefined;
      labels[0] = endpointLabel.replace(/-pooler$/, "");
      return { provider: "neon", identity: labels.join(".") };
    }

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    ) {
      const databaseName = decodeURIComponent(url.pathname.slice(1));
      if (!databaseName) return undefined;
      return {
        provider: "loopback",
        identity: JSON.stringify([hostname, url.port || "5432", databaseName]),
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function hasRoutingOverride(url: URL) {
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase() === "host" || key.toLowerCase() === "hostaddr") {
      return true;
    }
  }
  return [...url.searchParams.entries()].some(
    ([key, options]) =>
      key.toLowerCase() === "options" && /endpoint/i.test(options)
  );
}
