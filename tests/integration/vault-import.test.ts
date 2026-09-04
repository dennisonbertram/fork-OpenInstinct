import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import type { AccessScope } from "@/lib/access-scope";
import { serializeLoginVaultPayload } from "@/lib/vault";
import * as schema from "../../db/schema";

const databases: PGlite[] = [];

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("vault bulk import", () => {
  it("rolls back the whole batch when item two fails", async () => {
    const harness = await loadVault();
    const secrets = await import("@/db/services/secrets");
    const originalWrite = secrets.writeEncryptedSecret;
    let writes = 0;
    const writeSecret = vi
      .spyOn(secrets, "writeEncryptedSecret")
      .mockImplementation(async (scope, id, encryptedValue, executor) => {
        writes += 1;
        if (writes === 2) throw new Error("simulated item-two storage failure");
        return originalWrite(scope, id, encryptedValue, executor);
      });
    const { appRouter } = await import("@/trpc/router");
    const caller = appRouter.createCaller({
      origin: "https://example.test",
      scope: harness.scope,
    });
    const items = loginItems();

    try {
      await expect(caller.vault.import(items)).rejects.toThrow(
        "simulated item-two storage failure"
      );
    } finally {
      writeSecret.mockRestore();
    }
    expect(
      await harness.client.query(
        "SELECT count(*)::int AS count FROM vault_items WHERE workspace_id = 'workspace:vault-red'"
      )
    ).toMatchObject({ rows: [{ count: 0 }] });
    expect(
      await harness.client.query(
        "SELECT count(*)::int AS count FROM encrypted_secrets WHERE workspace_id = 'workspace:vault-red' AND namespace = 'vault'"
      )
    ).toMatchObject({ rows: [{ count: 0 }] });
  });

  it("does not duplicate records when an identical import batch is retried", async () => {
    const harness = await loadVault();
    const { appRouter } = await import("@/trpc/router");
    const caller = appRouter.createCaller({
      origin: "https://example.test",
      scope: harness.scope,
    });
    const items = loginItems();

    await caller.vault.import(items);
    await caller.vault.import(items);
    const [storedBatch] = (
      await harness.client.query<{ batch_key: string }>(
        "SELECT batch_key FROM vault_import_batches WHERE workspace_id = 'workspace:vault-red'"
      )
    ).rows;
    if (!storedBatch) throw new Error("Expected a stored import batch.");
    expect(storedBatch.batch_key).not.toBe(
      createHash("sha256").update(JSON.stringify(items)).digest("hex")
    );
    expect(
      await harness.client.query(
        "SELECT count(*)::int AS count FROM vault_items WHERE workspace_id = 'workspace:vault-red'"
      )
    ).toMatchObject({ rows: [{ count: 2 }] });
  });

  it("uses one batched secret-presence read for N vault items", async () => {
    const harness = await loadVault();
    const vault = await import("@/db/services/vault");
    const secrets = await import("@/db/services/secrets");
    for (const item of loginItems()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Seed each item before measuring the read path.
      await vault.saveVaultItem(harness.scope, item);
    }
    const readSecret = vi.spyOn(secrets, "readEncryptedSecrets");

    const items = await vault.readVaultItems(harness.scope);

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.hasSecret)).toBe(true);
    expect(readSecret).toHaveBeenCalledTimes(1);
    readSecret.mockRestore();
  });

  it("does not orphan an encrypted secret when single-item metadata fails", async () => {
    const harness = await loadVault();
    await harness.client.exec("DROP TABLE vault_items CASCADE");

    await expect(
      (async () => {
        const vault = await import("@/db/services/vault");
        const [item] = loginItems();
        if (!item) throw new Error("Expected a vault fixture item.");
        await vault.saveVaultItem(harness.scope, item);
      })()
    ).rejects.toThrow(/vault_items|does not exist|relation/i);
    expect(
      await harness.client.query(
        "SELECT count(*)::int AS count FROM encrypted_secrets WHERE workspace_id = 'workspace:vault-red' AND namespace = 'vault'"
      )
    ).toMatchObject({ rows: [{ count: 0 }] });
  });
});

function loginItems() {
  return ["first", "second"].map((label) => ({
    account: "",
    kind: "login" as const,
    label,
    secret: serializeLoginVaultPayload({
      authentication: { password: `${label}-password`, type: "password" },
      identifier: { type: "email", value: `${label}@example.test` },
      kind: "login",
      origin: "https://example.test",
      version: 2,
    }),
  }));
}

async function loadVault() {
  const client = new PGlite();
  databases.push(client);
  await applyAllMigrations(client);
  setDatabaseForIntegrationTest(drizzle(client, { schema }));
  const scope: AccessScope = {
    userId: "vault-red-user",
    workspaceId: "workspace:vault-red",
  };
  const scopeService = await import("@/db/services/scope");
  await scopeService.ensureScope(scope);
  return { client, scope };
}

async function applyAllMigrations(database: PGlite) {
  const names = (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  for (const migrationName of names) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Migration files must execute in committed order.
    const migration = await readFile(
      new URL(`../../db/migrations/${migrationName}`, import.meta.url),
      "utf8"
    );
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Migration statements must execute in committed order.
        await database.exec(statement);
      }
  }
}
