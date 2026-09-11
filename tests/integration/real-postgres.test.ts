import { drizzle } from "drizzle-orm/node-postgres";
import { createPostgresState } from "@chat-adapter/state-pg";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import {
  claimCompletionReportPart,
  findCompletionReportPart,
  markAccepted,
  markProviderAttempted,
  markUnconfirmed,
} from "@/db/services/completion-report-attempts";
import { adminDependencies } from "@/lib/admin";
import * as schema from "../../db/schema";
import { createRealPostgres } from "../harness/real-postgres";

const realPostgres = await createRealPostgres();
const originalAdminPhoneNumbers = adminDependencies.adminPhoneNumbers;

afterAll(async () => {
  await realPostgres?.close();
});

describe.skipIf(realPostgres === undefined)(
  "real Postgres concurrency (requires Docker Compose)",
  () => {
    it("returns numeric admin aggregates through node-postgres", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const pool = new Pool({
        connectionString: realPostgres.connectionString,
      });
      const database = drizzle({ client: pool, schema });
      setDatabaseForIntegrationTest(database);
      adminDependencies.adminPhoneNumbers = () => "+12025550123";

      try {
        const now = new Date().toISOString();
        await pool.query(
          `INSERT INTO workspaces (id, lifecycle_state, created_at) VALUES
             ('admin-workspace', 'active', $1), ('workspace-a', 'active', $1), ('workspace-b', 'suspended', $1)`,
          [now]
        );
        await pool.query(
          `INSERT INTO "user" (id, name, email, "phoneNumber")
             VALUES ('admin', 'Admin', 'admin@real-postgres.test', '+12025550123')`
        );
        await pool.query(
          `INSERT INTO agents (id, workspace_id, slug, status, created_at, updated_at)
             VALUES ('agent-a', 'workspace-a', 'agent-a', 'active', $1, $1)`,
          [now]
        );
        await pool.query(
          `INSERT INTO usage_events (id, workspace_id, kind, quantity, unit, created_at) VALUES
             ('usage-a', 'workspace-a', 'model_tokens', 12, 'tokens', $1),
             ('usage-b', 'workspace-b', 'browser_session', 5, 'sessions', $1)`,
          [now]
        );
        await pool.query(
          `INSERT INTO webhook_endpoints (id, workspace_id, url, encrypted_signing_secret, subscribed_events)
             VALUES ('endpoint-a', 'workspace-a', 'https://hooks.example.test', 'encrypted', '[]')`
        );
        await pool.query(
          `INSERT INTO webhook_events (id, workspace_id, type, payload)
             VALUES ('event-a', 'workspace-a', 'agent.published', '{}')`
        );
        await pool.query(
          `INSERT INTO webhook_deliveries (id, workspace_id, event_id, endpoint_id, next_attempt_at)
             VALUES ('delivery-a', 'workspace-a', 'event-a', 'endpoint-a', $1)`,
          [now]
        );
        const { appRouter } = await import("@/trpc/router");
        const caller = appRouter.createCaller({
          origin: "https://example.test",
          scope: {
            userId: "better-auth:admin",
            workspaceId: "admin-workspace",
          },
        });

        const overview = await caller.admin.overview();
        const usage = await caller.admin.usage({});
        const workspaces = await caller.admin.workspaces({});
        expect(overview.workspacesByLifecycle.active).toBe(2);
        expect(overview.workspacesByLifecycle.suspended).toBe(1);
        expect(overview.agentsByStatus.active).toBe(1);
        expect(overview.usageByKind.model_tokens).toBe(12);
        expect(overview.usageByKind.browser_session).toBe(5);
        expect(overview.webhookEndpointsByStatus.active).toBe(1);
        expect(overview.webhookDeliveryOutcomes.pending).toBe(1);
        for (const value of [
          ...Object.values(overview.workspacesByLifecycle),
          ...Object.values(overview.agentsByStatus),
          ...Object.values(overview.usageByKind),
          ...Object.values(overview.webhookEndpointsByStatus),
          ...Object.values(overview.webhookDeliveryOutcomes),
          overview.verifiedPhoneIdentities,
          overview.activeChannelConversations,
          overview.activeApiCredentials,
          ...usage.map((row) => row.quantity),
          ...workspaces.workspaces.flatMap((row) => [
            row.memberCount,
            row.agentCount,
            row.modelTokens,
          ]),
        ]) {
          expect(value).toBeTypeOf("number");
        }
      } finally {
        resetDatabaseForIntegrationTest();
        adminDependencies.adminPhoneNumbers = originalAdminPhoneNumbers;
        await pool.end();
      }
    });

    it("serializes revision creation and retries concurrent phone verification", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const pool = new Pool({
        connectionString: realPostgres.connectionString,
      });
      const database = drizzle({ client: pool, schema });
      setDatabaseForIntegrationTest(database);

      try {
        const agents = await import("@/db/services/agents");
        const phoneIdentities = await import("@/db/services/phone-identities");
        const scopeService = await import("@/db/services/scope");
        const scope = { userId: "alice", workspaceId: "workspace:real-pg" };
        await scopeService.ensureScope(scope);
        await pool.query(
          'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
          ["alice", "Alice", "alice@real-postgres.test"]
        );

        const agent = await agents.createAgent(scope, { slug: "assistant" });
        const connections = await Promise.all([pool.connect(), pool.connect()]);
        connections.forEach((connection) => {
          connection.release();
        });
        const revisions = await Promise.all([
          agents.createRevision(scope, agent.id, manifest),
          agents.createRevision(scope, agent.id, manifest),
        ]);
        expect(
          revisions
            .map((revision) => revision.revisionNumber)
            .toSorted((left, right) => left - right)
        ).toEqual([1, 2]);

        await expect(
          Promise.all([
            phoneIdentities.recordVerifiedPhoneIdentity({
              phoneNumber: "+12025550123",
              userId: "alice",
            }),
            phoneIdentities.recordVerifiedPhoneIdentity({
              phoneNumber: "+12025550123",
              userId: "alice",
            }),
          ])
        ).resolves.toHaveLength(2);
        const { rows } = await pool.query(
          "SELECT id FROM phone_identities WHERE status = 'verified'"
        );
        expect(rows).toHaveLength(1);
      } finally {
        resetDatabaseForIntegrationTest();
        await pool.end();
      }
    });

    it("persists SendBlue message claims across adapters and restart", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const prefix = "sendblue-state-integration";
      const first = createPostgresState({
        keyPrefix: prefix,
        url: realPostgres.connectionString,
      });
      const second = createPostgresState({
        keyPrefix: prefix,
        url: realPostgres.connectionString,
      });
      await first.connect();
      await second.connect();
      try {
        expect(await first.setIfNotExists("message:A", true)).toBe(true);
        expect(await second.setIfNotExists("message:B", true)).toBe(true);
        expect(await first.setIfNotExists("message:A", true)).toBe(false);
        const parallel = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            (index % 2 === 0 ? first : second).setIfNotExists(
              "message:parallel",
              true
            )
          )
        );
        expect(parallel.filter(Boolean)).toHaveLength(1);
        await Promise.all([first.disconnect(), second.disconnect()]);
        const restarted = createPostgresState({
          keyPrefix: prefix,
          url: realPostgres.connectionString,
        });
        await restarted.connect();
        try {
          expect(await restarted.setIfNotExists("message:A", true)).toBe(false);
          expect(await restarted.setIfNotExists("message:B", true)).toBe(false);
          expect(await restarted.setIfNotExists("message:parallel", true)).toBe(
            false
          );
        } finally {
          await restarted.disconnect();
        }
      } finally {
        await Promise.all([first.disconnect(), second.disconnect()]);
      }
    });

    it("refuses to dispatch a completion report part twice across a crash window", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const pool = new Pool({
        connectionString: realPostgres.connectionString,
      });
      const database = drizzle({ client: pool, schema });
      setDatabaseForIntegrationTest(database);

      try {
        const now = new Date();
        await pool.query(
          `INSERT INTO workspaces (id, lifecycle_state, created_at)
             VALUES ('report-workspace', 'active', $1)
             ON CONFLICT (id) DO NOTHING`,
          [now.toISOString()]
        );

        const key = {
          cohortId: "turn_report",
          part: "text",
          reportRevision: 0,
          rootSessionId: "root-session",
          workspaceId: "report-workspace",
        };
        const lease = (owner: string, minutes: number) => ({
          channel: "channel:sendblue",
          contentDigest: "digest-of-the-composed-summary",
          conversationId: "conversation-1",
          id: `${owner}-attempt`,
          key,
          leaseExpiresAt: new Date(now.getTime() + minutes * 60_000),
          leaseOwner: owner,
          now,
        });

        // DW-01 — a second claimer arrives while the first lease is live. It
        // must not be handed the right to dispatch, because the original owner
        // can still transition to attempted and call the provider.
        const first = await claimCompletionReportPart(lease("owner-a", 5));
        expect(first.kind).toBe("claimed");
        if (first.kind !== "claimed") throw new Error("expected a claim");

        const contender = await claimCompletionReportPart(lease("owner-b", 5));
        expect(contender.kind).toBe("uncertain");

        // Eight concurrent claimers on a fresh part yield exactly one dispatcher.
        const concurrentKey = { ...key, part: "attachment" };
        const race = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            claimCompletionReportPart({
              ...lease(`racer-${String(index)}`, 5),
              id: `racer-${String(index)}-attempt`,
              key: concurrentKey,
            })
          )
        );
        expect(
          race.filter((outcome) => outcome.kind === "claimed")
        ).toHaveLength(1);

        // DW-02 — the pre-dispatch compare-and-swap. Only the live lease and
        // version may move to attempted, and that happens before any network
        // call. A stale owner is refused and therefore cannot dispatch.
        expect(
          await markProviderAttempted({
            id: first.claim.id,
            leaseOwner: "owner-b",
            version: first.claim.version,
          })
        ).toBeUndefined();
        expect(
          await markProviderAttempted({
            id: first.claim.id,
            leaseOwner: "owner-a",
            version: first.claim.version + 99,
          })
        ).toBeUndefined();

        const attempted = await markProviderAttempted({
          id: first.claim.id,
          leaseOwner: "owner-a",
          version: first.claim.version,
        });
        expect(attempted?.state).toBe("attempted");
        if (!attempted) throw new Error("expected the attempt to be recorded");

        // A crash here leaves the part attempted with no acceptance. Recovery
        // in a new process reads exactly that, and must never re-send it.
        const restartPool = new Pool({
          connectionString: realPostgres.connectionString,
        });
        setDatabaseForIntegrationTest(drizzle({ client: restartPool, schema }));
        try {
          const recovered = await findCompletionReportPart(key);
          expect(recovered?.state).toBe("attempted");

          // The recovering owner cannot claim it again, whatever call id the
          // model regenerates, because identity is the logical part.
          const afterRestart = await claimCompletionReportPart({
            ...lease("owner-after-restart", 5),
            id: "a-brand-new-call-id",
          });
          expect(afterRestart.kind).toBe("uncertain");
          expect(afterRestart.claim.state).toBe("attempted");
        } finally {
          await restartPool.end();
        }

        setDatabaseForIntegrationTest(database);

        // DW-03 — acceptance is recorded against the same lease and version,
        // and a checkpoint lost afterwards still cannot cause a second call.
        const accepted = await markAccepted({
          id: first.claim.id,
          leaseOwner: "owner-a",
          providerHandle: "provider-handle-1",
          version: attempted.version,
        });
        expect(accepted?.state).toBe("accepted");

        const afterAcceptance = await claimCompletionReportPart({
          ...lease("owner-c", 5),
          id: "yet-another-call-id",
        });
        expect(afterAcceptance.kind).toBe("settled");
        expect(afterAcceptance.claim.providerHandle).toBe("provider-handle-1");

        // The dangerous case, and the one a live lease does not cover: the
        // owning process died, so its lease has expired, while the part is
        // already attempted. Nothing here may take it over, because the
        // provider may already hold that send.
        const abandonedKey = { ...key, part: "attachment-send" };
        const abandoned = await claimCompletionReportPart({
          ...lease("owner-that-died", 5),
          id: "abandoned-attempt",
          key: abandonedKey,
        });
        if (abandoned.kind !== "claimed") throw new Error("expected a claim");
        const abandonedAttempt = await markProviderAttempted({
          id: abandoned.claim.id,
          leaseOwner: "owner-that-died",
          version: abandoned.claim.version,
        });
        expect(abandonedAttempt?.state).toBe("attempted");
        await pool.query(
          `UPDATE completion_report_attempts SET lease_expires_at = $1 WHERE id = $2`,
          [new Date(now.getTime() - 60_000).toISOString(), abandoned.claim.id]
        );

        const afterExpiry = await claimCompletionReportPart({
          ...lease("owner-taking-over", 5),
          id: "takeover-attempt",
          key: abandonedKey,
        });
        expect(afterExpiry.kind).toBe("uncertain");
        expect(afterExpiry.claim.state).toBe("attempted");

        // And one owner cannot record a second attempt for the same part, so a
        // retry loop cannot turn one claim into two provider calls.
        expect(
          await markProviderAttempted({
            id: abandoned.claim.id,
            leaseOwner: "owner-that-died",
            version: abandonedAttempt?.version ?? 0,
          })
        ).toBeUndefined();

        // An uncertain provider result is terminal: the part is recorded
        // unconfirmed and nothing re-sends it, because the send may have landed.
        const uncertainKey = { ...key, part: "media-upload" };
        const uncertain = await claimCompletionReportPart({
          ...lease("owner-uncertain", 5),
          id: "uncertain-attempt",
          key: uncertainKey,
        });
        if (uncertain.kind !== "claimed") throw new Error("expected a claim");
        const uncertainAttempt = await markProviderAttempted({
          id: uncertain.claim.id,
          leaseOwner: "owner-uncertain",
          version: uncertain.claim.version,
        });
        const settledUnconfirmed = await markUnconfirmed({
          id: uncertain.claim.id,
          leaseOwner: "owner-uncertain",
          version: uncertainAttempt?.version ?? 0,
        });
        expect(settledUnconfirmed?.state).toBe("unconfirmed");

        const afterUnconfirmed = await claimCompletionReportPart({
          ...lease("owner-retrying", 5),
          id: "retry-attempt",
          key: uncertainKey,
        });
        expect(afterUnconfirmed.kind).toBe("uncertain");
        expect(afterUnconfirmed.claim.state).toBe("unconfirmed");

        // The logical identity is unique, so the whole crash window rests on one
        // row rather than on a call id.
        const rows = await pool.query(
          `SELECT state, version FROM completion_report_attempts
             WHERE workspace_id = $1 AND root_session_id = $2
               AND cohort_id = $3 AND report_revision = $4 AND part = $5`,
          [
            key.workspaceId,
            key.rootSessionId,
            key.cohortId,
            key.reportRevision,
            key.part,
          ]
        );
        expect(rows.rowCount).toBe(1);
      } finally {
        resetDatabaseForIntegrationTest();
        await pool.end();
      }
    });

    it("creates a SendBlue binding after the provider schema gate", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const pool = new Pool({
        connectionString: realPostgres.connectionString,
      });
      setDatabaseForIntegrationTest(drizzle({ client: pool, schema }));
      const userId = "sendblue-real-pg-user";
      try {
        await pool.query(
          'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
          [userId, "SendBlue Test", "sendblue-real-pg@test.invalid"]
        );
        await pool.query(
          `INSERT INTO phone_identities (id, user_id, encrypted_phone_number, phone_lookup_hash, verified_at) VALUES ($1, $2, $3, $4, $5)`,
          [
            "sendblue-real-pg-identity",
            userId,
            "synthetic-encrypted-phone",
            "sendblue-real-pg-phone-hash",
            new Date(),
          ]
        );
        const scopeService = await import("@/db/services/scope");
        const agents = await import("@/db/services/agents");
        const conversations =
          await import("@/db/services/channel-conversations");
        const access = (await import("@/lib/access-scope")).accessScopeForUser(
          `better-auth:${userId}`
        );
        await scopeService.ensureScope(access);
        const agent = await agents.createAgent(access, {
          slug: "sendblue-test",
        });
        const revision = await agents.createRevision(access, agent.id, {
          capabilities: ["calendar.read"],
          instructions: "Synthetic SendBlue integration test.",
          modelPolicy: { tier: "standard" },
          version: 1,
        });
        await agents.publishRevision(access, agent.id, revision.id);
        const suspendedLineUpdatedAt = new Date("2020-01-01T00:00:00.000Z");
        await pool.query(
          `INSERT INTO platform_lines
             (id, provider, provider_line_id, connector_id, environment, status, updated_at)
           VALUES
             ('suspended-sendblue-line', 'sendblue', 'suspended-sendblue-line',
              'existing-connector', 'existing-environment', 'suspended', $1)`,
          [suspendedLineUpdatedAt]
        );
        await expect(
          conversations.createConversationBinding({
            phoneIdentityId: "sendblue-real-pg-identity",
            platformLine: {
              connectorId: "replacement-connector",
              environment: "integration",
              providerLineId: "suspended-sendblue-line",
            },
            provider: "sendblue",
            providerAccountId: "suspended-sendblue-account",
            providerConversationId: "suspended-sendblue-conversation",
            userId,
          })
        ).resolves.toBeUndefined();
        const { rows: suspendedLines } = await pool.query<{
          connector_id: string | null;
          environment: string | null;
          status: string;
          updated_at: Date;
        }>(
          `SELECT connector_id, environment, status, updated_at
             FROM platform_lines WHERE id = 'suspended-sendblue-line'`
        );
        const [suspendedLine] = suspendedLines;
        if (!suspendedLine)
          throw new Error("Suspended SendBlue line was deleted.");
        expect(suspendedLine).toMatchObject({
          connector_id: "existing-connector",
          environment: "existing-environment",
          status: "suspended",
        });
        expect(suspendedLine.updated_at.toISOString()).toBe(
          suspendedLineUpdatedAt.toISOString()
        );
        await expect(
          pool.query(
            `SELECT id FROM channel_conversations
             WHERE provider_account_id = 'suspended-sendblue-account'`
          )
        ).resolves.toMatchObject({ rows: [] });
        await expect(
          pool.query("SELECT id FROM channel_participants")
        ).resolves.toMatchObject({ rows: [] });
        await expect(
          pool.query(
            `SELECT id FROM audit_events WHERE action = 'channel.conversation.bind'`
          )
        ).resolves.toMatchObject({ rows: [] });
        const binding = await conversations.createConversationBinding({
          phoneIdentityId: "sendblue-real-pg-identity",
          platformLine: {
            environment: "integration",
            providerLineId: "synthetic-sendblue-line",
          },
          provider: "sendblue",
          providerAccountId: "synthetic-sendblue-account",
          providerConversationId: "synthetic-sendblue-conversation",
          userId,
        });
        expect(binding).toMatchObject({
          provider: "sendblue",
          providerAccountId: "synthetic-sendblue-account",
          providerConversationId: "synthetic-sendblue-conversation",
        });
      } finally {
        resetDatabaseForIntegrationTest();
        await pool.end();
      }
    });
  }
);

const manifest = {
  capabilities: ["calendar.read"],
  instructions: "Be helpful.",
  modelPolicy: { tier: "standard" as const },
  version: 1 as const,
};
