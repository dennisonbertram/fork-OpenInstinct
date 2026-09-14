import { drizzle } from "drizzle-orm/node-postgres";
import { createPostgresState } from "@chat-adapter/state-pg";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import { env } from "@/env";
import type { ChannelOnboardingBudgetTransaction } from "@/db/services/channel-onboarding-budgets";
import {
  claimCompletionReportBundle,
  claimCompletionReportPart,
  completionReportBundlePart,
  findCompletionReportPartsForCohorts,
  markBundleAccepted,
  markBundleProviderAttempted,
  markBundleUnconfirmed,
  findCompletionReportPart,
  markAccepted,
  markProviderAttempted,
  markUnconfirmed,
} from "@/db/services/completion-report-attempts";
import { adminDependencies } from "@/lib/admin";
import * as schema from "../../db/schema";
import { createRealPostgres } from "../harness/real-postgres";

const realPostgres = await createRealPostgres();
const persistedPhotoContentSchema = z.tuple([
  z.object({ text: z.string(), type: z.literal("text") }),
  z.object({
    data: z.instanceof(URL),
    mediaType: z.literal("image/jpeg"),
    type: z.literal("file"),
  }),
]);

function onboardingQuotaScope(
  providerLineId: string,
  providerAccountId: string
) {
  return { provider: "sendblue" as const, providerAccountId, providerLineId };
}
const originalAdminPhoneNumbers = adminDependencies.adminPhoneNumbers;
const restartFixtureJpeg =
  "data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z";

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

    it("provisions concurrent channel events through separate Postgres connections", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const pool = new Pool({
        connectionString: realPostgres.connectionString,
        max: 2,
      });
      const database = drizzle({ client: pool, schema });
      setDatabaseForIntegrationTest(database);
      const providerAccountId = "sendblue/real-pg-concurrency";
      const providerLineId = "+12025550991";
      const providerConversationId = "sendblue:real-pg-concurrency";
      const restartAccountId = "sendblue/real-pg-restart";
      const restartLineId = "+12025550996";
      const restartConversationId = "sendblue:real-pg-restart";
      const restartPhone = "+12025550997";
      const originalLimits = {
        enrollments: env.SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER,
        modelTurns: env.SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY,
        outboundMessages:
          env.SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY,
      };

      try {
        Object.assign(env, {
          SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER: 1,
          SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY: 2,
          SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY: 2,
        });
        const service = await import("@/db/services/channel-onboarding");
        const budgets =
          await import("@/db/services/channel-onboarding-budgets");
        await pool.query(
          `INSERT INTO platform_lines (id, provider, provider_line_id)
           VALUES ($1, 'sendblue', $2)`,
          ["line-real-pg-concurrency", providerLineId]
        );
        const connections = await Promise.all([pool.connect(), pool.connect()]);
        connections.forEach((connection) => {
          connection.release();
        });

        const firstEvents = await Promise.all([
          service.provisionChannelEnrollment({
            messageId: "real-pg-message-1",
            phoneNumber: "+12025550992",
            provider: "sendblue",
            providerAccountId,
            providerConversationId,
            providerLineId,
            welcomeParts: onboardingWelcomeParts(
              providerLineId,
              "+12025550992"
            ),
          }),
          service.provisionChannelEnrollment({
            messageId: "real-pg-message-2",
            phoneNumber: "+12025550992",
            provider: "sendblue",
            providerAccountId,
            providerConversationId,
            providerLineId,
            welcomeParts: onboardingWelcomeParts(
              providerLineId,
              "+12025550992"
            ),
          }),
        ]);
        expect(firstEvents.every((result) => result.status === "ready")).toBe(
          true
        );
        expect(new Set(firstEvents.map((result) => result.userId)).size).toBe(
          1
        );

        const duplicate = await service.provisionChannelEnrollment({
          messageId: "real-pg-message-1",
          phoneNumber: "+12025550992",
          provider: "sendblue",
          providerAccountId,
          providerConversationId,
          providerLineId,
          welcomeParts: onboardingWelcomeParts(providerLineId, "+12025550992"),
        });
        expect(duplicate).toMatchObject({ status: "ready" });

        const otherSender = await service.provisionChannelEnrollment({
          messageId: "real-pg-message-other",
          phoneNumber: "+12025550993",
          provider: "sendblue",
          providerAccountId,
          providerConversationId: "sendblue:real-pg-other",
          providerLineId,
          welcomeParts: onboardingWelcomeParts(providerLineId, "+12025550993"),
        });
        expect(otherSender).toMatchObject({ status: "ready" });
        expect(otherSender.userId).not.toBe(firstEvents[0].userId);
        expect(otherSender.workspaceId).not.toBe(firstEvents[0].workspaceId);

        const quotaNow = new Date("2026-09-14T12:00:00.000Z");
        await expect(
          budgets.reserveChannelOnboardingModelTurn({
            now: quotaNow,
            requestKey: "real-pg-model-seed",
            scope: onboardingQuotaScope(providerLineId, providerAccountId),
          })
        ).resolves.toEqual({ kind: "reserved" });
        const modelResults = await concurrentlyReserveQuota(pool, [
          (transaction) =>
            budgets.reserveChannelOnboardingModelTurn({
              now: quotaNow,
              requestKey: "real-pg-model-line-a",
              scope: onboardingQuotaScope(providerLineId, providerAccountId),
              transaction,
            }),
          (transaction) =>
            budgets.reserveChannelOnboardingModelTurn({
              now: quotaNow,
              requestKey: "real-pg-model-line-b",
              scope: onboardingQuotaScope("+12025550994", providerAccountId),
              transaction,
            }),
        ]);
        expect(
          modelResults.filter((result) => result.kind === "reserved")
        ).toHaveLength(1);
        expect(
          modelResults.filter((result) => result.kind === "limit_reached")
        ).toHaveLength(1);
        const acceptedModelKey =
          modelResults[0]?.kind === "reserved"
            ? "real-pg-model-line-a"
            : "real-pg-model-line-b";
        await expect(
          budgets.reserveChannelOnboardingModelTurn({
            now: quotaNow,
            requestKey: acceptedModelKey,
            scope: onboardingQuotaScope("+12025550995", providerAccountId),
          })
        ).resolves.toEqual({ kind: "already_reserved" });
        await expect(
          budgets.reserveChannelOnboardingModelTurn({
            now: quotaNow,
            requestKey: "real-pg-model-other-account",
            scope: onboardingQuotaScope(
              providerLineId,
              "sendblue/real-pg-other-account"
            ),
          })
        ).resolves.toEqual({ kind: "reserved" });

        await expect(
          budgets.reserveChannelOnboardingOutboundMessage({
            now: quotaNow,
            requestKey: "real-pg-outbound-seed",
            scope: onboardingQuotaScope(providerLineId, providerAccountId),
          })
        ).resolves.toEqual({ kind: "reserved" });
        const outboundResults = await concurrentlyReserveQuota(pool, [
          (transaction) =>
            budgets.reserveChannelOnboardingOutboundMessage({
              now: quotaNow,
              requestKey: "real-pg-outbound-line-a",
              scope: onboardingQuotaScope(providerLineId, providerAccountId),
              transaction,
            }),
          (transaction) =>
            budgets.reserveChannelOnboardingOutboundMessage({
              now: quotaNow,
              requestKey: "real-pg-outbound-line-b",
              scope: onboardingQuotaScope("+12025550994", providerAccountId),
              transaction,
            }),
        ]);
        expect(
          outboundResults.filter((result) => result.kind === "reserved")
        ).toHaveLength(1);
        expect(
          outboundResults.filter((result) => result.kind === "limit_reached")
        ).toHaveLength(1);
        const acceptedOutboundKey =
          outboundResults[0]?.kind === "reserved"
            ? "real-pg-outbound-line-a"
            : "real-pg-outbound-line-b";
        await expect(
          budgets.reserveChannelOnboardingOutboundMessage({
            now: quotaNow,
            requestKey: acceptedOutboundKey,
            scope: onboardingQuotaScope("+12025550995", providerAccountId),
          })
        ).resolves.toEqual({ kind: "already_reserved" });
        await expect(
          budgets.reserveChannelOnboardingOutboundMessage({
            now: quotaNow,
            requestKey: "real-pg-outbound-other-account",
            scope: onboardingQuotaScope(
              providerLineId,
              "sendblue/real-pg-other-account"
            ),
          })
        ).resolves.toEqual({ kind: "reserved" });

        await expect(
          pool.query<{
            users: number;
            workspaces: number;
            bindings: number;
            receipts: number;
          }>(
            `SELECT
               (SELECT count(DISTINCT e.user_id) FROM channel_onboarding_enrollments e
                INNER JOIN channel_onboarding_receipts r ON r.enrollment_id = e.id
                WHERE r.provider = 'sendblue' AND r.provider_account_id = $1)::int AS users,
               (SELECT count(DISTINCT e.workspace_id) FROM channel_onboarding_enrollments e
                INNER JOIN channel_onboarding_receipts r ON r.enrollment_id = e.id
                WHERE r.provider = 'sendblue' AND r.provider_account_id = $1)::int AS workspaces,
               (SELECT count(*) FROM channel_conversations
                WHERE provider = 'sendblue' AND provider_account_id = $1)::int AS bindings,
               (SELECT count(*) FROM channel_onboarding_receipts
                WHERE provider = 'sendblue' AND provider_account_id = $1)::int AS receipts`,
            [providerAccountId]
          )
        ).resolves.toMatchObject({
          rows: [{ users: 2, workspaces: 2, bindings: 2, receipts: 3 }],
        });

        // This uses two independent client pools against the same PostgreSQL
        // database. It is the actual consumer/process boundary: only the
        // transactionally persisted receipt and lease survive the first pool.
        await pool.query(
          `INSERT INTO platform_lines (id, provider, provider_line_id)
           VALUES ($1, 'sendblue', $2)`,
          ["line-real-pg-restart", restartLineId]
        );
        const firstConsumerPool = new Pool({
          connectionString: realPostgres.connectionString,
        });
        setDatabaseForIntegrationTest(
          drizzle({ client: firstConsumerPool, schema })
        );
        const restartEnrollment = await service.provisionChannelEnrollment({
          messageId: "real-pg-restart-message-1",
          openingRequest: {
            attachments: [
              {
                contentType: "image/jpeg",
                privateData: restartFixtureJpeg.split(",")[1] ?? "",
              },
            ],
            text: "What is in this persisted photo?",
          },
          phoneNumber: restartPhone,
          provider: "sendblue",
          providerAccountId: restartAccountId,
          providerConversationId: restartConversationId,
          providerLineId: restartLineId,
          welcomeParts: onboardingWelcomeParts(restartLineId, restartPhone),
        });
        if (restartEnrollment.status !== "ready") {
          throw new Error("Expected the restart enrollment.");
        }
        const delivery =
          await import("@/db/services/channel-onboarding-delivery");
        const [oldClaim] = await delivery.claimChannelOnboardingOperations({
          bindingId: restartEnrollment.bindingId,
          leaseForMs: 1_000,
          limit: 1,
          now: quotaNow,
          owner: "consumer-before-crash",
        });
        if (!oldClaim) throw new Error("Expected the first pre-crash lease.");
        await firstConsumerPool.end();

        const restartedPool = new Pool({
          connectionString: realPostgres.connectionString,
        });
        setDatabaseForIntegrationTest(
          drizzle({ client: restartedPool, schema })
        );
        try {
          const afterCrash = new Date(quotaNow.getTime() + 1_001);
          const [replacement] = await delivery.claimChannelOnboardingOperations(
            {
              bindingId: restartEnrollment.bindingId,
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "consumer-after-crash",
            }
          );
          if (!replacement) throw new Error("Expected the recovered lease.");
          expect(replacement.id).toBe(oldClaim.id);
          await expect(
            delivery.markChannelOnboardingOperationAttempted(
              oldClaim,
              afterCrash
            )
          ).resolves.toBe(false);
          await expect(
            delivery.markChannelOnboardingOperationAttempted(
              replacement,
              afterCrash
            )
          ).resolves.toBe(true);
          await expect(
            delivery.acceptChannelOnboardingProviderOperation(
              { ...replacement, providerHandle: "restart-welcome-1" },
              afterCrash
            )
          ).resolves.toBe(true);

          const [secondWelcome] =
            await delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "consumer-after-crash",
            });
          if (!secondWelcome) throw new Error("Expected the second welcome.");
          await expect(
            delivery.markChannelOnboardingOperationAttempted(
              secondWelcome,
              afterCrash
            )
          ).resolves.toBe(true);
          await expect(
            delivery.acceptChannelOnboardingProviderOperation(
              { ...secondWelcome, providerHandle: "restart-welcome-2" },
              afterCrash
            )
          ).resolves.toBe(true);

          const laterOpening = await service.provisionChannelEnrollment({
            messageId: "real-pg-restart-message-2",
            openingRequest: { text: "A later durable request." },
            phoneNumber: restartPhone,
            provider: "sendblue",
            providerAccountId: restartAccountId,
            providerConversationId: restartConversationId,
            providerLineId: restartLineId,
          });
          if (laterOpening.status !== "ready") {
            throw new Error("Expected the later opening receipt.");
          }

          const [opening] = await delivery.claimChannelOnboardingOperations({
            bindingId: restartEnrollment.bindingId,
            leaseForMs: 1_000,
            limit: 1,
            now: afterCrash,
            owner: "consumer-after-crash",
          });
          if (opening?.kind !== "opening_request") {
            throw new Error(
              "Expected the original opening request after restart."
            );
          }
          const { projectPersistedOperation } =
            await import("@/agent/lib/onboarding/delivery");
          const projected = await projectPersistedOperation(opening);
          if (projected.kind !== "opening_request") {
            throw new Error("Expected an Eve opening projection.");
          }
          const [, photo] = persistedPhotoContentSchema.parse(
            projected.payload
          );
          expect(
            Buffer.from(photo.data.href.split(",")[1] ?? "", "base64")
          ).toEqual(
            Buffer.from(restartFixtureJpeg.split(",")[1] ?? "", "base64")
          );

          const competingOpeningClaims = await Promise.all([
            delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["opening_request"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "opening-owner-competing-a",
            }),
            delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["opening_request"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "opening-owner-competing-b",
            }),
          ]);
          expect(competingOpeningClaims.flat()).toEqual([]);
          await expect(
            delivery.markChannelOnboardingOperationAttempted(
              opening,
              afterCrash
            )
          ).resolves.toBe(true);
          await expect(
            delivery.acceptChannelOnboardingHandoffOperation(
              { ...opening, sessionId: "restart-opening-1" },
              afterCrash
            )
          ).resolves.toBe(true);
          const secondOpeningClaims =
            await delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["opening_request"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "opening-owner-second",
            });
          expect(secondOpeningClaims).toHaveLength(1);
          const [secondOpening] = secondOpeningClaims;
          expect(secondOpening?.kind).toBe("opening_request");
          expect(secondOpening?.id).not.toBe(opening.id);

          const replyPayload = {
            from: restartLineId,
            presentation: { kind: "text" as const },
            text: "First durable reply part.",
            to: restartPhone,
            version: 1 as const,
          };
          const firstReply =
            await delivery.enqueueChannelOnboardingOutboundReply({
              bindingId: restartEnrollment.bindingId,
              payload: replyPayload,
              replyKey: "restart:turn-1:part-0",
            });
          const secondReply =
            await delivery.enqueueChannelOnboardingOutboundReply({
              bindingId: restartEnrollment.bindingId,
              payload: { ...replyPayload, text: "Second durable reply part." },
              replyKey: "restart:turn-1:part-1",
            });
          if (!firstReply || !secondReply) {
            throw new Error("Expected both split reply intents.");
          }
          const [leasedFirstReply] =
            await delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["outbound_reply"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "reply-owner-first",
            });
          if (!leasedFirstReply || leasedFirstReply.id !== firstReply.id) {
            throw new Error("Expected the first split reply lease.");
          }

          // The restarted pool permits concurrent PostgreSQL transactions. A
          // lease on part zero must not let either contender skip to part one.
          const competingClaims = await Promise.all([
            delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["outbound_reply"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "reply-owner-competing-a",
            }),
            delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["outbound_reply"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "reply-owner-competing-b",
            }),
          ]);
          expect(competingClaims.flat()).toEqual([]);

          await expect(
            delivery.markChannelOnboardingOperationAttempted(
              leasedFirstReply,
              afterCrash
            )
          ).resolves.toBe(true);
          await expect(
            delivery.acceptChannelOnboardingProviderOperation(
              { ...leasedFirstReply, providerHandle: "restart-reply-1" },
              afterCrash
            )
          ).resolves.toBe(true);
          await expect(
            delivery.claimChannelOnboardingOperations({
              bindingId: restartEnrollment.bindingId,
              kinds: ["outbound_reply"],
              leaseForMs: 1_000,
              limit: 1,
              now: afterCrash,
              owner: "reply-owner-second",
            })
          ).resolves.toEqual([
            expect.objectContaining({
              id: secondReply.id,
              kind: "outbound_reply",
            }),
          ]);
        } finally {
          await restartedPool.end();
          setDatabaseForIntegrationTest(database);
        }
      } finally {
        await pool.query(
          `DELETE FROM channel_participants p
           USING channel_conversations c
           WHERE p.conversation_id = c.id
             AND c.provider_account_id IN ($1, $2)`,
          [providerAccountId, restartAccountId]
        );
        Object.assign(env, {
          SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER:
            originalLimits.enrollments,
          SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY:
            originalLimits.modelTurns,
          SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY:
            originalLimits.outboundMessages,
        });
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

    it("reserves an exact report bundle without allowing legacy or overlapping roster bypasses", async () => {
      if (!realPostgres) throw new Error("Real Postgres was not initialized.");
      const pool = new Pool({
        connectionString: realPostgres.connectionString,
      });
      const database = drizzle({ client: pool, schema });
      setDatabaseForIntegrationTest(database);
      const now = new Date();
      const scope = {
        rootSessionId: "bundle-root",
        workspaceId: "bundle-workspace",
      };
      const memberA = { cohortId: "turn_a", reportRevision: 0 };
      const memberB = { cohortId: "turn_b", reportRevision: 0 };
      const memberC = { cohortId: "turn_c", reportRevision: 0 };
      const memberD = { cohortId: "turn_d", reportRevision: 0 };
      const memberE = { cohortId: "turn_e", reportRevision: 0 };
      const memberG = { cohortId: "turn_g", reportRevision: 0 };
      const memberH = { cohortId: "turn_h", reportRevision: 0 };
      const memberI = { cohortId: "turn_i", reportRevision: 0 };
      const memberJ = { cohortId: "turn_j", reportRevision: 0 };
      const memberK = { cohortId: "turn_k", reportRevision: 0 };
      const call = (members: readonly (typeof memberA)[], owner: string) =>
        claimCompletionReportBundle({
          ...scope,
          channel: "sendblue",
          contentDigest: "synthetic-digest",
          conversationId: "synthetic-conversation",
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          leaseOwner: owner,
          members,
          now,
          physicalPart: "text",
        });
      try {
        await pool.query(
          `INSERT INTO workspaces (id, lifecycle_state, created_at)
             VALUES ($1, 'active', $2), ($3, 'active', $2)`,
          [scope.workspaceId, now, "bundle-workspace-other"]
        );

        // A legacy accepted `text` row for A is not evidence that a later
        // physical [A,B] report reached the provider. The whole new bundle is
        // therefore uncertain, never falsely settled or sent.
        const legacy = await claimCompletionReportPart({
          channel: "sendblue",
          contentDigest: "old",
          conversationId: "old",
          id: "legacy-a",
          key: { ...scope, ...memberA, part: "text" },
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          leaseOwner: "legacy",
          now,
        });
        if (legacy.kind !== "claimed") throw new Error("expected legacy claim");
        const legacyAttempted = await markProviderAttempted({
          id: legacy.claim.id,
          leaseOwner: "legacy",
          version: legacy.claim.version,
          now,
        });
        if (!legacyAttempted) throw new Error("expected legacy attempt");
        await markAccepted({
          id: legacyAttempted.id,
          leaseOwner: "legacy",
          version: legacyAttempted.version,
          now,
        });
        await expect(
          call([memberA, memberB], "new-owner")
        ).resolves.toMatchObject({ kind: "uncertain" });

        // A fresh exact roster claims both rows, records both before one
        // provider call, and treats a changed model call id/replay as settled
        // only after every member was accepted.
        const exactPart = completionReportBundlePart({
          ...scope,
          members: [memberB, memberC],
          physicalPart: "text",
        });
        const exact = await call([memberB, memberC], "owner-a");
        expect(exact.kind).toBe("claimed");
        if (exact.kind !== "claimed") throw new Error("expected bundle claim");
        expect(exact.claims).toHaveLength(2);
        const attempted = await markBundleProviderAttempted(exact.claims);
        expect(attempted).toHaveLength(2);
        if (!attempted) throw new Error("expected bundle attempted");
        await expect(
          markBundleAccepted({
            claims: attempted,
            providerHandle: "provider-1",
          })
        ).resolves.toHaveLength(2);
        const restartPool = new Pool({
          connectionString: realPostgres.connectionString,
        });
        setDatabaseForIntegrationTest(drizzle({ client: restartPool, schema }));
        try {
          await expect(
            call([memberB, memberC], "owner-replay")
          ).resolves.toMatchObject({ kind: "settled" });
        } finally {
          await restartPool.end();
          setDatabaseForIntegrationTest(database);
        }

        // A different roster sharing B cannot encode a new part to bypass the
        // accepted [B,C] physical effect.
        await expect(
          call([memberA, memberB], "owner-overlap")
        ).resolves.toMatchObject({ kind: "uncertain" });

        // A stale version in one member rolls back the *entire* pre-dispatch
        // transition. No subset may reach attempted, because the provider call
        // is permitted only after all rows say attempted.
        const faultPart = completionReportBundlePart({
          ...scope,
          members: [memberD, memberE],
          physicalPart: "text",
        });
        const fault = await call([memberD, memberE], "fault-owner");
        if (fault.kind !== "claimed") throw new Error("expected fault claim");
        const [faultFirst, faultSecond] = fault.claims;
        if (!faultFirst || !faultSecond)
          throw new Error("expected two fault claims");
        await expect(
          markBundleProviderAttempted([
            faultFirst,
            { ...faultSecond, version: faultSecond.version + 1 },
          ])
        ).resolves.toBeUndefined();
        const afterFault = await findCompletionReportPartsForCohorts({
          ...scope,
          cohortIds: [memberD.cohortId, memberE.cohortId],
        });
        expect(afterFault).toHaveLength(2);
        expect(afterFault.every((row) => row.state === "claimed")).toBe(true);

        // An exact expired claimed roster is recoverable only when it is the
        // complete compatible history. A legacy accepted row for one member
        // makes coverage mixed, so recovery must remain uncertain.
        const mixed = await call([memberJ, memberK], "mixed-owner");
        if (mixed.kind !== "claimed") throw new Error("expected mixed claim");
        await pool.query(
          `UPDATE completion_report_attempts SET lease_expires_at = $1
             WHERE root_session_id = $2 AND cohort_id IN ($3, $4)`,
          [
            new Date(now.getTime() - 1_000),
            scope.rootSessionId,
            memberJ.cohortId,
            memberK.cohortId,
          ]
        );
        await pool.query(
          `INSERT INTO completion_report_attempts
             (id, workspace_id, root_session_id, channel, conversation_id,
              cohort_id, report_revision, part, state, content_digest,
              lease_owner, lease_expires_at, version, created_at, updated_at)
           VALUES ($1, $2, $3, 'sendblue', 'legacy-conversation', $4, 0,
                   'text', 'accepted', 'legacy-digest', 'legacy-owner', $5,
                   2, $5, $5)`,
          [
            "mixed-legacy-j",
            scope.workspaceId,
            scope.rootSessionId,
            memberJ.cohortId,
            now,
          ]
        );
        await expect(
          call([memberJ, memberK], "mixed-recovery-owner")
        ).resolves.toMatchObject({ kind: "uncertain" });

        // A pre-dispatch crash is recoverable only after every lease expired;
        // the new owner receives every member. Once attempted, the existing
        // earlier crash-window test proves the row is never taken over.
        await pool.query(
          `UPDATE completion_report_attempts SET lease_expires_at = $1 WHERE part = $2`,
          [new Date(now.getTime() - 1_000), faultPart]
        );
        const recoveredClaim = await call([memberD, memberE], "recovery-owner");
        expect(recoveredClaim.kind).toBe("claimed");
        if (recoveredClaim.kind !== "claimed")
          throw new Error("expected recovered bundle claim");
        const recoveredAttempt = await markBundleProviderAttempted(
          recoveredClaim.claims
        );
        if (!recoveredAttempt)
          throw new Error("expected recovered bundle attempt");
        const [recoveredFirst, recoveredSecond] = recoveredAttempt;
        if (!recoveredFirst || !recoveredSecond)
          throw new Error("expected two recovered attempts");
        await expect(
          markBundleAccepted({
            claims: [
              recoveredFirst,
              {
                ...recoveredSecond,
                version: recoveredSecond.version + 1,
              },
            ],
          })
        ).resolves.toBeUndefined();
        const afterAcceptedFault = await findCompletionReportPartsForCohorts({
          ...scope,
          cohortIds: [memberD.cohortId, memberE.cohortId],
        });
        expect(
          afterAcceptedFault.every((row) => row.state === "attempted")
        ).toBe(true);
        await expect(
          markBundleUnconfirmed(recoveredAttempt)
        ).resolves.toHaveLength(2);
        await expect(
          call([memberD, memberE], "never-retry-owner")
        ).resolves.toMatchObject({ kind: "uncertain" });

        // Overlapping fresh rosters are serialized by the scoped advisory
        // lock. Exactly one may reserve shared member E.
        const races = await Promise.all([
          call([memberG, memberH], "race-a"),
          call([memberH, memberI], "race-b"),
        ]);
        expect(
          races.filter((outcome) => outcome.kind === "claimed")
        ).toHaveLength(1);
        expect(
          races.filter((outcome) => outcome.kind === "uncertain")
        ).toHaveLength(1);

        // Same cohort names in another scope are independent. This also proves
        // UUID row IDs do not collide across root/session scopes.
        const isolated = await claimCompletionReportBundle({
          ...scope,
          workspaceId: "bundle-workspace-other",
          members: [memberA, memberB],
          channel: "sendblue",
          contentDigest: "isolated",
          conversationId: "isolated",
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          leaseOwner: "isolated",
          now,
          physicalPart: "text",
        });
        expect(isolated.kind).toBe("claimed");

        const otherRoot = await claimCompletionReportBundle({
          ...scope,
          rootSessionId: "bundle-root-other",
          members: [memberA, memberB],
          channel: "sendblue",
          contentDigest: "other-root",
          conversationId: "other-root",
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          leaseOwner: "other-root",
          now,
          physicalPart: "text",
        });
        expect(otherRoot.kind).toBe("claimed");

        const recovered = await findCompletionReportPartsForCohorts({
          ...scope,
          cohortIds: ["turn_a", "turn_b", "turn_c"],
        });
        expect(recovered).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              cohortId: "turn_a",
              part: "text",
              state: "accepted",
            }),
            expect.objectContaining({
              cohortId: "turn_b",
              part: exactPart,
              state: "accepted",
              bundleCount: 2,
            }),
            expect.objectContaining({
              cohortId: "turn_c",
              part: exactPart,
              state: "accepted",
              bundleCount: 2,
            }),
          ])
        );
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

function onboardingWelcomeParts(from: string, to: string) {
  return ["You’re in!", "Welcome to Jory."].map((text) => ({
    from,
    text,
    to,
    version: 1 as const,
  }));
}

const manifest = {
  capabilities: ["calendar.read"],
  instructions: "Be helpful.",
  modelPolicy: { tier: "standard" as const },
  version: 1 as const,
};

async function concurrentlyReserveQuota<T>(
  pool: Pool,
  reservations: readonly [
    (transaction: ChannelOnboardingBudgetTransaction) => Promise<T>,
    (transaction: ChannelOnboardingBudgetTransaction) => Promise<T>,
  ]
) {
  const connections = await Promise.all([pool.connect(), pool.connect()]);
  try {
    return await Promise.all(
      reservations.map(async (reserve, index) => {
        const connection = connections[index];
        if (!connection) throw new Error("Expected a PostgreSQL connection.");
        await connection.query("BEGIN");
        try {
          const transaction = drizzle({ client: connection, schema });
          const result = await reserve(transaction);
          await connection.query("COMMIT");
          return result;
        } catch (error) {
          await connection.query("ROLLBACK");
          throw error;
        }
      })
    );
  } finally {
    connections.forEach((connection) => {
      connection.release();
    });
  }
}
