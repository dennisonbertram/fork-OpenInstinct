import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseIdentity } from "@/db/services/operations-identity";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import { AdminNotFoundError } from "@/lib/admin";
import { adminProcedureDependencies } from "@/trpc/init";
import * as schema from "../../db/schema";

const operationsIdentityMock = vi.hoisted(() => ({
  readDatabaseIdentity:
    vi.fn<
      (input: {
        pooledUrl: string | undefined;
        directUrl: string | undefined;
        expectedMigrationCreatedAt?: number;
      }) => Promise<DatabaseIdentity>
    >(),
}));

vi.mock("@/db/services/operations-identity", () => ({
  readDatabaseIdentity: operationsIdentityMock.readDatabaseIdentity,
}));

const databases: PGlite[] = [];
const originalRequireAdminScopeFor =
  adminProcedureDependencies.requireAdminScopeFor;

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  adminProcedureDependencies.requireAdminScopeFor =
    originalRequireAdminScopeFor;
  operationsIdentityMock.readDatabaseIdentity.mockReset();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("admin operations identity query", () => {
  it("is hidden when the existing admin gate denies the caller", async () => {
    const service = await loadRouter(false);

    await expect(
      service.caller.admin.operationsIdentity()
    ).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<TRPCError>);
  });

  it("returns partial redacted facts to an authorized admin", async () => {
    const service = await loadRouter(true);
    const result = await service.caller.admin.operationsIdentity();

    expect(Number.isNaN(Date.parse(result.capturedAt))).toBe(false);
    if (result.serverOrigin.status !== "observed") {
      throw new Error("The configured public server origin was not observed.");
    }
    expect(result.serverOrigin.value).toBe("https://example.com");

    const payload = JSON.stringify(result);
    const safeOriginValue = JSON.stringify(result.serverOrigin.value);
    expect(
      /https?:\/\/|postgres(?:ql)?:\/\/|(?:password|token|secret|connectionstring)\s*[:=]/i.test(
        payload.replace(safeOriginValue, "")
      )
    ).toBe(false);
    expect(
      /"(?:url|host|token|secret|password|connectionString)"\s*:/i.test(payload)
    ).toBe(false);

    const facts = Object.values(result.facts);
    expect(facts.length).toBeGreaterThan(0);
    expect(
      facts.every((fact) =>
        ["observed", "unknown", "mismatch"].includes(fact.status)
      )
    ).toBe(true);
    expect(facts.some((fact) => fact.status === "unknown")).toBe(true);
  });
});

async function loadRouter(allowed: boolean) {
  const client = await createDatabase();
  setDatabaseForIntegrationTest(drizzle(client, { schema }));
  adminProcedureDependencies.requireAdminScopeFor = async (scope) => {
    if (!allowed) throw new AdminNotFoundError();
    return scope;
  };
  operationsIdentityMock.readDatabaseIdentity.mockResolvedValue({
    status: "unknown",
    reason: "configuration_missing",
  });
  const { appRouter } = await import("@/trpc/router");
  const scope = {
    userId: "better-auth:synthetic-operator",
    workspaceId: "personal:synthetic-operator",
  };
  return {
    caller: appRouter.createCaller({ origin: "https://example.test", scope }),
  };
}

async function createDatabase() {
  const client = new PGlite();
  databases.push(client);
  for (const migrationName of (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Migrations run in committed order.
    const migration = await readFile(
      new URL(`../../db/migrations/${migrationName}`, import.meta.url),
      "utf8"
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Migration statements run in committed order.
        await client.exec(statement);
      }
    }
  }
  return client;
}
