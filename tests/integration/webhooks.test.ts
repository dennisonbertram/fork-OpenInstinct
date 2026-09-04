/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- The fake Node HTTPS transport implements only the request/response event surface exercised by pinned delivery. */
import { EventEmitter } from "node:events";
import { createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  db,
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import * as schema from "../../db/schema";

interface LookupOptions {
  readonly all?: boolean;
  readonly family?: number;
}
interface PinnedRequestOptions {
  readonly headers?: Record<string, string>;
  readonly hostname?: string;
  readonly lookup?: (
    hostname: string,
    options: LookupOptions,
    callback: (error: Error | null, address?: string, family?: number) => void
  ) => void;
  readonly servername?: string;
}
interface FakeRequest extends EventEmitter {
  end: (body?: string) => void;
}
interface FakeResponse extends EventEmitter {
  destroy: () => void;
  headers: Record<string, string>;
  statusCode: number;
}
type HttpsRequestMock = (
  options: PinnedRequestOptions,
  callback: (response: FakeResponse) => void
) => FakeRequest;

const dnsMocks = vi.hoisted(() => ({
  lookup:
    vi.fn<() => Promise<readonly { address: string; family: number }[]>>(),
}));
vi.mock("node:dns/promises", () => dnsMocks);
const httpsMocks = vi.hoisted(() => ({
  request: vi.fn<HttpsRequestMock>(),
}));
vi.mock("node:https", () => httpsMocks);

const databases: PGlite[] = [];
beforeEach(() => {
  dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});
afterEach(async () => {
  dnsMocks.lookup.mockReset();
  httpsMocks.request.mockReset();
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("webhook outbox", () => {
  it("registers only public HTTPS endpoints, encrypts the one-time secret, and requires an owner", async () => {
    const service = await loadService();
    for (const url of [
      "http://example.test",
      "https://10.0.0.1",
      "https://127.0.0.1",
      "https://localhost",
      "https://169.254.169.254",
      "https://192.168.1.1",
      "https://0.0.0.0",
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each rejected attempt exercises the shared endpoint fixture serially.
      await expect(
        service.webhooks.registerWebhookEndpoint(service.alice, {
          url,
          subscribedEvents: ["agent.published"],
        })
      ).rejects.toThrow(/public HTTPS/i);
    }
    const registered = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://hooks.example.test/path",
        subscribedEvents: ["agent.published"],
      }
    );
    expect(registered.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(
      await service.webhooks.encryptWebhookSecretForTest(
        "iv-test",
        "same-secret"
      )
    ).not.toBe(
      await service.webhooks.encryptWebhookSecretForTest(
        "iv-test",
        "same-secret"
      )
    );
    const [stored] = (
      await service.client.query<{
        id: string;
        encrypted_signing_secret: string;
      }>("SELECT id, encrypted_signing_secret FROM webhook_endpoints")
    ).rows;
    if (!stored) throw new Error("Expected a stored endpoint.");
    expect(stored.encrypted_signing_secret).not.toContain(registered.secret);
    expect(
      await service.webhooks.decryptWebhookSecretForTest(
        stored.id,
        stored.encrypted_signing_secret
      )
    ).toBe(registered.secret);
    await expect(
      service.webhooks.decryptWebhookSecretForTest(
        "wrong",
        stored.encrypted_signing_secret
      )
    ).rejects.toThrow("Unsupported");
    await expect(
      service.webhooks.registerWebhookEndpoint(service.member, {
        url: "https://no.example.test",
        subscribedEvents: ["agent.published"],
      })
    ).rejects.toThrow(/owners/i);
  });

  it("emits only to active subscribed endpoints atomically and keeps tenants isolated", async () => {
    const service = await loadService();
    const subscribed = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      { url: "https://a.example.test", subscribedEvents: ["agent.published"] }
    );
    await service.webhooks.registerWebhookEndpoint(service.alice, {
      url: "https://other.example.test",
      subscribedEvents: ["agent.rolled_back"],
    });
    const disabled = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://disabled.example.test",
        subscribedEvents: ["agent.published"],
      }
    );
    await service.webhooks.disableWebhookEndpoint(
      service.alice,
      disabled.endpoint.id
    );
    await service.webhooks.registerWebhookEndpoint(service.bob, {
      url: "https://b.example.test",
      subscribedEvents: ["agent.published"],
    });
    await service.database.transaction(async (transaction) => {
      await service.webhooks.emitWebhookEvent(transaction, service.alice, {
        type: "agent.published",
        payload: { agentId: "a", revisionId: "r" },
      });
    });
    expect(
      (await service.client.query("SELECT endpoint_id FROM webhook_deliveries"))
        .rows
    ).toEqual([]);
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => new Response("", { status: 500 }),
    });
    expect(
      (await service.client.query("SELECT endpoint_id FROM webhook_deliveries"))
        .rows
    ).toEqual([{ endpoint_id: subscribed.endpoint.id }]);
    await expect(
      service.database.transaction(async (transaction) => {
        await service.webhooks.emitWebhookEvent(transaction, service.alice, {
          type: "agent.published",
          payload: { agentId: "no", revisionId: "no" },
        });
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
    expect(
      (
        await service.client.query(
          "SELECT count(*)::int AS count FROM webhook_events"
        )
      ).rows
    ).toEqual([{ count: 1 }]);
  });

  it("signs and retries deliveries, and makes terminal client errors dead", async () => {
    const service = await loadService();
    const registered = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://hooks.example.test",
        subscribedEvents: ["agent.published"],
      }
    );
    await service.webhooks.emitWebhookEvent(service.database, service.alice, {
      type: "agent.published",
      payload: { agentId: "a", revisionId: "r" },
    });
    let url = "";
    let body = "";
    let headers = new Headers();
    const delivered = await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async (input, requestInit) => {
        const request = new Request(input);
        url = request.url;
        body = await new Response(requestInit?.body ?? null).text();
        headers = new Headers(requestInit?.headers);
        return new Response(null, { status: 204 });
      },
    });
    expect(delivered).toMatchObject({ delivered: 1 });
    expect(url).toBe("https://hooks.example.test/");
    const timestamp = headers.get("x-oi-timestamp");
    if (!timestamp) throw new Error("Expected delivery timestamp.");
    expect(headers.get("x-oi-signature")).toBe(
      `v1=${createHmac("sha256", registered.secret).update(`${timestamp}.${body}`).digest("hex")}`
    );
    await service.client.exec(
      "UPDATE webhook_deliveries SET outcome = 'pending', attempt = 0, next_attempt_at = '2000-01-01T00:00:00.000Z'"
    );
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => new Response("", { status: 500 }),
    });
    expect(
      (
        await service.client.query(
          "SELECT outcome, attempt FROM webhook_deliveries"
        )
      ).rows
    ).toEqual([{ outcome: "failed", attempt: 1 }]);
    await service.client.exec(
      "UPDATE webhook_deliveries SET outcome = 'pending', attempt = 0, next_attempt_at = '2000-01-01T00:00:00.000Z'"
    );
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => new Response("", { status: 404 }),
    });
    expect(
      (await service.client.query("SELECT outcome FROM webhook_deliveries"))
        .rows
    ).toEqual([{ outcome: "dead" }]);
  });

  it("publishing a revision appends an event before the delivery worker fans out", async () => {
    const service = await loadService();
    await service.webhooks.registerWebhookEndpoint(service.alice, {
      url: "https://published.example.test",
      subscribedEvents: ["agent.published"],
    });
    const agent = await service.agents.createAgent(service.alice, {
      slug: "publisher",
    });
    const revision = await service.agents.createRevision(
      service.alice,
      agent.id,
      {
        capabilities: [],
        instructions: "Publish me.",
        modelPolicy: { tier: "standard" },
        version: 1,
      }
    );
    await service.agents.publishRevision(service.alice, agent.id, revision.id);
    expect(
      (await service.client.query("SELECT type, payload FROM webhook_events"))
        .rows
    ).toEqual([
      {
        type: "agent.published",
        payload: { agentId: agent.id, revisionId: revision.id },
      },
    ]);
    expect(
      (
        await service.client.query(
          "SELECT count(*)::int AS count FROM webhook_deliveries"
        )
      ).rows
    ).toEqual([{ count: 0 }]);
  });

  it("scopes owner operations and disables already-pending deliveries", async () => {
    const service = await loadService();
    const registered = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://disable.example.test",
        subscribedEvents: ["agent.published"],
      }
    );
    expect(await service.webhooks.listWebhookEndpoints(service.bob)).toEqual(
      []
    );
    expect(
      await service.webhooks.disableWebhookEndpoint(
        service.bob,
        registered.endpoint.id
      )
    ).toBe(false);
    expect(
      await service.webhooks.rotateWebhookSecret(
        service.bob,
        registered.endpoint.id
      )
    ).toBeUndefined();
    await service.webhooks.emitWebhookEvent(service.database, service.alice, {
      type: "agent.published",
      payload: { agentId: "a", revisionId: "r" },
    });
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => new Response("", { status: 500 }),
    });
    await service.webhooks.disableWebhookEndpoint(
      service.alice,
      registered.endpoint.id
    );
    expect(
      (await service.client.query("SELECT outcome FROM webhook_deliveries"))
        .rows
    ).toEqual([{ outcome: "dead" }]);
    expect(
      await service.webhooks.rotateWebhookSecret(
        service.alice,
        registered.endpoint.id
      )
    ).toBeUndefined();
  });

  it("does not follow redirects, rechecks SSRF, and caps retries", async () => {
    const service = await loadService();
    const registered = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://delivery.example.test",
        subscribedEvents: ["agent.published"],
      }
    );
    await service.webhooks.emitWebhookEvent(service.database, service.alice, {
      type: "agent.published",
      payload: { agentId: "a", revisionId: "r" },
    });
    let fetches = 0;
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => {
        fetches += 1;
        return new Response("", { status: 302 });
      },
    });
    expect(fetches).toBe(1);
    expect(
      (await service.client.query("SELECT outcome FROM webhook_deliveries"))
        .rows
    ).toEqual([{ outcome: "dead" }]);
    await service.client.exec(
      `UPDATE webhook_endpoints SET url = 'https://127.0.0.1' WHERE id = '${registered.endpoint.id}'; UPDATE webhook_deliveries SET outcome = 'pending', attempt = 0, next_attempt_at = '2000-01-01T00:00:00.000Z';`
    );
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => {
        throw new Error("private URL must not be fetched");
      },
    });
    expect(
      (await service.client.query("SELECT outcome FROM webhook_deliveries"))
        .rows
    ).toEqual([{ outcome: "dead" }]);
    await service.client.exec(
      "UPDATE webhook_endpoints SET url = 'https://delivery.example.test'; UPDATE webhook_deliveries SET outcome = 'pending', attempt = 6, next_attempt_at = '2000-01-01T00:00:00.000Z'"
    );
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => {
        throw new Error("attempt cap must not fetch");
      },
    });
    expect(
      (await service.client.query("SELECT outcome FROM webhook_deliveries"))
        .rows
    ).toEqual([{ outcome: "dead" }]);
  });

  it.each([
    ["loopback", [{ address: "127.0.0.1", family: 4 }]],
    ["RFC1918", [{ address: "10.0.0.8", family: 4 }]],
    ["link-local", [{ address: "169.254.169.254", family: 4 }]],
    ["IPv6 loopback", [{ address: "::1", family: 6 }]],
    ["mapped private IPv6", [{ address: "::ffff:192.168.1.10", family: 6 }]],
    [
      "mixed public and private answers",
      [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.10", family: 4 },
      ],
    ],
  ])(
    "fails closed when a hostname resolves to %s",
    async (_name, addresses) => {
      const service = await loadService();
      const lookup = dnsMocks.lookup.mockResolvedValue(addresses);

      await expect(
        service.webhooks.registerWebhookEndpoint(service.alice, {
          url: "https://private-host.example.test",
          subscribedEvents: ["agent.published"],
        })
      ).rejects.toThrow(/public HTTPS|public addresses/i);
      expect(lookup).toHaveBeenCalled();
      lookup.mockReset();
    }
  );

  it("rechecks DNS at delivery and rejects a public-to-private rebinding", async () => {
    const service = await loadService();
    const lookup = dnsMocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const registered = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://rebind.example.test",
        subscribedEvents: ["agent.published"],
      }
    );
    await service.webhooks.emitWebhookEvent(service.database, service.alice, {
      type: "agent.published",
      payload: { agentId: "a", revisionId: "r" },
    });
    lookup.mockResolvedValue([{ address: "10.0.0.8", family: 4 }]);
    let fetches = 0;
    await service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => {
        fetches += 1;
        return new Response(null, { status: 204 });
      },
    });

    expect(fetches).toBe(0);
    expect(
      (await service.client.query("SELECT outcome FROM webhook_deliveries"))
        .rows
    ).toEqual([{ outcome: "dead" }]);
    expect(registered.endpoint.url).toBe("https://rebind.example.test/");
    lookup.mockReset();
  });

  it.each([
    ["private IPv4", "10.0.0.8", 4],
    ["private IPv6", "::1", 6],
    ["mapped private IPv6", "::ffff:192.168.1.10", 6],
  ])(
    "pins the connection away from a %s DNS rebinding",
    async (_name, privateAddress, privateFamily) => {
      const service = await loadService();
      httpsMocks.request.mockImplementation((_options, callback) => {
        const request = new EventEmitter() as FakeRequest;
        request.end = () => {
          const response = new EventEmitter() as FakeResponse;
          response.headers = {};
          response.statusCode = 204;
          response.destroy = vi.fn<() => void>();
          callback(response);
          response.emit("end");
        };
        return request;
      });
      dnsMocks.lookup
        .mockReset()
        .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
        .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
      await service.webhooks.registerWebhookEndpoint(service.alice, {
        url: "https://connection-race.example.test",
        subscribedEvents: ["agent.published"],
      });
      await service.webhooks.emitWebhookEvent(service.database, service.alice, {
        type: "agent.published",
        payload: { agentId: "a", revisionId: "r" },
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("The default transport must use pinned HTTPS.");
      };
      try {
        // DNS changes after validation, immediately before a vulnerable
        // hostname-based connection would be made.
        dnsMocks.lookup.mockResolvedValue([
          { address: privateAddress, family: privateFamily },
        ]);
        await service.webhooks.drainWebhookDeliveries();
      } finally {
        globalThis.fetch = originalFetch;
      }

      expect(httpsMocks.request).toHaveBeenCalledTimes(1);
      const firstCall = httpsMocks.request.mock.calls[0];
      if (!firstCall) throw new Error("Expected a pinned HTTPS request.");
      const [options] = firstCall;
      expect(options.hostname).toBe("93.184.216.34");
      expect(options.servername).toBe("connection-race.example.test");
      expect(options.headers?.host).toBe("connection-race.example.test");
      const lookup = options.lookup;
      if (!lookup) throw new Error("Expected a pinned lookup callback.");
      const connection = await new Promise<{
        address?: string;
        family?: number;
      }>((resolve, reject) => {
        lookup("connection-race.example.test", {}, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      });
      expect(connection).toEqual({ address: "93.184.216.34", family: 4 });
      expect(connection.address).not.toBe(privateAddress);
    }
  );

  it("does not buffer an untrusted webhook response body", async () => {
    const service = await loadService();
    const response = new EventEmitter() as FakeResponse;
    response.headers = {};
    response.statusCode = 200;
    response.destroy = vi.fn<() => void>();
    httpsMocks.request.mockImplementation((_options, callback) => {
      const request = new EventEmitter() as FakeRequest;
      request.end = () => {
        callback(response);
        // A response may be arbitrarily large or never terminate. The
        // delivery result must be available from headers alone.
        response.emit("data", Buffer.alloc(16 * 1024 * 1024));
      };
      return request;
    });
    await service.webhooks.registerWebhookEndpoint(service.alice, {
      url: "https://large-response.example.test",
      subscribedEvents: ["agent.published"],
    });
    await service.webhooks.emitWebhookEvent(service.database, service.alice, {
      type: "agent.published",
      payload: { agentId: "a", revisionId: "r" },
    });

    await expect(service.webhooks.drainWebhookDeliveries()).resolves.toEqual({
      dead: 0,
      delivered: 1,
      failed: 0,
    });
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.listenerCount("data")).toBe(0);
  });

  it("does not hold endpoint or delivery locks while an outbound fetch is pending", async () => {
    const service = await loadService();
    const registered = await service.webhooks.registerWebhookEndpoint(
      service.alice,
      {
        url: "https://slow.example.test",
        subscribedEvents: ["agent.published"],
      }
    );
    await service.webhooks.emitWebhookEvent(service.database, service.alice, {
      type: "agent.published",
      payload: { agentId: "a", revisionId: "r" },
    });
    let releaseFetch!: (response: Response) => void;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchReleased = new Promise<Response>((resolve) => {
      releaseFetch = resolve;
    });
    const draining = service.webhooks.drainWebhookDeliveries({
      fetchImpl: async () => {
        markFetchStarted();
        return await fetchReleased;
      },
    });
    await fetchStarted;
    const disableStartedAt = performance.now();
    const disabling = service.webhooks.disableWebhookEndpoint(
      service.alice,
      registered.endpoint.id
    );
    const disabledWithoutWaitingForFetch = await Promise.race([
      disabling.then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => {
          resolve(false);
        }, 250);
      }),
    ]);
    releaseFetch(new Response(null, { status: 204 }));
    await Promise.all([draining, disabling]);
    expect(disabledWithoutWaitingForFetch).toBe(true);
    expect(performance.now() - disableStartedAt).toBeLessThan(500);
  });

  it("keeps publishing available when endpoint storage is unavailable", async () => {
    const service = await loadService();
    await service.client.exec("DROP TABLE webhook_endpoints CASCADE");
    const agent = await service.agents.createAgent(service.alice, {
      slug: "outbox-only",
    });
    const revision = await service.agents.createRevision(
      service.alice,
      agent.id,
      {
        capabilities: [],
        instructions: "Durable.",
        modelPolicy: { tier: "standard" },
        version: 1,
      }
    );
    await expect(
      service.agents.publishRevision(service.alice, agent.id, revision.id)
    ).resolves.toBeDefined();
    expect(
      (await service.client.query("SELECT type FROM webhook_events")).rows
    ).toEqual([{ type: "agent.published" }]);
  });
});

async function loadService() {
  const client = new PGlite();
  databases.push(client);
  await applyAllMigrations(client);
  const database = drizzle(client, { schema });
  setDatabaseForIntegrationTest(database);
  const webhooks = await import("@/db/services/webhooks");
  const agents = await import("@/db/services/agents");
  const scope = await import("@/db/services/scope");
  const alice = { userId: "alice", workspaceId: "workspace:alice" };
  const bob = { userId: "bob", workspaceId: "workspace:bob" };
  const member = { userId: "member", workspaceId: "workspace:alice" };
  await scope.ensureScope(alice);
  await scope.ensureScope(bob);
  await client.exec(
    "INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at) VALUES ('workspace:alice', 'member', 'member', '2026-01-01')"
  );
  return { agents, alice, bob, client, database: db, member, webhooks };
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
