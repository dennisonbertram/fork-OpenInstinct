import { and, eq, inArray } from "drizzle-orm";
import type { AccessScope } from "@/lib/access-scope";
import { db, encryptedSecrets } from "@/db";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeEncryptedSecret(
  scope: AccessScope,
  id: string,
  encryptedValue: string,
  executor: Executor = db
) {
  const updatedAt = new Date();
  await executor
    .insert(encryptedSecrets)
    .values({
      encryptedValue,
      id,
      namespace: "vault",
      updatedAt,
      workspaceId: scope.workspaceId,
    })
    .onConflictDoUpdate({
      target: [
        encryptedSecrets.workspaceId,
        encryptedSecrets.namespace,
        encryptedSecrets.id,
      ],
      set: { encryptedValue, updatedAt },
    });
}

export async function readEncryptedSecrets(
  scope: AccessScope,
  ids: readonly string[],
  executor: Executor = db
) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await executor
    .select({
      encryptedValue: encryptedSecrets.encryptedValue,
      id: encryptedSecrets.id,
    })
    .from(encryptedSecrets)
    .where(
      and(
        eq(encryptedSecrets.workspaceId, scope.workspaceId),
        eq(encryptedSecrets.namespace, "vault"),
        inArray(encryptedSecrets.id, ids)
      )
    );
  return new Map(rows.map((row) => [row.id, row.encryptedValue]));
}

export async function readEncryptedSecret(
  scope: AccessScope,
  id: string,
  executor: Executor = db
) {
  const rows = await executor
    .select({ encryptedValue: encryptedSecrets.encryptedValue })
    .from(encryptedSecrets)
    .where(
      and(
        eq(encryptedSecrets.workspaceId, scope.workspaceId),
        eq(encryptedSecrets.namespace, "vault"),
        eq(encryptedSecrets.id, id)
      )
    )
    .limit(1);
  return rows[0]?.encryptedValue;
}

export async function deleteEncryptedSecret(
  scope: AccessScope,
  id: string,
  executor: Executor = db
) {
  await executor
    .delete(encryptedSecrets)
    .where(
      and(
        eq(encryptedSecrets.workspaceId, scope.workspaceId),
        eq(encryptedSecrets.namespace, "vault"),
        eq(encryptedSecrets.id, id)
      )
    );
}
