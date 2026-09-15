import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as envModule from "@/env";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import type { ChannelOnboardingReservation } from "@/db/services/channel-onboarding-budgets";
import * as schema from "../../db/schema";

vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof envModule>();
  return {
    ...original,
    env: {
      ...original.env,
      SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER: 1,
      SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY: 2,
      SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY: 2,
    },
  };
});

const databases: PGlite[] = [];
const scope = {
  provider: "sendblue" as const,
  providerAccountId: "sendblue/account-test",
  providerLineId: "+12025550123",
};

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("channel onboarding budgets", () => {
  it("serially reserves one enrollment per sender and keeps retries free", async () => {
    const { client, budgets } = await loadService();
    const input = {
      requestKey: "receipt:sender-a:message-1",
      senderKey: "sender:a",
      scope,
    };

    const reservations = [
      await budgets.reserveChannelOnboardingEnrollment(input),
      await budgets.reserveChannelOnboardingEnrollment(input),
    ];

    expect(reservations).toEqual(
      expect.arrayContaining([
        { kind: "reserved" },
        { kind: "already_reserved" },
      ])
    );
    await expect(
      budgets.reserveChannelOnboardingEnrollment({
        ...input,
        requestKey: "receipt:sender-a:message-2",
      })
    ).resolves.toEqual({ kind: "limit_reached" });
    await expect(
      client.query<{ accepted: boolean; used: number }>(
        `SELECT r.accepted, b.used
         FROM channel_onboarding_quota_reservations r
         JOIN channel_onboarding_quota_buckets b ON b.id = r.counter_id
         WHERE r.operation_key = 'receipt:sender-a:message-1'`
      )
    ).resolves.toMatchObject({ rows: [{ accepted: true, used: 1 }] });
  });

  it("uses UTC daily buckets for account-wide model-turn reservations", async () => {
    const { budgets } = await loadService();
    const beforeMidnight = new Date("2026-09-14T23:59:59.999Z");
    const afterMidnight = new Date("2026-09-15T00:00:00.000Z");

    await expect(
      budgets.reserveChannelOnboardingModelTurn({
        now: beforeMidnight,
        requestKey: "operation:model-1",
        scope,
      })
    ).resolves.toEqual({ kind: "reserved" });
    await expect(
      budgets.reserveChannelOnboardingModelTurn({
        now: beforeMidnight,
        requestKey: "operation:model-2",
        scope: { ...scope, providerLineId: "+12025550124" },
      })
    ).resolves.toEqual({ kind: "reserved" });
    await expect(
      budgets.reserveChannelOnboardingModelTurn({
        now: beforeMidnight,
        requestKey: "operation:model-3",
        scope,
      })
    ).resolves.toEqual({ kind: "limit_reached" });
    await expect(
      budgets.reserveChannelOnboardingModelTurn({
        now: afterMidnight,
        requestKey: "operation:model-3",
        scope,
      })
    ).resolves.toEqual({ kind: "limit_reached" });
  });

  it("serially bounds account-wide outbound reservations without double charging retries", async () => {
    const { client, budgets } = await loadService();
    const now = new Date("2026-09-14T12:00:00.000Z");
    const results: ChannelOnboardingReservation[] = [];
    for (const requestKey of [
      "operation:outbound-1",
      "operation:outbound-2",
      "operation:outbound-3",
    ]) {
      results.push(
        // oxlint-disable-next-line eslint/no-await-in-loop -- PGlite accepts one transaction at a time.
        await budgets.reserveChannelOnboardingOutboundMessage({
          now,
          requestKey,
          scope,
        })
      );
    }

    expect(results.filter((result) => result.kind === "reserved")).toHaveLength(
      2
    );
    expect(
      results.filter((result) => result.kind === "limit_reached")
    ).toHaveLength(1);
    await expect(
      budgets.reserveChannelOnboardingOutboundMessage({
        now,
        requestKey: "operation:outbound-1",
        scope: { ...scope, providerLineId: "+12025550124" },
      })
    ).resolves.toEqual({ kind: "already_reserved" });
    await expect(
      budgets.reserveChannelOnboardingOutboundMessage({
        now,
        requestKey: "operation:outbound-1",
        scope: { ...scope, providerAccountId: "sendblue/other-account" },
      })
    ).rejects.toThrow(/reused for another scope/i);
    await expect(
      client.query<{ used: number }>(
        "SELECT used FROM channel_onboarding_quota_buckets WHERE kind = 'outbound_message'"
      )
    ).resolves.toMatchObject({ rows: [{ used: 2 }] });
  });
});

async function loadService() {
  const client = new PGlite();
  databases.push(client);
  await applyAllMigrations(client);
  setDatabaseForIntegrationTest(drizzle(client, { schema }));
  return {
    budgets: await import("@/db/services/channel-onboarding-budgets"),
    client,
  };
}

async function applyAllMigrations(database: PGlite) {
  const names = (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  for (const migrationName of names) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Migrations are order-dependent.
    const migration = await readFile(
      new URL(`../../db/migrations/${migrationName}`, import.meta.url),
      "utf8"
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Statements are order-dependent.
        await database.exec(statement);
      }
    }
  }
}
