import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { AccessScope } from "@/lib/access-scope";
import { getInstallationSecrets } from "@/lib/installation-secrets";
import {
  db,
  webhookDeliveries,
  webhookEndpoints,
  webhookEvents,
  workspaceMemberships,
} from "@/db";
import { recordAuditEvent } from "./audit";
import { ensureScope } from "./scope";

const maxAttempts = 6;
const claimLeaseMs = 30_000;
export const webhookEventTypes = [
  "agent.published",
  "agent.rolled_back",
  "workspace.suspended",
  "workspace.reactivated",
  "workspace.deletion_started",
] as const;
type WebhookEventType = (typeof webhookEventTypes)[number];
const endpointInputSchema = z.object({
  subscribedEvents: z.array(z.enum(webhookEventTypes)).min(1).max(100),
  url: z.string().trim().min(1).max(2048),
});
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type WebhookEndpointInput = z.input<typeof endpointInputSchema>;
class WebhookUrlRejectedError extends Error {}

export async function registerWebhookEndpoint(
  scope: AccessScope,
  input: WebhookEndpointInput
) {
  const parsed = endpointInputSchema.parse(input);
  const url = await requirePublicHttpsUrl(parsed.url);
  await ensureScope(scope);
  const { secretEncryptionKey } = await getInstallationSecrets();
  const id = randomUUID();
  const secret = webhookSecret();
  const now = new Date();
  const endpoint = await db.transaction(async (transaction) => {
    await requireOwner(transaction, scope);
    const [row] = await transaction
      .insert(webhookEndpoints)
      .values({
        encryptedSigningSecret: encryptWebhookSecret(
          id,
          secret,
          secretEncryptionKey
        ),
        id,
        subscribedEvents: [...new Set(parsed.subscribedEvents)],
        url,
        workspaceId: scope.workspaceId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error("Failed to register webhook endpoint.");
    return withoutSecret(row);
  });
  recordAudit(scope, {
    action: "webhook_endpoint.register",
    target: id,
  });
  return { endpoint, secret };
}

export async function listWebhookEndpoints(scope: AccessScope) {
  await ensureScope(scope);
  return db.transaction(async (transaction) => {
    const owner = await isOwner(transaction, scope);
    if (!owner) return [];
    return (
      await transaction
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.workspaceId, scope.workspaceId))
    ).map(withoutSecret);
  });
}

export async function disableWebhookEndpoint(
  scope: AccessScope,
  endpointId: string
) {
  await ensureScope(scope);
  const now = new Date();
  const disabled = await db.transaction(async (transaction) => {
    await requireOwner(transaction, scope);
    const rows = await transaction
      .update(webhookEndpoints)
      .set({
        disabledAt: now,
        status: "disabled",
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookEndpoints.id, endpointId),
          eq(webhookEndpoints.workspaceId, scope.workspaceId),
          eq(webhookEndpoints.status, "active")
        )
      )
      .returning({ id: webhookEndpoints.id });
    if (rows.length === 0) return false;
    await transaction
      .update(webhookDeliveries)
      .set({
        claimExpiresAt: null,
        claimToken: null,
        outcome: "dead",
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookDeliveries.endpointId, endpointId),
          eq(webhookDeliveries.workspaceId, scope.workspaceId),
          inArray(webhookDeliveries.outcome, ["pending", "failed"])
        )
      );
    return true;
  });
  if (disabled)
    recordAudit(scope, {
      action: "webhook_endpoint.disable",
      target: endpointId,
    });
  return disabled;
}

export async function rotateWebhookSecret(
  scope: AccessScope,
  endpointId: string
) {
  await ensureScope(scope);
  const { secretEncryptionKey } = await getInstallationSecrets();
  const secret = webhookSecret();
  const now = new Date();
  const endpoint = await db.transaction(async (transaction) => {
    await requireOwner(transaction, scope);
    const [row] = await transaction
      .update(webhookEndpoints)
      .set({
        encryptedSigningSecret: encryptWebhookSecret(
          endpointId,
          secret,
          secretEncryptionKey
        ),
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookEndpoints.id, endpointId),
          eq(webhookEndpoints.workspaceId, scope.workspaceId),
          eq(webhookEndpoints.status, "active")
        )
      )
      .returning();
    return row ? withoutSecret(row) : undefined;
  });
  if (endpoint)
    recordAudit(scope, {
      action: "webhook_endpoint.rotate_secret",
      target: endpointId,
    });
  return endpoint ? { endpoint, secret } : undefined;
}

export async function emitWebhookEvent(
  executor: Executor,
  scope: AccessScope,
  input: {
    readonly type: WebhookEventType;
    readonly payload: Record<string, string>;
    readonly correlationId?: string;
  }
) {
  assertSafePayload(input.payload);
  const now = new Date();
  const eventId = randomUUID();
  const [event] = await executor
    .insert(webhookEvents)
    .values({
      correlationId: input.correlationId,
      createdAt: now,
      id: eventId,
      payload: input.payload,
      type: input.type,
      workspaceId: scope.workspaceId,
    })
    .returning();
  if (!event) throw new Error("Failed to record webhook event.");
  return event;
}

export async function drainWebhookDeliveries({
  limit = 50,
  fetchImpl,
}: { readonly limit?: number; readonly fetchImpl?: typeof fetch } = {}) {
  const { secretEncryptionKey } = await getInstallationSecrets();
  const now = new Date();
  await db
    .update(webhookDeliveries)
    .set({ outcome: "dead", updatedAt: now })
    .where(
      and(
        inArray(webhookDeliveries.outcome, ["pending", "failed"]),
        gte(webhookDeliveries.attempt, maxAttempts)
      )
    );
  await fanOutWebhookEvents();
  const summary = { dead: 0, delivered: 0, failed: 0 };
  for (let index = 0; index < Math.max(1, Math.min(limit, 500)); index += 1) {
    // Keep the claim transaction short; external delivery must never run under it.
    // eslint-disable-next-line no-await-in-loop
    const result = await db.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          delivery: webhookDeliveries,
          endpoint: webhookEndpoints,
          event: webhookEvents,
        })
        .from(webhookDeliveries)
        .innerJoin(
          webhookEndpoints,
          eq(webhookDeliveries.endpointId, webhookEndpoints.id)
        )
        .innerJoin(
          webhookEvents,
          eq(webhookDeliveries.eventId, webhookEvents.id)
        )
        .where(
          and(
            eq(webhookEndpoints.status, "active"),
            lte(webhookDeliveries.nextAttemptAt, new Date()),
            inArray(webhookDeliveries.outcome, ["pending", "failed"]),
            lte(webhookDeliveries.attempt, maxAttempts - 1),
            or(
              isNull(webhookDeliveries.claimExpiresAt),
              lte(webhookDeliveries.claimExpiresAt, new Date())
            )
          )
        )
        .for("update", { skipLocked: true })
        .limit(1);
      if (!row) return undefined;
      const claimToken = randomUUID();
      const claimExpiresAt = new Date(Date.now() + claimLeaseMs);
      const [claimed] = await transaction
        .update(webhookDeliveries)
        .set({
          claimExpiresAt,
          claimToken,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(webhookDeliveries.id, row.delivery.id),
            or(
              isNull(webhookDeliveries.claimExpiresAt),
              lte(webhookDeliveries.claimExpiresAt, new Date())
            )
          )
        )
        .returning({ id: webhookDeliveries.id });
      return claimed
        ? {
            ...row,
            delivery: { ...row.delivery, claimExpiresAt, claimToken },
          }
        : undefined;
    });
    if (!result) break;
    // The network operation intentionally runs after the claim transaction commits.
    // eslint-disable-next-line no-await-in-loop
    const outcome = await deliver(
      db,
      result.delivery,
      result.endpoint,
      result.event,
      fetchImpl,
      secretEncryptionKey
    );
    summary[outcome] += 1;
  }
  return summary;
}

async function fanOutWebhookEvents() {
  const now = new Date();
  await db.transaction(async (transaction) => {
    const events = await transaction
      .select()
      .from(webhookEvents)
      .where(isNull(webhookEvents.fannedOutAt))
      .for("update", { skipLocked: true });
    for (const event of events) {
      // Each event must fan out and be marked atomically before the next event.
      // eslint-disable-next-line no-await-in-loop
      const endpointRows = await transaction
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.workspaceId, event.workspaceId),
            eq(webhookEndpoints.status, "active")
          )
        );
      const endpoints = endpointRows.filter((endpoint) => {
        const subscribedEvents = z
          .array(z.string())
          .safeParse(endpoint.subscribedEvents);
        return subscribedEvents.success
          ? subscribedTo(subscribedEvents.data, event.type)
          : false;
      });
      if (endpoints.length > 0) {
        // eslint-disable-next-line no-await-in-loop -- Same transaction as event marking.
        await transaction.insert(webhookDeliveries).values(
          endpoints.map((endpoint) => ({
            createdAt: now,
            endpointId: endpoint.id,
            eventId: event.id,
            id: randomUUID(),
            nextAttemptAt: now,
            updatedAt: now,
            workspaceId: event.workspaceId,
          }))
        );
      }
      // eslint-disable-next-line no-await-in-loop -- Same transaction as delivery fan-out.
      await transaction
        .update(webhookEvents)
        .set({ fannedOutAt: now })
        .where(eq(webhookEvents.id, event.id));
    }
  });
}

async function deliver(
  executor: Executor,
  delivery: typeof webhookDeliveries.$inferSelect,
  endpoint: typeof webhookEndpoints.$inferSelect,
  event: typeof webhookEvents.$inferSelect,
  fetchImpl: typeof fetch | undefined,
  secretEncryptionKey: string
): Promise<"dead" | "delivered" | "failed"> {
  const now = new Date();
  let responseStatus: number | null = null;
  let outcome: "dead" | "delivered" | "failed";
  try {
    let resolved: ResolvedWebhookUrl;
    try {
      resolved = await resolvePublicHttpsUrl(endpoint.url);
    } catch {
      throw new WebhookUrlRejectedError(
        "Webhook URL rejected at delivery time."
      );
    }
    const body = JSON.stringify({
      id: event.id,
      type: event.type,
      workspaceId: event.workspaceId,
      createdAt: event.createdAt,
      correlationId: event.correlationId,
      data: event.payload,
    });
    const timestamp = now.toISOString();
    const signature = createHmac(
      "sha256",
      decryptWebhookSecret(
        endpoint.id,
        endpoint.encryptedSigningSecret,
        secretEncryptionKey
      )
    )
      .update(`${timestamp}.${body}`, "utf8")
      .digest("hex");
    const requestInit = {
      body,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oi-event-id": event.id,
        "x-oi-timestamp": timestamp,
        "x-oi-signature": `v1=${signature}`,
      },
    } satisfies WebhookRequestInit;
    const response = fetchImpl
      ? await fetchWithTimeout(fetchImpl, resolved.url, requestInit)
      : await fetchPinnedWithTimeout(resolved, requestInit);
    responseStatus = response.status;
    await response.body?.cancel();
    outcome =
      response.status >= 200 && response.status < 300
        ? "delivered"
        : response.status === 429 || response.status >= 500
          ? "failed"
          : "dead";
  } catch (error) {
    outcome = error instanceof WebhookUrlRejectedError ? "dead" : "failed";
  }
  const attempt = delivery.attempt + 1;
  if (outcome === "failed" && attempt >= maxAttempts) outcome = "dead";
  const nextAttemptAt =
    outcome === "failed"
      ? new Date(Date.now() + 2 ** delivery.attempt * 60_000)
      : now;
  await executor
    .update(webhookDeliveries)
    .set({
      attempt,
      claimExpiresAt: null,
      claimToken: null,
      outcome,
      responseStatus,
      nextAttemptAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(webhookDeliveries.id, delivery.id),
        eq(webhookDeliveries.workspaceId, delivery.workspaceId),
        eq(webhookDeliveries.claimToken, delivery.claimToken ?? "")
      )
    );
  return outcome;
}

function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10_000);
  return fetchImpl(url, {
    ...init,
    redirect: "manual",
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
}

interface ResolvedWebhookAddress {
  readonly address: string;
  readonly family: 4 | 6;
}
interface ResolvedWebhookUrl {
  readonly addresses: readonly ResolvedWebhookAddress[];
  readonly url: string;
}
interface WebhookRequestInit extends RequestInit {
  readonly body?: string;
}

function fetchPinnedWithTimeout(
  resolved: ResolvedWebhookUrl,
  init: WebhookRequestInit
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10_000);
  return requestPinnedHttps(resolved, {
    ...init,
    redirect: "manual",
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
}

function requestPinnedHttps(
  resolved: ResolvedWebhookUrl,
  init: WebhookRequestInit
): Promise<Response> {
  const parsed = new URL(resolved.url);
  const address = resolved.addresses[0];
  if (!address) return Promise.reject(new Error("No public webhook address."));
  const headers = new Headers(init.headers);
  headers.set("host", parsed.host);
  const options: RequestOptions = {
    headers: Object.fromEntries(headers.entries()),
    hostname: address.address,
    lookup: (_hostname, _options, callback) => {
      callback(null, address.address, address.family);
    },
    method: init.method,
    path: `${parsed.pathname}${parsed.search}`,
    port: parsed.port ? Number(parsed.port) : 443,
    rejectUnauthorized: true,
    servername: parsed.hostname.replace(/^\[|\]$/gu, ""),
    signal: init.signal ?? undefined,
  };
  return new Promise((resolve, reject) => {
    const request = httpsRequest(options, (response) => {
      response.on("error", () => {
        // The delivery outcome is already determined by the status once
        // headers arrive; body errors must not create an unhandled rejection.
      });
      // Webhook delivery only needs the status. Destroy the body stream
      // without buffering or indefinitely draining untrusted response data.
      response.destroy();
      resolve(
        new Response(null, {
          headers: Object.fromEntries(
            Object.entries(response.headers).flatMap(([key, value]) =>
              Array.isArray(value)
                ? value.map((item) => [key, item] as const)
                : value === undefined
                  ? []
                  : [[key, value] as const]
            )
          ),
          status: response.statusCode ?? 599,
        })
      );
    });
    request.on("error", reject);
    if (init.body === undefined) request.end();
    else request.end(init.body);
  });
}

function subscribedTo(value: readonly string[], type: string) {
  return value.some((event) => event === type);
}

function assertSafePayload(payload: Record<string, string>) {
  for (const key of Object.keys(payload)) {
    if (/secret|phone|password|token|credential/i.test(key))
      throw new Error(
        "Webhook payloads may only contain identifier and type fields."
      );
  }
}

function withoutSecret({
  encryptedSigningSecret: _secret,
  ...endpoint
}: typeof webhookEndpoints.$inferSelect) {
  return endpoint;
}

function recordAudit(
  scope: AccessScope,
  event: Parameters<typeof recordAuditEvent>[1]
) {
  void recordAuditEvent(scope, event).catch(() => {
    console.warn("[audit] event recording failed");
  });
}

async function requireOwner(executor: Executor, scope: AccessScope) {
  if (!(await isOwner(executor, scope)))
    throw new Error("Only workspace owners can manage webhook endpoints.");
}
async function isOwner(executor: Executor, scope: AccessScope) {
  const [membership] = await executor
    .select({
      role: workspaceMemberships.role,
      status: workspaceMemberships.status,
    })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, scope.workspaceId),
        eq(workspaceMemberships.userId, scope.userId)
      )
    )
    .limit(1);
  return membership?.role === "owner" && membership.status === "active";
}

function webhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}
function derivedKey(secretEncryptionKey: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secretEncryptionKey, "base64"),
      Buffer.alloc(0),
      "webhook-endpoint-aead",
      32
    )
  );
}
function aad(id: string) {
  return Buffer.from(`webhook-endpoint\u0000${id}`);
}
function encryptWebhookSecret(
  id: string,
  secret: string,
  secretEncryptionKey: string
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    derivedKey(secretEncryptionKey),
    iv
  );
  cipher.setAAD(aad(id));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export async function encryptWebhookSecretForTest(id: string, secret: string) {
  const { secretEncryptionKey } = await getInstallationSecrets();
  return encryptWebhookSecret(id, secret, secretEncryptionKey);
}
export async function decryptWebhookSecretForTest(id: string, value: string) {
  const { secretEncryptionKey } = await getInstallationSecrets();
  return decryptWebhookSecret(id, value, secretEncryptionKey);
}
function decryptWebhookSecret(
  id: string,
  value: string,
  secretEncryptionKey: string
) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("The stored webhook secret uses an unsupported format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey(secretEncryptionKey),
    Buffer.from(iv, "base64url")
  );
  decipher.setAAD(aad(id));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function requirePublicHttpsUrl(value: string) {
  return (await resolvePublicHttpsUrl(value)).url;
}

async function resolvePublicHttpsUrl(
  value: string
): Promise<ResolvedWebhookUrl> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Webhook URL must be a valid public HTTPS URL.");
  }
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/, "");
  if (parsed.protocol !== "https:" || !host || isPrivateHost(host))
    throw new Error("Webhook URL must be a public HTTPS URL.");
  let addresses: readonly ResolvedWebhookAddress[];
  try {
    addresses = isIpLiteral(host)
      ? [{ address: host, family: isIpv4(host) ? 4 : 6 }]
      : (await lookup(host, { all: true, order: "verbatim" })).map(
          ({ address, family }) => ({
            address,
            family: family === 6 ? 6 : 4,
          })
        );
  } catch {
    throw new Error("Webhook URL DNS resolution failed.");
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new Error("Webhook URL must resolve only to public addresses.");
  parsed.username = "";
  parsed.password = "";
  return { addresses, url: parsed.toString() };
}
function isPrivateHost(host: string) {
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata" ||
    host.includes("metadata.google.internal") ||
    (host.includes(":") && !isPublicAddress(host))
  )
    return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part)))
    return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const a = octets[0];
  const b = octets[1];
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 ||
    (a === 192 && b === 0) ||
    (a === 198 && b >= 51 && b <= 52) ||
    (a === 203 && b === 0 && octets[2] === 113)
  );
}

function isIpLiteral(host: string) {
  return isIpv4(host) || host.includes(":");
}

function isPublicAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0] ?? address;
  if (isIpv4(normalized)) return !isPrivateIpv4(normalized);
  const words = parseIpv6(normalized);
  if (!words) return false;
  const first = words[0] ?? 0;
  const mapped =
    words.slice(0, 6).every((word) => word === 0) && words[6] === 0xffff;
  if (mapped) {
    const mappedIpv4 = words
      .slice(6)
      .map((word) => {
        return `${(word >> 8).toString()}.${(word & 0xff).toString()}`;
      })
      .join(".");
    return !isPrivateIpv4(mappedIpv4);
  }
  return (
    !words.every((word) => word === 0) &&
    !words.every((word, index) => word === (index === 7 ? 1 : 0)) &&
    (first & 0xfe00) !== 0xfc00 &&
    (first & 0xffc0) !== 0xfe80 &&
    (first & 0xff00) !== 0xff00
  );
}

function isIpv4(value: string) {
  return /^\d+(?:\.\d+){3}$/u.test(value);
}

function isPrivateIpv4(value: string) {
  if (!isIpv4(value)) return true;
  const octets = value.split(".").map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a, b] = octets;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b >= 51 && b <= 52) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function parseIpv6(value: string) {
  if (!value.includes(":")) return undefined;
  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (
    left.some((part) => !/^[0-9a-f]{1,4}$/u.test(part)) ||
    right.some((part) => !/^[0-9a-f]{1,4}$/u.test(part))
  )
    return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return undefined;
  return [...left, ...Array.from({ length: missing }, () => "0"), ...right].map(
    (part) => parseInt(part, 16)
  );
}
