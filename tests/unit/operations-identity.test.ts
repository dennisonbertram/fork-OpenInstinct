import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessScope } from "@/lib/access-scope";
import { AdminNotFoundError } from "@/lib/admin";
import type { DatabaseIdentity } from "@/db/services/operations-identity";
import { adminProcedureDependencies } from "@/trpc/init";
import { appRouter } from "@/trpc/router";

const operationsIdentityMock = vi.hoisted(() => ({
  readDatabaseIdentity:
    vi.fn<
      (input: {
        pooledUrl: string | undefined;
        directUrl: string | undefined;
        expectedMigrationCreatedAt?: number;
      }) => Promise<DatabaseIdentity>
    >(),
  poolCreated: vi.fn<() => void>(),
  query:
    vi.fn<
      (queryText: string, poolIndex: number) => Promise<{ rows: QueryRow[] }>
    >(),
}));

interface QueryRow {
  database_name?: string;
  migration_hash?: string;
  migration_created_at?: string | number;
}

vi.mock("@/db/services/operations-identity", () => ({
  readDatabaseIdentity: operationsIdentityMock.readDatabaseIdentity,
}));

const scope = {
  userId: "better-auth:synthetic-operator",
  workspaceId: "personal:synthetic-operator",
} satisfies AccessScope;

const originalRequireAdminScopeFor =
  adminProcedureDependencies.requireAdminScopeFor;

afterEach(() => {
  adminProcedureDependencies.requireAdminScopeFor =
    originalRequireAdminScopeFor;
  operationsIdentityMock.readDatabaseIdentity.mockReset();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  operationsIdentityMock.readDatabaseIdentity.mockResolvedValue({
    status: "unknown",
    reason: "configuration_missing",
  });
});

function operationsIdentityCaller() {
  const caller = appRouter.createCaller({
    origin: "https://example.test",
    scope,
  });
  return caller.admin.operationsIdentity;
}

it("returns safe, partial identity facts through the authorized admin query", async () => {
  const requireAdmin = vi
    .spyOn(adminProcedureDependencies, "requireAdminScopeFor")
    .mockResolvedValue(scope);
  const result = await operationsIdentityCaller()();

  expect(requireAdmin).toHaveBeenCalledTimes(1);
  expect(requireAdmin).toHaveBeenCalledWith(scope);
  expect(Number.isNaN(Date.parse(result.capturedAt))).toBe(false);
  if (result.serverOrigin.status !== "observed") {
    throw new Error("The configured public server origin was not observed.");
  }
  expect(result.serverOrigin).toEqual({
    status: "observed",
    value: "https://example.com",
  });

  const serialized = JSON.stringify(result);
  expect(
    /https?:\/\/|postgres(?:ql)?:\/\/|(?:password|token|secret|connectionstring)\s*[:=]/i.test(
      serialized.replace(result.serverOrigin.value, "")
    )
  ).toBe(false);
  expect(
    /"(?:url|host|token|secret|password|connectionString)"\s*:/i.test(
      serialized
    )
  ).toBe(false);

  const statuses = Object.values(result.facts).map((fact) => fact.status);
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses).toContain("unknown");
});

it("uses build-time lock and declared Eve patch fingerprints", async () => {
  const { buildIdentityEnvironment, buildIdentityMetadata } =
    await import("../../next.config");
  const workspace = readFileSync(
    new URL("../../pnpm-workspace.yaml", import.meta.url),
    "utf8"
  );
  const declaration = /^\s{2}(eve@[^\s:]+):\s+(patches\/[^\s]+)\s*$/m.exec(
    workspace
  );
  if (!declaration?.[1] || !declaration[2]) {
    throw new Error("Expected the tracked Eve patch declaration.");
  }
  expect(buildIdentityMetadata).toMatchObject({
    evePatchDeclaration: declaration[1],
    evePatchSha256: trackedSha256(declaration[2]),
    lockSha256: trackedSha256("pnpm-lock.yaml"),
  });
  expect(buildIdentityEnvironment).toMatchObject({
    OPENINSTINCT_BUILD_EVE_PATCH_DECLARATION:
      buildIdentityMetadata.evePatchDeclaration,
    OPENINSTINCT_BUILD_EVE_PATCH_SHA256: buildIdentityMetadata.evePatchSha256,
    OPENINSTINCT_BUILD_LOCK_SHA256: buildIdentityMetadata.lockSha256,
  });
});

it("reports bundled declared patch inputs without claiming an applied runtime patch", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@example.com/database");
  vi.stubEnv("KERNEL_API_KEY", "test-kernel-key");
  vi.stubEnv("OPENINSTINCT_BUILD_EVE_PATCH_DECLARATION", "eve@0.49.0");
  vi.stubEnv("OPENINSTINCT_BUILD_EVE_VERSION", "0.49.0");
  vi.stubEnv("OPENINSTINCT_BUILD_EVE_PATCH_SHA256", "a".repeat(64));
  vi.stubEnv("OPENINSTINCT_BUILD_LOCK_SHA256", "b".repeat(64));
  operationsIdentityMock.readDatabaseIdentity.mockResolvedValue({
    status: "unknown",
    reason: "configuration_missing",
  });
  vi.resetModules();

  const { readOperationsIdentity } = await import("@/lib/operations/identity");
  const result = await readOperationsIdentity();

  expect(result.facts.declaredEvePatch).toEqual({
    status: "observed",
    value: "eve@0.49.0",
  });
  expect(result.facts.eveVersion).toEqual({
    status: "observed",
    value: "0.49.0",
  });
  expect(result.facts.declaredEvePatchSha256).toEqual({
    status: "observed",
    value: "a".repeat(64),
  });
  expect(result.facts.lockSha256).toEqual({
    status: "observed",
    value: "b".repeat(64),
  });
  expect(result.facts.appliedEvePatch).toEqual({
    status: "unknown",
    reason: "not_runtime_attested",
  });
});

function trackedSha256(relativePath: string) {
  return createHash("sha256")
    .update(readFileSync(new URL(`../../${relativePath}`, import.meta.url)))
    .digest("hex");
}

describe("readDatabaseIdentity", () => {
  beforeEach(() => {
    operationsIdentityMock.poolCreated.mockClear();
    operationsIdentityMock.query.mockReset();
    operationsIdentityMock.query.mockImplementation(async (queryText) => {
      if (queryText.includes("current_database()")) {
        return { rows: [{ database_name: "synthetic_db" }] };
      }
      if (queryText.includes("drizzle.__drizzle_migrations")) {
        return {
          rows: [
            {
              migration_hash: "synthetic-migration-hash",
              migration_created_at: 100,
            },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it("does not trust connection-string routing overrides", async () => {
    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl:
        "postgresql://synthetic:placeholder@ep-test-pooler.us-east-2.aws.neon.tech/app?host=127.0.0.1",
      directUrl:
        "postgresql://synthetic:placeholder@ep-test.us-east-2.aws.neon.tech/app?options=endpoint%3Dep-other",
      expectedMigrationCreatedAt: 100,
    });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "unsupported_endpoint",
    });
    expect(operationsIdentityMock.poolCreated).not.toHaveBeenCalled();
    expect(operationsIdentityMock.query).not.toHaveBeenCalled();
  });

  it("keeps distinct Neon compute identities unknown without trusting hostnames alone", async () => {
    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl:
        "postgresql://synthetic:placeholder@ep-first-pooler.us-east-2.aws.neon.tech/app",
      directUrl:
        "postgresql://synthetic:placeholder@ep-second.us-east-2.aws.neon.tech/app",
      expectedMigrationCreatedAt: 100,
    });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "endpoint_unverified",
    });
    expect(operationsIdentityMock.poolCreated).not.toHaveBeenCalled();
  });

  it("requires the source journal timestamp for a matching loopback host", async () => {
    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl: "postgresql://synthetic:placeholder@localhost:5432/app",
      directUrl: "postgresql://synthetic:placeholder@localhost:5432/app",
      expectedMigrationCreatedAt: 101,
    });

    expect(result).toMatchObject({
      status: "mismatch",
      reason: "migration_mismatch",
      pooled: { status: "observed" },
      direct: { status: "observed" },
    });
    expect(operationsIdentityMock.poolCreated).toHaveBeenCalledTimes(2);
    expect(
      operationsIdentityMock.query.mock.calls.some(([query]) =>
        query.includes("created_at AS migration_created_at")
      )
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic_db");
    expect(JSON.stringify(result)).not.toContain("synthetic-migration-hash");
  });

  it("does not treat IPv4 and IPv6 loopback hosts as the same endpoint", async () => {
    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl: "postgresql://synthetic:placeholder@127.0.0.1:5432/app",
      directUrl: "postgresql://synthetic:placeholder@[::1]:5432/app",
      expectedMigrationCreatedAt: 100,
    });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "endpoint_unverified",
      pooled: { status: "unknown", reason: "endpoint_unverified" },
      direct: { status: "unknown", reason: "endpoint_unverified" },
    });
    expect(operationsIdentityMock.poolCreated).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /127\.0\.0\.1|::1|app|synthetic/i
    );
  });

  it("does not resolve localhost to an IPv4 loopback endpoint", async () => {
    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl: "postgresql://synthetic:placeholder@localhost:5432/app",
      directUrl: "postgresql://synthetic:placeholder@127.0.0.1:5432/app",
      expectedMigrationCreatedAt: 100,
    });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "endpoint_unverified",
    });
    expect(operationsIdentityMock.poolCreated).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(
      /localhost|127\.0\.0\.1|app|synthetic/i
    );
  });

  it("observes matching endpoints only after both expected journal probes", async () => {
    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl:
        "postgresql://synthetic:placeholder@ep-test-pooler.us-east-2.aws.neon.tech/app",
      directUrl:
        "postgresql://synthetic:placeholder@ep-test.us-east-2.aws.neon.tech/app",
      expectedMigrationCreatedAt: 100,
    });

    expect(result).toMatchObject({
      status: "observed",
      value: "same-database",
      pooled: { status: "observed" },
      direct: { status: "observed" },
    });
    expect(operationsIdentityMock.poolCreated).toHaveBeenCalledTimes(2);
  });

  it("keeps one endpoint failure partial and redacted", async () => {
    operationsIdentityMock.query.mockImplementation(
      async (queryText, poolIndex) => {
        if (
          poolIndex === 2 &&
          queryText.includes("drizzle.__drizzle_migrations")
        ) {
          throw new Error("synthetic private database failure");
        }
        if (queryText.includes("current_database()")) {
          return { rows: [{ database_name: "synthetic_db" }] };
        }
        if (queryText.includes("drizzle.__drizzle_migrations")) {
          return {
            rows: [
              {
                migration_hash: "synthetic-migration-hash",
                migration_created_at: 100,
              },
            ],
          };
        }
        return { rows: [] };
      }
    );

    const readDatabaseIdentity = await loadActualDatabaseIdentity();
    const result = await readDatabaseIdentity({
      pooledUrl:
        "postgresql://synthetic:placeholder@ep-test-pooler.us-east-2.aws.neon.tech/app",
      directUrl:
        "postgresql://synthetic:placeholder@ep-test.us-east-2.aws.neon.tech/app",
      expectedMigrationCreatedAt: 100,
    });

    expect(result).toMatchObject({
      status: "unknown",
      reason: "migration_unavailable",
      pooled: { status: "observed" },
      direct: { status: "unknown", reason: "migration_unavailable" },
    });
    expect(JSON.stringify(result)).not.toContain("synthetic private");
  });
});

async function loadActualDatabaseIdentity() {
  vi.doMock("pg", () => ({
    Pool: class {
      private readonly index: number;

      constructor() {
        operationsIdentityMock.poolCreated();
        this.index = operationsIdentityMock.poolCreated.mock.calls.length;
      }

      on(_event: string, _listener: () => void) {
        return this;
      }

      async connect() {
        return {
          query: (queryText: string) =>
            operationsIdentityMock.query(queryText, this.index),
          release: vi.fn<() => void>(),
        };
      }

      end = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    },
  }));
  type DatabaseIdentityReader = (input: {
    pooledUrl: string | undefined;
    directUrl: string | undefined;
    expectedMigrationCreatedAt?: number;
  }) => Promise<DatabaseIdentity>;
  return (
    await vi.importActual<{
      readDatabaseIdentity: DatabaseIdentityReader;
    }>("@/db/services/operations-identity")
  ).readDatabaseIdentity;
}

it("keeps the identity query invisible when the admin gate denies the caller", async () => {
  const requireAdmin = vi
    .spyOn(adminProcedureDependencies, "requireAdminScopeFor")
    .mockRejectedValue(new AdminNotFoundError());

  await expect(operationsIdentityCaller()()).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(requireAdmin).toHaveBeenCalledTimes(1);
  expect(requireAdmin).toHaveBeenCalledWith(scope);
});
