import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  loginAccountHint,
  parsePaymentCardSecret,
  parseLoginVaultPayload,
  paymentCardBrand,
  vaultItemKindSchema,
  type VaultCreateItem,
} from "@/lib/vault";
import type { AccessScope } from "@/lib/access-scope";
import { db, vaultImportBatches, vaultItems } from "@/db";
import {
  deleteEncryptedSecret,
  readEncryptedSecret,
  readEncryptedSecrets,
  writeEncryptedSecret,
} from "@/db/services/secrets";
import { ensureScope } from "@/db/services/scope";
import { getInstallationSecrets } from "@/lib/installation-secrets";

const vaultRecordSchema = z.object({
  account: z.string(),
  createdAt: z.string(),
  id: z.string(),
  kind: vaultItemKindSchema,
  label: z.string(),
  updatedAt: z.string(),
});

type VaultRecord = z.infer<typeof vaultRecordSchema>;
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const selection = {
  account: vaultItems.account,
  createdAt: vaultItems.createdAt,
  id: vaultItems.id,
  kind: vaultItems.kind,
  label: vaultItems.label,
  updatedAt: vaultItems.updatedAt,
};

async function createVaultRecord(
  scope: AccessScope,
  record: VaultRecord,
  executor: Executor = db
) {
  await executor.insert(vaultItems).values({
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    workspaceId: scope.workspaceId,
  });
}

export async function listVaultItems(scope: AccessScope) {
  return vaultRecordSchema
    .array()
    .parse(
      (
        await db
          .select(selection)
          .from(vaultItems)
          .where(eq(vaultItems.workspaceId, scope.workspaceId))
          .orderBy(desc(vaultItems.updatedAt))
      ).map(serializeVaultRecord)
    );
}

export async function readVaultItems(scope: AccessScope) {
  await ensureScope(scope);
  const records = await listVaultItems(scope);
  const secretIds = await readEncryptedSecrets(
    scope,
    records.map((record) => record.id)
  );
  return Promise.all(
    records.map(async (record) =>
      Object.assign({}, record, { hasSecret: secretIds.has(record.id) })
    )
  );
}

export async function readVaultItem(scope: AccessScope, id: string) {
  const rows = await db
    .select(selection)
    .from(vaultItems)
    .where(
      and(eq(vaultItems.workspaceId, scope.workspaceId), eq(vaultItems.id, id))
    )
    .limit(1);
  return vaultRecordSchema
    .optional()
    .parse(rows[0] ? serializeVaultRecord(rows[0]) : undefined);
}

export async function deleteVaultItem(scope: AccessScope, id: string) {
  const rows = await db
    .delete(vaultItems)
    .where(
      and(eq(vaultItems.workspaceId, scope.workspaceId), eq(vaultItems.id, id))
    )
    .returning({ id: vaultItems.id });
  if (rows.length === 0) return false;
  await deleteEncryptedSecret(scope, id);
  return true;
}

export async function saveVaultItem(
  scope: AccessScope,
  input: VaultCreateItem
) {
  await ensureScope(scope);
  await db.transaction(async (transaction) => {
    await saveVaultItemInExecutor(scope, input, transaction);
  });
}

export async function saveVaultItems(
  scope: AccessScope,
  inputs: readonly VaultCreateItem[]
) {
  await ensureScope(scope);
  const { secretEncryptionKey } = await getInstallationSecrets();
  const batchHmacKey = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secretEncryptionKey, "base64"),
      Buffer.alloc(0),
      "vault-import-batch-hmac-v1",
      32
    )
  );
  const batchKey = createHmac("sha256", batchHmacKey)
    .update(
      `vault-import:v1:${scope.workspaceId}\u0000${JSON.stringify(inputs)}`
    )
    .digest("hex");
  await db.transaction(async (transaction) => {
    const inserted = await transaction
      .insert(vaultImportBatches)
      .values({ batchKey, workspaceId: scope.workspaceId })
      .onConflictDoNothing()
      .returning({ batchKey: vaultImportBatches.batchKey });
    if (inserted.length === 0) return;
    for (const input of inputs) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Preserve source order within one atomic batch.
      await saveVaultItemInExecutor(scope, input, transaction);
    }
  });
}

async function saveVaultItemInExecutor(
  scope: AccessScope,
  input: VaultCreateItem,
  executor: Executor
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  await writeVaultSecret(scope, id, input.secret, executor);
  await createVaultRecord(
    scope,
    {
      account: vaultAccountHint(input),
      createdAt: now,
      id,
      kind: input.kind,
      label: input.label,
      updatedAt: now,
    },
    executor
  );
}

export async function readVaultSecret(scope: AccessScope, id: string) {
  const encrypted = await readEncryptedSecret(scope, id);
  if (!encrypted) return undefined;
  const { secretEncryptionKey } = await getInstallationSecrets();
  return decryptVaultSecret(scope, id, encrypted, secretEncryptionKey);
}

export async function hasVaultSecret(scope: AccessScope, id: string) {
  return (await readEncryptedSecret(scope, id)) !== undefined;
}

async function writeVaultSecret(
  scope: AccessScope,
  id: string,
  value: string,
  executor: Executor = db
) {
  const { secretEncryptionKey } = await getInstallationSecrets();
  await writeEncryptedSecret(
    scope,
    id,
    encryptVaultSecret(scope, id, value, secretEncryptionKey),
    executor
  );
}

function vaultAccountHint(input: VaultCreateItem) {
  switch (input.kind) {
    case "login": {
      const payload = parseLoginVaultPayload(input.secret);
      if (!payload)
        throw new Error("The saved login is incomplete or invalid.");
      return loginAccountHint(
        payload.identifier,
        "origin" in payload ? payload.origin : undefined
      );
    }
    case "payment": {
      const card = parsePaymentCardSecret(input.secret);
      return `${paymentCardBrand(card.number)} · •••• ${card.number.slice(-4)}`;
    }
    case "address":
    case "contact":
      return "";
  }
  throw new Error("Unsupported vault item kind.");
}

function encryptVaultSecret(
  scope: AccessScope,
  id: string,
  value: string,
  secretEncryptionKey: string
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(secretEncryptionKey, "base64"),
    iv
  );
  cipher.setAAD(vaultSecretAad(scope, id));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptVaultSecret(
  scope: AccessScope,
  id: string,
  value: string,
  secretEncryptionKey: string
) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("The stored secret uses an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(secretEncryptionKey, "base64"),
    Buffer.from(encodedIv, "base64url")
  );
  decipher.setAAD(vaultSecretAad(scope, id));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function vaultSecretAad(scope: AccessScope, id: string) {
  return Buffer.from(`${scope.workspaceId}\u0000vault\u0000${id}`);
}

function serializeVaultRecord<T extends { createdAt: Date; updatedAt: Date }>(
  record: T
) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
