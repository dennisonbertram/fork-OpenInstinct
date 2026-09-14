import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { toNextJsHandler } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type {
  ChannelEnrollmentReady,
  ChannelEnrollmentResult,
} from "@/db/services/channel-onboarding";
import {
  account,
  resetDatabaseForIntegrationTest,
  session,
  setDatabaseForIntegrationTest,
  user,
  verification,
} from "@/db";
import * as schema from "../../db/schema";

vi.mock("@/db/services/channel-onboarding-budgets", () => ({
  reserveChannelOnboardingEnrollment: async () => ({
    kind: "reserved" as const,
  }),
}));

const databases: PGlite[] = [];
const providerLineId = "+12025550123";
const enrollment = {
  provider: "sendblue" as const,
  providerAccountId: "sendblue/account-test",
  providerLineId,
  providerConversationId: "sendblue:conversation-test",
  phoneNumber: "+12025550124",
  messageId: "sendblue-message-1",
  welcomeParts: welcomePartsFor("+12025550124"),
};

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("channel enrollment provisioning", () => {
  it("provisions one isolated ready identity for concurrent first texts", async () => {
    const { client, provisionChannelEnrollment } = await loadService();

    const results = await Promise.all([
      provisionChannelEnrollment(enrollment),
      provisionChannelEnrollment({
        ...enrollment,
        messageId: "sendblue-message-2",
      }),
    ]);

    expect(results[0]).toMatchObject({ status: "ready" });
    expect(results[1]).toMatchObject({ status: "ready" });
    const readyResults = results.filter(isReady);
    expect(readyResults).toHaveLength(2);
    expect(new Set(readyResults.map((result) => result.userId)).size).toBe(1);
    expect(new Set(readyResults.map((result) => result.workspaceId)).size).toBe(
      1
    );
    expect(
      new Set(readyResults.map((result) => result.phoneIdentityId)).size
    ).toBe(1);
    expect(new Set(readyResults.map((result) => result.agentId)).size).toBe(1);
    expect(new Set(readyResults.map((result) => result.bindingId)).size).toBe(
      1
    );

    await expect(
      client.query<{ count: number }>(
        `SELECT
           (SELECT count(*) FROM "user")::int AS users,
           (SELECT count(*) FROM workspaces)::int AS workspaces,
           (SELECT count(*) FROM workspace_memberships)::int AS memberships,
           (SELECT count(*) FROM agents)::int AS agents,
           (SELECT count(*) FROM channel_conversations)::int AS bindings`
      )
    ).resolves.toMatchObject({
      rows: [
        { users: 1, workspaces: 1, memberships: 1, agents: 1, bindings: 1 },
      ],
    });
  });

  it("keeps two senders in separate personal accounts and bindings", async () => {
    const { client, provisionChannelEnrollment } = await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    const second = await provisionChannelEnrollment({
      ...enrollment,
      phoneNumber: "+12025550125",
      providerConversationId: "sendblue:conversation-other",
      messageId: "sendblue-message-other",
      welcomeParts: welcomePartsFor("+12025550125"),
    });

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(first.userId).not.toBe(second.userId);
    expect(first.workspaceId).not.toBe(second.workspaceId);
    expect(first.bindingId).not.toBe(second.bindingId);
    await expect(
      client.query<{ users: number; workspaces: number; bindings: number }>(
        `SELECT
           (SELECT count(*) FROM "user")::int AS users,
           (SELECT count(*) FROM workspaces)::int AS workspaces,
           (SELECT count(*) FROM channel_conversations)::int AS bindings`
      )
    ).resolves.toMatchObject({
      rows: [{ users: 2, workspaces: 2, bindings: 2 }],
    });
  });

  it("serializes later opening requests behind the prior opening handoff", async () => {
    const { client, provisionChannelEnrollment } = await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");
    await expect(
      provisionChannelEnrollment({
        ...enrollment,
        messageId: "sendblue-opening-second",
        welcomeParts: undefined,
      })
    ).resolves.toMatchObject({ status: "ready" });
    await expect(
      provisionChannelEnrollment({
        ...enrollment,
        messageId: "sendblue-opening-third",
        welcomeParts: undefined,
      })
    ).resolves.toMatchObject({ status: "ready" });

    const { rows } = await client.query<{
      dependsOnOperationId: string | null;
      id: string;
      ordinal: number;
    }>(
      `SELECT id, ordinal, depends_on_operation_id AS "dependsOnOperationId"
       FROM channel_onboarding_operations
       WHERE enrollment_id = '${first.enrollmentId}' AND kind = 'opening_request'
       ORDER BY ordinal ASC`
    );
    expect(rows.map((row) => row.ordinal)).toEqual([0, 1, 2]);
    expect(rows[1]?.dependsOnOperationId).toBe(rows[0]?.id);
    expect(rows[2]?.dependsOnOperationId).toBe(rows[1]?.id);
  });

  it("does not append receipt, operations, or cancel cards for a suspended enrollment scope", async () => {
    const { client, provisionChannelEnrollment } = await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");
    const before = await client.query<{ operations: number; receipts: number }>(
      `SELECT
        (SELECT count(*) FROM channel_onboarding_operations WHERE enrollment_id = '${first.enrollmentId}')::int AS operations,
        (SELECT count(*) FROM channel_onboarding_receipts WHERE enrollment_id = '${first.enrollmentId}')::int AS receipts`
    );
    await client.exec(
      `UPDATE workspaces SET lifecycle_state = 'suspended' WHERE id = '${first.workspaceId}'`
    );

    await expect(
      provisionChannelEnrollment({
        ...enrollment,
        messageId: "suspended-sender-next",
      })
    ).resolves.toMatchObject({ status: "not_ready" });
    await expect(
      client.query<{ operations: number; receipts: number }>(
        `SELECT
          (SELECT count(*) FROM channel_onboarding_operations WHERE enrollment_id = '${first.enrollmentId}')::int AS operations,
          (SELECT count(*) FROM channel_onboarding_receipts WHERE enrollment_id = '${first.enrollmentId}')::int AS receipts`
      )
    ).resolves.toEqual(before);
  });

  it("rejects Linq provisioning before it reserves or writes an identity", async () => {
    const { client, provisionChannelEnrollment } = await loadService();
    await expect(
      provisionChannelEnrollment({
        ...enrollment,
        messageId: "linq-not-supported",
        provider: "linq",
      })
    ).resolves.toMatchObject({ status: "not_ready" });
    await expect(
      client.query(`SELECT id FROM channel_onboarding_enrollments`)
    ).resolves.toMatchObject({ rows: [] });
  });

  it("promotes an enrolled identity in place when normal OTP verification completes", async () => {
    const { client, provisionChannelEnrollment } = await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    const phoneIdentities = await import("@/db/services/phone-identities");
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");

    const verified = await phoneIdentities.recordVerifiedPhoneIdentity({
      phoneNumber: enrollment.phoneNumber,
      userId: first.userId,
    });

    expect(verified.id).toBe(first.phoneIdentityId);
    await expect(
      client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "user" WHERE id = '${first.userId}'`
      )
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(
      client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM phone_identities WHERE user_id = '${first.userId}'`
      )
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("STOP cancels pending onboarding work after the same identity upgrades by OTP", async () => {
    const {
      client,
      phoneIdentities,
      provisionChannelEnrollment,
      recordChannelCommunicationStop,
    } = await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");
    await phoneIdentities.recordVerifiedPhoneIdentity({
      phoneNumber: enrollment.phoneNumber,
      userId: first.userId,
    });

    await recordChannelCommunicationStop({
      messageHandle: "sendblue-stop-after-otp",
      phoneNumber: enrollment.phoneNumber,
      provider: enrollment.provider,
      providerAccountId: enrollment.providerAccountId,
      providerLineId: enrollment.providerLineId,
    });

    await expect(
      client.query<{ pending: number }>(
        `SELECT count(*)::int AS pending FROM channel_onboarding_operations
         WHERE enrollment_id = '${first.enrollmentId}' AND state IN ('pending', 'leased')`
      )
    ).resolves.toMatchObject({ rows: [{ pending: 0 }] });
  });

  it("lets the Better Auth OTP callback promote the channel user in place", async () => {
    const { client, phoneIdentities, provisionChannelEnrollment } =
      await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");
    const auth = await import("@/auth");
    const options = auth.createPhoneNumberOptions({
      localPhoneAuthBypassEnabled: true,
      recordVerifiedPhoneIdentity: async (input) => {
        await phoneIdentities.recordVerifiedPhoneIdentity(input);
      },
      sendPhoneCode: async () => undefined,
    });
    if (!options) throw new Error("Phone number plugin options are required.");

    await options.callbackOnVerification?.({
      phoneNumber: enrollment.phoneNumber,
      user: {
        createdAt: new Date("2026-08-31T00:00:00.000Z"),
        email: "channel-user@example.test",
        emailVerified: false,
        id: first.userId,
        image: null,
        name: "Channel User",
        phoneNumber: enrollment.phoneNumber,
        phoneNumberVerified: true,
        updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      },
    });

    await expect(
      client.query<{ status: string; assurance: string; userId: string }>(
        `SELECT status, assurance, user_id AS "userId"
         FROM phone_identities WHERE id = '${first.phoneIdentityId}'`
      )
    ).resolves.toMatchObject({
      rows: [
        { status: "verified", assurance: "otp_verified", userId: first.userId },
      ],
    });
    await expect(
      client.query<{ users: number; identities: number; workspaces: number }>(
        `SELECT
           (SELECT count(*) FROM "user" WHERE id = '${first.userId}')::int AS users,
           (SELECT count(*) FROM phone_identities WHERE user_id = '${first.userId}')::int AS identities,
           (SELECT count(*) FROM channel_onboarding_enrollments WHERE user_id = '${first.userId}')::int AS workspaces`
      )
    ).resolves.toMatchObject({
      rows: [{ users: 1, identities: 1, workspaces: 1 }],
    });
  });

  it("verifies a channel-created user through Better Auth's HTTP handler and creates one session", async () => {
    const { client, phoneIdentities, provisionChannelEnrollment } =
      await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");
    const auth = betterAuth({
      baseURL: "http://test.local",
      database: drizzleAdapter(dbFor(client), {
        provider: "pg",
        schema: { account, session, user, verification },
      }),
      plugins: [
        phoneNumber(
          (await import("@/auth")).createPhoneNumberOptions({
            localPhoneAuthBypassEnabled: true,
            recordVerifiedPhoneIdentity: async (input) => {
              await phoneIdentities.recordVerifiedPhoneIdentity(input);
            },
            sendPhoneCode: async () => undefined,
          })
        ),
      ],
      secret: "synthetic-test-secret-at-least-32-characters",
    });
    const response = await toNextJsHandler(auth).POST(
      new Request("http://test.local/api/auth/phone-number/verify", {
        body: JSON.stringify({
          code: "000000",
          phoneNumber: enrollment.phoneNumber,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: true,
      user: { id: first.userId, phoneNumberVerified: true },
    });
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token"
    );
    await expect(
      client.query<{
        identityCount: number;
        sessions: number;
        workspaceCount: number;
      }>(
        `SELECT
          (SELECT count(*) FROM phone_identities WHERE user_id = '${first.userId}')::int AS "identityCount",
          (SELECT count(*) FROM session WHERE "userId" = '${first.userId}')::int AS sessions,
          (SELECT count(*) FROM channel_onboarding_enrollments WHERE user_id = '${first.userId}')::int AS "workspaceCount"`
      )
    ).resolves.toMatchObject({
      rows: [{ identityCount: 1, sessions: 1, workspaceCount: 1 }],
    });
    const continuation = await provisionChannelEnrollment({
      ...enrollment,
      messageId: "sendblue-message-after-otp",
      welcomeParts: undefined,
    });
    expect(continuation).toMatchObject({
      authAssurance: "otp_verified",
      capabilityProfile: "full",
      status: "ready",
      userId: first.userId,
      workspaceId: first.workspaceId,
    });
    if (!isReady(continuation))
      throw new Error("Expected a ready continuation.");
    expect(continuation.receiptId).not.toBe(first.receiptId);
  });

  it("does not create a Better Auth session when canonical identity recording fails", async () => {
    const { client, provisionChannelEnrollment } = await loadService();
    const first = await provisionChannelEnrollment(enrollment);
    if (!isReady(first)) throw new Error("Expected a ready enrollment.");
    const auth = betterAuth({
      baseURL: "http://test.local",
      database: drizzleAdapter(dbFor(client), {
        provider: "pg",
        schema: { account, session, user, verification },
      }),
      plugins: [
        phoneNumber(
          (await import("@/auth")).createPhoneNumberOptions({
            localPhoneAuthBypassEnabled: true,
            recordVerifiedPhoneIdentity: async () => {
              throw new Error("identity persistence failed");
            },
            sendPhoneCode: async () => undefined,
          })
        ),
      ],
      secret: "synthetic-test-secret-at-least-32-characters",
    });
    const response = await toNextJsHandler(auth).POST(
      new Request("http://test.local/api/auth/phone-number/verify", {
        body: JSON.stringify({
          code: "000000",
          phoneNumber: enrollment.phoneNumber,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    await expect(
      client.query<{ sessions: number }>(
        `SELECT count(*)::int AS sessions FROM session WHERE "userId" = '${first.userId}'`
      )
    ).resolves.toMatchObject({ rows: [{ sessions: 0 }] });
  });

  it.each(["active", "revoked", "recycled"] as const)(
    "does not auto-enroll a historical %s identity",
    async (status) => {
      const { client, phoneIdentities, provisionChannelEnrollment } =
        await loadService();
      await client.exec(`
        INSERT INTO "user" (id, name, email)
        VALUES ('historical-user', 'Historical User', 'historical@example.test');
      `);
      const historical = await phoneIdentities.recordVerifiedPhoneIdentity({
        phoneNumber: enrollment.phoneNumber,
        userId: "historical-user",
      });
      await client.exec(
        `UPDATE phone_identities SET status = '${status}' WHERE id = '${historical.id}'`
      );

      await expect(
        provisionChannelEnrollment({
          ...enrollment,
          providerConversationId: `sendblue:historical-${status}`,
          messageId: `sendblue-historical-${status}`,
        })
      ).resolves.toMatchObject({
        status: "not_ready",
        userId: null,
        workspaceId: null,
        bindingId: null,
      });

      await expect(
        client.query<{ users: number; workspaces: number; bindings: number }>(
          `SELECT
             (SELECT count(*) FROM "user")::int AS users,
             (SELECT count(*) FROM workspaces)::int AS workspaces,
             (SELECT count(*) FROM channel_conversations)::int AS bindings`
        )
      ).resolves.toMatchObject({
        rows: [{ users: 1, workspaces: 0, bindings: 0 }],
      });
    }
  );
});

async function loadService() {
  const client = new PGlite();
  databases.push(client);
  await applyAllMigrations(client);
  await client.exec(`
    INSERT INTO platform_lines (id, provider, provider_line_id)
    VALUES ('sendblue-line-test', 'sendblue', '${enrollment.providerLineId}');
  `);
  setDatabaseForIntegrationTest(drizzle(client, { schema }));
  const phoneIdentities = await import("@/db/services/phone-identities");
  const service = await import("@/db/services/channel-onboarding");
  return {
    client,
    phoneIdentities,
    provisionChannelEnrollment: service.provisionChannelEnrollment,
    recordChannelCommunicationStop: service.recordChannelCommunicationStop,
  };
}

function welcomePartsFor(to: string) {
  return ["You’re in!", "Welcome to Jory."].map((text) => ({
    from: providerLineId,
    text,
    to,
    version: 1 as const,
  }));
}

function dbFor(client: PGlite) {
  return drizzle(client, { schema });
}

function isReady(
  result: ChannelEnrollmentResult
): result is ChannelEnrollmentReady {
  return result.status === "ready";
}

async function applyAllMigrations(database: PGlite) {
  const names = (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  await names.reduce(
    (migrationChain, migrationName) =>
      migrationChain.then(async () => {
        const migration = await readFile(
          new URL(`../../db/migrations/${migrationName}`, import.meta.url),
          "utf8"
        );
        return migration
          .split("--> statement-breakpoint")
          .filter((statement) => statement.trim())
          .reduce(
            (statementChain, statement) =>
              statementChain
                .then(() => database.exec(statement))
                .then(() => undefined),
            Promise.resolve()
          );
      }),
    Promise.resolve()
  );
}
