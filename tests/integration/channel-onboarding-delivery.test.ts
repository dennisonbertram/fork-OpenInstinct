import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import * as schema from "../../db/schema";
import { projectPersistedOperation } from "@/agent/lib/onboarding/delivery";
import type * as envModule from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof envModule>();
  return {
    ...original,
    env: {
      ...original.env,
      SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER: 2,
      SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY: 2,
      SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY: 3,
    },
  };
});

const databases: PGlite[] = [];
const now = new Date("2026-09-14T12:00:00.000Z");
const enrollment = {
  messageId: "sendblue-message-1",
  openingRequest: {
    attachments: [
      {
        contentType: "image/jpeg",
        privateData: "AQID",
      },
    ],
    text: "What is in this photo?",
  },
  phoneNumber: "+12025550124",
  provider: "sendblue" as const,
  providerAccountId: "sendblue/account-test",
  providerConversationId: "sendblue:conversation-test",
  providerLineId: "+12025550123",
  welcomeParts: [
    {
      from: "+12025550123",
      presentation: { kind: "text" as const },
      text: "You’re in!",
      to: "+12025550124",
      version: 1 as const,
    },
    {
      from: "+12025550123",
      presentation: { kind: "text" as const },
      text: "Ask me anything.",
      to: "+12025550124",
      version: 1 as const,
    },
  ],
};

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("channel onboarding delivery persistence", () => {
  it("webhook drain claims only its current binding when another enrollment is pending", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    const first = await provisionChannelEnrollment(enrollment);
    if (first.status !== "ready")
      throw new Error("Expected the first enrollment.");
    const otherPhone = "+12025550125";
    const second = await provisionChannelEnrollment({
      ...enrollment,
      messageId: "sendblue-message-2",
      phoneNumber: otherPhone,
      providerConversationId: "sendblue:conversation-other",
      welcomeParts: enrollment.welcomeParts.map((part) => ({
        ...part,
        to: otherPhone,
      })),
    });
    if (second.status !== "ready")
      throw new Error("Expected the second enrollment.");

    const claimed = await delivery.claimChannelOnboardingOperations({
      bindingId: first.bindingId,
      leaseForMs: 1_000,
      limit: 10,
      now,
      owner: "webhook-first",
    });

    expect(claimed).not.toHaveLength(0);
    expect(claimed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bindingId: first.bindingId }),
      ])
    );
    expect(claimed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bindingId: second.bindingId }),
      ])
    );
  });

  it("action-result direct drain never claims an opening handoff", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    const ready = await provisionChannelEnrollment(enrollment);
    if (ready.status !== "ready") throw new Error("Expected an enrollment.");
    const reply = await delivery.enqueueChannelOnboardingOutboundReply({
      bindingId: ready.bindingId,
      payload: {
        from: enrollment.providerLineId,
        presentation: { kind: "text" },
        text: "A durable first answer.",
        to: enrollment.phoneNumber,
        version: 1,
      },
      replyKey: "session-1:turn-1:part-0",
    });
    if (!reply) throw new Error("Expected a queued reply.");

    const claimed = await delivery.claimChannelOnboardingOperations({
      bindingId: ready.bindingId,
      kinds: ["outbound_reply"],
      leaseForMs: 1_000,
      limit: 10,
      now,
      owner: "action-result",
    });

    expect(claimed).toEqual([
      expect.objectContaining({ id: reply.id, kind: "outbound_reply" }),
    ]);
    const [claimedReply] = claimed;
    if (!claimedReply) throw new Error("Expected the direct reply claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(claimedReply, now)
    ).toBe(true);
    expect(
      await delivery.acceptChannelOnboardingProviderOperation(
        { ...claimedReply, providerHandle: "sendblue-first-answer-1" },
        now
      )
    ).toBe(true);
    await expect(
      delivery.getChannelOnboardingOutboundReplyDelivery({
        bindingId: ready.bindingId,
        replyKey: "session-1:turn-1:part-0",
      })
    ).resolves.toEqual({
      kind: "provider_accepted",
      providerHandle: "sendblue-first-answer-1",
    });
  });

  it("fences an expired pre-attempt lease so only its new owner may send", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    await provisionChannelEnrollment(enrollment);

    const first = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "dead-worker",
    });
    expect(first).toHaveLength(1);
    const claimed = first[0];
    if (!claimed) throw new Error("Expected a welcome claim.");

    const replacement = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now: new Date(now.getTime() + 1_001),
      owner: "restarted-worker",
    });
    expect(replacement).toHaveLength(1);
    const reclaimed = replacement[0];
    if (!reclaimed) throw new Error("Expected a replacement claim.");

    await expect(
      delivery.markChannelOnboardingOperationAttempted(
        claimed,
        new Date(now.getTime() + 1_001)
      )
    ).resolves.toBe(false);
    await expect(
      delivery.markChannelOnboardingOperationAttempted(
        reclaimed,
        new Date(now.getTime() + 1_001)
      )
    ).resolves.toBe(true);
  });

  it("preserves the private first photo but makes a post-attempt crash uncertain, not retryable", async () => {
    const { client, delivery, provisionChannelEnrollment } =
      await loadServices();
    await provisionChannelEnrollment(enrollment);

    const [claim] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "dead-worker",
    });
    if (!claim) throw new Error("Expected a welcome claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(claim, now)
    ).toBe(true);

    const recovered =
      await delivery.recoverExpiredAttemptedChannelOnboardingOperations(
        new Date(now.getTime() + 1_001)
      );
    expect(recovered).toBe(1);
    const laterClaims = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 10,
      now: new Date(now.getTime() + 1_002),
      owner: "restarted-worker",
    });
    expect(laterClaims).not.toContainEqual(
      expect.objectContaining({ id: claim.id })
    );

    // The original request and photo are committed before webhook acknowledgement.
    await expect(
      client.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM channel_onboarding_receipts
         WHERE encrypted_payload IS NOT NULL AND length(encrypted_payload) > 0`
      )
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("restores the committed first photo from the receipt after core welcome acceptance", async () => {
    const {
      delivery,
      decryptChannelOnboardingReceiptPayload,
      provisionChannelEnrollment,
    } = await loadServices();
    await provisionChannelEnrollment(enrollment);

    await acceptCoreWelcomes(delivery, ["welcome-1", "welcome-2"], "worker");

    const [opening] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "restarted-worker",
    });
    if (
      opening?.kind !== "opening_request" ||
      !opening.receiptId ||
      !opening.encryptedReceiptPayload
    ) {
      throw new Error("Expected the original opening request after welcome.");
    }
    await expect(
      decryptChannelOnboardingReceiptPayload({
        encryptedPayload: opening.encryptedReceiptPayload,
        receiptId: opening.receiptId,
      })
    ).resolves.toMatchObject({
      attachments: [
        {
          contentType: "image/jpeg",
          privateData: "AQID",
        },
      ],
      text: "What is in this photo?",
    });

    const projected = await projectPersistedOperation(opening);
    if (projected.kind !== "opening_request") {
      throw new Error("Expected an Eve opening request projection.");
    }
    const [text, photo] = persistedPhotoContentSchema.parse(projected.payload);
    expect(text).toEqual({ text: "What is in this photo?", type: "text" });
    expect(photo.data.href).toBe("data:image/jpeg;base64,AQID");
    expect(photo).not.toHaveProperty("url");
  });

  it("continues the original request after an uncertain welcome without resending it", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    await provisionChannelEnrollment(enrollment);

    const [firstWelcome] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "worker",
    });
    if (!firstWelcome) throw new Error("Expected the first welcome claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(firstWelcome, now)
    ).toBe(true);
    expect(
      await delivery.markChannelOnboardingOperationUncertain(firstWelcome, now)
    ).toBe(true);

    const [secondWelcome] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "restarted-worker",
    });
    if (!secondWelcome) throw new Error("Expected the next welcome claim.");
    expect(secondWelcome.id).not.toBe(firstWelcome.id);
    expect(
      await delivery.markChannelOnboardingOperationAttempted(secondWelcome, now)
    ).toBe(true);
    expect(
      await delivery.acceptChannelOnboardingProviderOperation(
        { ...secondWelcome, providerHandle: "welcome-2" },
        now
      )
    ).toBe(true);

    const [opening] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "restarted-worker",
    });
    expect(opening).toMatchObject({ kind: "opening_request" });
    await expect(
      delivery.claimChannelOnboardingOperations({
        leaseForMs: 1_000,
        limit: 10,
        now: new Date(now.getTime() + 1_001),
        owner: "later-worker",
      })
    ).resolves.not.toContainEqual(
      expect.objectContaining({ id: firstWelcome.id })
    );
  });

  it("does not claim a later opening request until the earlier handoff settles", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    const firstEnrollment = await provisionChannelEnrollment(enrollment);
    if (firstEnrollment.status !== "ready")
      throw new Error("Expected an enrollment.");
    const secondEnrollment = await provisionChannelEnrollment({
      ...enrollment,
      messageId: "sendblue-message-later-request",
      openingRequest: { text: "The next genuine request." },
    });
    if (secondEnrollment.status !== "ready") {
      throw new Error("Expected the later request receipt.");
    }

    await acceptCoreWelcomes(
      delivery,
      ["opening-order-welcome-1", "opening-order-welcome-2"],
      "opening-order-welcome",
      firstEnrollment.bindingId
    );

    const firstClaims = await delivery.claimChannelOnboardingOperations({
      bindingId: firstEnrollment.bindingId,
      kinds: ["opening_request"],
      leaseForMs: 1_000,
      limit: 10,
      now,
      owner: "opening-order-first",
    });
    expect(firstClaims).toHaveLength(1);
    const [firstOpening] = firstClaims;
    if (!firstOpening) throw new Error("Expected the first opening claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(firstOpening, now)
    ).toBe(true);
    expect(
      await delivery.acceptChannelOnboardingHandoffOperation(
        { ...firstOpening, sessionId: "eve-opening-order-1" },
        now
      )
    ).toBe(true);

    const laterClaims = await delivery.claimChannelOnboardingOperations({
      bindingId: firstEnrollment.bindingId,
      kinds: ["opening_request"],
      leaseForMs: 1_000,
      limit: 10,
      now,
      owner: "opening-order-second",
    });
    expect(laterClaims).toHaveLength(1);
    const [laterOpening] = laterClaims;
    expect(laterOpening?.kind).toBe("opening_request");
    expect(laterOpening?.id).not.toBe(firstOpening.id);
  });

  it("persists a split first answer once before a provider attempt", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    const ready = await provisionChannelEnrollment(enrollment);
    if (ready.status !== "ready") throw new Error("Expected an enrollment.");
    const payload = {
      from: enrollment.providerLineId,
      presentation: { kind: "text" as const },
      text: "The first part of the answer.",
      to: enrollment.phoneNumber,
      version: 1 as const,
    };
    const first = await delivery.enqueueChannelOnboardingOutboundReply({
      bindingId: ready.bindingId,
      payload,
      replyKey: "session-1:turn-1:call-1:part-0",
    });
    const replay = await delivery.enqueueChannelOnboardingOutboundReply({
      bindingId: ready.bindingId,
      payload,
      replyKey: "session-1:turn-1:call-1:part-0",
    });

    expect(first).toMatchObject({ inserted: true });
    expect(replay).toEqual({ id: first?.id, inserted: false });
    await expect(
      delivery.getChannelOnboardingOutboundReplyDelivery({
        bindingId: ready.bindingId,
        replyKey: "session-1:turn-1:call-1:part-0",
      })
    ).resolves.toEqual({ kind: "pending" });
  });

  it("does not claim a later split reply until its predecessor settles", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    const ready = await provisionChannelEnrollment(enrollment);
    if (ready.status !== "ready") throw new Error("Expected an enrollment.");
    const payload = {
      from: enrollment.providerLineId,
      presentation: { kind: "text" as const },
      text: "A split answer.",
      to: enrollment.phoneNumber,
      version: 1 as const,
    };
    const first = await delivery.enqueueChannelOnboardingOutboundReply({
      bindingId: ready.bindingId,
      payload,
      replyKey: "session-2:turn-1:part-0",
    });
    const second = await delivery.enqueueChannelOnboardingOutboundReply({
      bindingId: ready.bindingId,
      payload: { ...payload, text: "The second part." },
      replyKey: "session-2:turn-1:part-1",
    });
    if (!first || !second)
      throw new Error("Expected both durable reply intents.");

    const beforeFirstSettles = await delivery.claimChannelOnboardingOperations({
      bindingId: ready.bindingId,
      kinds: ["outbound_reply"],
      leaseForMs: 1_000,
      limit: 10,
      now,
      owner: "reply-drain-a",
    });
    expect(beforeFirstSettles).toEqual([
      expect.objectContaining({ id: first.id, kind: "outbound_reply" }),
    ]);
    expect(
      beforeFirstSettles.some((operation) => operation.id === second.id)
    ).toBe(false);
    const [claimedFirst] = beforeFirstSettles;
    if (!claimedFirst) throw new Error("Expected the first reply claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(claimedFirst, now)
    ).toBe(true);
    expect(
      await delivery.acceptChannelOnboardingProviderOperation(
        { ...claimedFirst, providerHandle: "sendblue-split-first" },
        now
      )
    ).toBe(true);
    await expect(
      delivery.claimChannelOnboardingOperations({
        bindingId: ready.bindingId,
        kinds: ["outbound_reply"],
        leaseForMs: 1_000,
        limit: 10,
        now,
        owner: "reply-drain-b",
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: second.id, kind: "outbound_reply" }),
    ]);
  });

  it("rejects an outbound reply for another recipient or another enrollment key", async () => {
    const { delivery, provisionChannelEnrollment } = await loadServices();
    const first = await provisionChannelEnrollment(enrollment);
    if (first.status !== "ready")
      throw new Error("Expected the first enrollment.");
    const firstPayload = {
      from: enrollment.providerLineId,
      presentation: { kind: "text" as const },
      text: "A scoped answer.",
      to: enrollment.phoneNumber,
      version: 1 as const,
    };
    await expect(
      delivery.enqueueChannelOnboardingOutboundReply({
        bindingId: first.bindingId,
        payload: { ...firstPayload, to: "+12025550125" },
        replyKey: "session-1:turn-1:part-0",
      })
    ).rejects.toThrow(/recipient/i);

    const secondPhone = "+12025550125";
    const second = await provisionChannelEnrollment({
      ...enrollment,
      messageId: "sendblue-message-2",
      phoneNumber: secondPhone,
      providerConversationId: "sendblue:conversation-2",
      welcomeParts: enrollment.welcomeParts.map((part) => ({
        ...part,
        to: secondPhone,
      })),
    });
    if (second.status !== "ready")
      throw new Error("Expected the second enrollment.");
    await delivery.enqueueChannelOnboardingOutboundReply({
      bindingId: first.bindingId,
      payload: firstPayload,
      replyKey: "session-shared:turn-1:part-0",
    });
    await expect(
      delivery.enqueueChannelOnboardingOutboundReply({
        bindingId: second.bindingId,
        payload: { ...firstPayload, to: secondPhone },
        replyKey: "session-shared:turn-1:part-0",
      })
    ).rejects.toThrow(/another enrollment/i);
  });

  it("keeps a provider-accepted message distinct from delivered until its known handle resolves", async () => {
    const { client, delivery, provisionChannelEnrollment } =
      await loadServices();
    await provisionChannelEnrollment(enrollment);
    const [claim] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "worker",
    });
    if (!claim) throw new Error("Expected a welcome claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(claim, now)
    ).toBe(true);
    expect(
      await delivery.acceptChannelOnboardingProviderOperation(
        { ...claim, providerHandle: "sendblue-handle-1" },
        now
      )
    ).toBe(true);

    await expect(
      client.query<{ state: string }>(
        `SELECT state FROM channel_onboarding_operations WHERE id = '${claim.id}'`
      )
    ).resolves.toMatchObject({ rows: [{ state: "accepted" }] });

    const [statusClaim] = await delivery.claimChannelOnboardingProviderStatuses(
      {
        leaseForMs: 1_000,
        limit: 1,
        now: new Date(now.getTime() + 1),
        owner: "reconciler",
      }
    );
    if (!statusClaim) throw new Error("Expected a provider status claim.");
    expect(
      await delivery.markChannelOnboardingProviderDelivered(
        statusClaim,
        new Date(now.getTime() + 1)
      )
    ).toBe(true);
    await expect(
      client.query<{ state: string }>(
        `SELECT state FROM channel_onboarding_operations WHERE id = '${claim.id}'`
      )
    ).resolves.toMatchObject({ rows: [{ state: "delivered" }] });
  });

  it.each([
    [
      "suspended workspace",
      "UPDATE workspaces SET lifecycle_state = 'suspended'",
    ],
    [
      "revoked phone identity",
      "UPDATE phone_identities SET status = 'revoked'",
    ],
    [
      "revoked channel participant",
      "UPDATE channel_participants SET status = 'revoked'",
    ],
    [
      "closed channel binding",
      "UPDATE channel_conversations SET status = 'closed'",
    ],
  ])("refuses a claimed send after a %s", async (_reason, revoke) => {
    const { client, delivery, provisionChannelEnrollment } =
      await loadServices();
    await provisionChannelEnrollment(enrollment);
    const [claim] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "worker",
    });
    if (!claim) throw new Error("Expected a welcome claim.");

    await client.exec(revoke);

    // This is the final durable fence immediately before the transport/Eve call.
    // A false result means the caller must not make that external call.
    await expect(
      delivery.markChannelOnboardingOperationAttempted(claim, now)
    ).resolves.toBe(false);
  });

  it("cancels a leased operation atomically when the sender replies STOP", async () => {
    const {
      client,
      delivery,
      recordChannelCommunicationStop,
      provisionChannelEnrollment,
    } = await loadServices();
    await provisionChannelEnrollment(enrollment);
    const [claim] = await delivery.claimChannelOnboardingOperations({
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner: "worker",
    });
    if (!claim) throw new Error("Expected a welcome claim.");

    await recordChannelCommunicationStop({
      messageHandle: "sendblue-stop-message-1",
      phoneNumber: enrollment.phoneNumber,
      provider: enrollment.provider,
      providerAccountId: enrollment.providerAccountId,
      providerLineId: enrollment.providerLineId,
    });

    await expect(
      delivery.markChannelOnboardingOperationAttempted(claim, now)
    ).resolves.toBe(false);
    await expect(
      client.query<{ state: string }>(
        `SELECT state FROM channel_onboarding_operations WHERE id = '${claim.id}'`
      )
    ).resolves.toMatchObject({ rows: [{ state: "cancelled" }] });
  });
});

async function loadServices() {
  const client = new PGlite();
  databases.push(client);
  await applyAllMigrations(client);
  await client.exec(`
    INSERT INTO platform_lines (id, provider, provider_line_id)
    VALUES ('sendblue-line-test', 'sendblue', '${enrollment.providerLineId}');
  `);
  setDatabaseForIntegrationTest(drizzle(client, { schema }));
  const onboarding = await import("@/db/services/channel-onboarding");
  const delivery = await import("@/db/services/channel-onboarding-delivery");
  return {
    client,
    decryptChannelOnboardingReceiptPayload:
      onboarding.decryptChannelOnboardingReceiptPayload,
    delivery,
    provisionChannelEnrollment: onboarding.provisionChannelEnrollment,
    recordChannelCommunicationStop: onboarding.recordChannelCommunicationStop,
  };
}

async function applyAllMigrations(database: PGlite) {
  const names = (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  await names.reduce(async (previousMigration, migrationName) => {
    await previousMigration;
    const migration = await readFile(
      new URL(`../../db/migrations/${migrationName}`, import.meta.url),
      "utf8"
    );
    return migration
      .split("--> statement-breakpoint")
      .reduce(async (previousStatement, statement) => {
        await previousStatement;
        if (statement.trim()) await database.exec(statement);
      }, Promise.resolve());
  }, Promise.resolve());
}

type ChannelOnboardingDeliveryService = Awaited<
  ReturnType<typeof loadServices>
>["delivery"];

const persistedPhotoContentSchema = z.tuple([
  z.object({ text: z.string(), type: z.literal("text") }),
  z.object({
    data: z.instanceof(URL),
    mediaType: z.literal("image/jpeg"),
    type: z.literal("file"),
  }),
]);

async function acceptCoreWelcomes(
  delivery: ChannelOnboardingDeliveryService,
  providerHandles: readonly string[],
  owner: string,
  bindingId?: string
) {
  await providerHandles.reduce(async (previous, providerHandle) => {
    await previous;
    const [welcome] = await delivery.claimChannelOnboardingOperations({
      bindingId,
      leaseForMs: 1_000,
      limit: 1,
      now,
      owner,
    });
    if (!welcome) throw new Error("Expected a core welcome claim.");
    expect(
      await delivery.markChannelOnboardingOperationAttempted(welcome, now)
    ).toBe(true);
    expect(
      await delivery.acceptChannelOnboardingProviderOperation(
        { ...welcome, providerHandle },
        now
      )
    ).toBe(true);
  }, Promise.resolve());
}
