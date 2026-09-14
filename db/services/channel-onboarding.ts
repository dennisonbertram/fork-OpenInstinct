import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentRevisions,
  agents,
  channelCommunicationSuppressions,
  channelCommunicationPreferenceEvents,
  channelConversations,
  channelOnboardingEnrollments,
  channelOnboardingOperations,
  channelOnboardingReceipts,
  channelParticipants,
  db,
  phoneIdentities,
  platformLines,
  user,
  workspaceMemberships,
  workspaces,
  type PlatformLineProvider,
} from "@/db";
import { agentManifestContentDigest } from "@/lib/agent-manifest";
import { accessScopeForUser } from "@/lib/access-scope";
import { getInstallationSecrets } from "@/lib/installation-secrets";
import {
  directChannelOnboardingPayloadSchema,
  type DirectChannelOnboardingPayload,
  ONBOARDING_COPY_VERSION,
} from "@/lib/channel-onboarding-contract";
import {
  encryptPhoneIdentityPhoneNumber,
  phoneIdentityMaterial,
} from "./phone-identities";
import { verifyScopeAccess } from "./scope";
import { reserveChannelOnboardingEnrollment } from "./channel-onboarding-budgets";

const channelCapabilities = ["assistant_basic", "photo_input"] as const;
const defaultAgentManifest = {
  capabilities: [],
  instructions: "You are Jory, a helpful small-business assistant.",
  modelPolicy: { tier: "standard" as const },
  version: 1 as const,
};

const enrollmentInputSchema = z.object({
  messageId: z.string().min(1).max(512),
  openingRequest: z
    .object({
      attachments: z
        .array(
          z.object({
            contentType: z.string().min(1).max(200),
            privateData: z.string().min(1).max(5_000_000),
          })
        )
        .max(20)
        .optional(),
      text: z.string().max(100_000).optional(),
    })
    .strict()
    .optional(),
  openingDispatch: z.enum(["after_intro", "after_welcome"]).optional(),
  phoneNumber: z.string().min(1),
  provider: z.enum(["linq", "sendblue"]),
  providerAccountId: z.string().min(1).max(512),
  providerConversationId: z.string().min(1).max(512),
  providerLineId: z.string().min(1).max(128),
  welcomeParts: z
    .array(directChannelOnboardingPayloadSchema)
    .min(2)
    .max(20)
    .optional(),
});

export type ProvisionChannelEnrollmentInput = z.input<
  typeof enrollmentInputSchema
>;

export interface ChannelEnrollmentReady {
  readonly status: "ready";
  readonly userId: string;
  readonly principalId: string;
  readonly workspaceId: string;
  readonly phoneIdentityId: string;
  readonly agentId: string;
  readonly bindingId: string;
  readonly enrollmentId: string;
  readonly receiptId: string;
  readonly assurance: "channel_observed" | "otp_verified";
  readonly authAssurance: "channel_observed" | "otp_verified";
  readonly identityProvenance: "sendblue_direct" | "phone_otp";
  readonly capabilityProfile: "channel-basic" | "full";
  readonly capabilities: typeof channelCapabilities;
}

interface ChannelEnrollmentNotReady {
  readonly status: "not_ready";
  readonly userId: null;
  readonly workspaceId: null;
  readonly bindingId: null;
}

export type ChannelEnrollmentResult =
  | ChannelEnrollmentReady
  | ChannelEnrollmentNotReady;

const notReady = {
  bindingId: null,
  status: "not_ready",
  userId: null,
  workspaceId: null,
} as const;

export type ResolveChannelEnrollmentInput = Omit<
  ProvisionChannelEnrollmentInput,
  "messageId" | "openingRequest" | "welcomeParts" | "openingDispatch"
>;

export type ChannelOnboardingOperationPayload = DirectChannelOnboardingPayload;

const receiptPayloadSchema =
  enrollmentInputSchema.shape.openingRequest.unwrap();

export async function encryptChannelOnboardingOperationPayload({
  operationId,
  payload,
}: {
  readonly operationId: string;
  readonly payload: ChannelOnboardingOperationPayload;
}) {
  const { secretEncryptionKey } = await getInstallationSecrets();
  return encrypt(
    operationId,
    JSON.stringify(directChannelOnboardingPayloadSchema.parse(payload)),
    secretEncryptionKey,
    "operation"
  );
}

export async function decryptChannelOnboardingOperationPayload({
  encryptedPayload,
  operationId,
}: {
  readonly encryptedPayload: string;
  readonly operationId: string;
}): Promise<ChannelOnboardingOperationPayload> {
  const { secretEncryptionKey } = await getInstallationSecrets();
  return directChannelOnboardingPayloadSchema.parse(
    JSON.parse(
      decrypt(operationId, encryptedPayload, secretEncryptionKey, "operation")
    )
  );
}

export async function decryptChannelOnboardingReceiptPayload({
  encryptedPayload,
  receiptId,
}: {
  readonly encryptedPayload: string;
  readonly receiptId: string;
}) {
  const { secretEncryptionKey } = await getInstallationSecrets();
  return receiptPayloadSchema.parse(
    JSON.parse(
      decrypt(receiptId, encryptedPayload, secretEncryptionKey, "receipt")
    )
  );
}

export async function provisionChannelEnrollment(
  input: ProvisionChannelEnrollmentInput
): Promise<ChannelEnrollmentResult> {
  const parsed = enrollmentInputSchema.parse(input);
  if (parsed.provider !== "sendblue") return notReady;
  const material = await phoneIdentityMaterial(parsed.phoneNumber);
  const payload = JSON.stringify(parsed.openingRequest ?? {});
  try {
    const result = await provisionChannelEnrollmentTransaction({
      ...parsed,
      ...material,
      payload,
    });
    return await qualifyProvisionResult(parsed, result);
  } catch (error) {
    if (uniqueViolationSchema.safeParse(error).success) {
      const result = await provisionChannelEnrollmentTransaction({
        ...parsed,
        ...material,
        payload,
      });
      return qualifyProvisionResult(parsed, result);
    }
    throw error;
  }
}

async function qualifyProvisionResult(
  input: z.output<typeof enrollmentInputSchema>,
  result: ChannelEnrollmentResult
): Promise<ChannelEnrollmentResult> {
  if (result.status !== "ready") return result;
  const resolved = await resolveChannelEnrollment({
    phoneNumber: input.phoneNumber,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerConversationId: input.providerConversationId,
    providerLineId: input.providerLineId,
  });
  return resolved &&
    resolved.enrollmentId === result.enrollmentId &&
    resolved.bindingId === result.bindingId
    ? { ...resolved, receiptId: result.receiptId }
    : notReady;
}

async function provisionChannelEnrollmentTransaction({
  messageId,
  normalizedPhoneNumber,
  payload,
  phoneLookupHash,
  provider,
  providerAccountId,
  providerConversationId,
  providerLineId,
  secretEncryptionKey,
  welcomeParts,
  openingDispatch,
}: Omit<
  z.output<typeof enrollmentInputSchema>,
  "phoneNumber" | "openingRequest"
> &
  Awaited<ReturnType<typeof phoneIdentityMaterial>> & {
    readonly payload: string;
  }) {
  return db.transaction(async (transaction) => {
    await lockChannelOnboardingSubject(transaction, {
      phoneLookupHash,
      provider,
      providerAccountId,
      providerLineId,
    });
    const [suppression] = await transaction
      .select({ status: channelCommunicationSuppressions.status })
      .from(channelCommunicationSuppressions)
      .where(
        and(
          eq(channelCommunicationSuppressions.provider, provider),
          eq(
            channelCommunicationSuppressions.providerAccountId,
            providerAccountId
          ),
          eq(channelCommunicationSuppressions.providerLineId, providerLineId),
          eq(channelCommunicationSuppressions.phoneLookupHash, phoneLookupHash)
        )
      )
      .limit(1);
    if (suppression?.status === "stopped") return notReady;
    const [receipt] = await transaction
      .select({
        agentId: agents.id,
        bindingId: channelOnboardingEnrollments.channelConversationId,
        enrollmentId: channelOnboardingEnrollments.id,
        phoneIdentityId: channelOnboardingEnrollments.phoneIdentityId,
        principalId: channelOnboardingEnrollments.principalId,
        providerConversationId:
          channelOnboardingReceipts.providerConversationId,
        receiptId: channelOnboardingReceipts.id,
        userId: channelOnboardingEnrollments.userId,
        workspaceId: channelOnboardingEnrollments.workspaceId,
      })
      .from(channelOnboardingReceipts)
      .innerJoin(
        channelOnboardingEnrollments,
        eq(
          channelOnboardingReceipts.enrollmentId,
          channelOnboardingEnrollments.id
        )
      )
      .innerJoin(
        channelConversations,
        eq(
          channelOnboardingEnrollments.channelConversationId,
          channelConversations.id
        )
      )
      .innerJoin(agents, eq(channelConversations.agentId, agents.id))
      .where(
        and(
          eq(channelOnboardingReceipts.provider, provider),
          eq(channelOnboardingReceipts.providerAccountId, providerAccountId),
          eq(channelOnboardingReceipts.providerLineId, providerLineId),
          eq(channelOnboardingReceipts.messageHandle, messageId)
        )
      )
      .limit(1);
    if (receipt) {
      if (receipt.providerConversationId !== providerConversationId)
        return notReady;
      return ready(receipt);
    }

    const histories = await transaction
      .select({
        assurance: phoneIdentities.assurance,
        id: phoneIdentities.id,
        provenanceAccountId: phoneIdentities.provenanceAccountId,
        provenanceLineId: phoneIdentities.provenanceLineId,
        provenanceProvider: phoneIdentities.provenanceProvider,
        status: phoneIdentities.status,
        userId: phoneIdentities.userId,
      })
      .from(phoneIdentities)
      .where(eq(phoneIdentities.phoneLookupHash, phoneLookupHash))
      .for("update");
    const continuingChannelIdentity = histories.find(
      (identity) =>
        (identity.status === "active" &&
          identity.assurance === "channel_observed") ||
        (identity.status === "verified" &&
          identity.assurance === "otp_verified")
    );
    if (continuingChannelIdentity) {
      const existing = await readyEnrollmentForIdentity(
        transaction,
        continuingChannelIdentity.id
      );
      if (
        !existing ||
        continuingChannelIdentity.provenanceProvider !== provider ||
        continuingChannelIdentity.provenanceAccountId !== providerAccountId ||
        continuingChannelIdentity.provenanceLineId !== providerLineId ||
        existing.provider !== provider ||
        existing.providerAccountId !== providerAccountId ||
        existing.providerConversationId !== providerConversationId ||
        existing.providerLineId !== providerLineId
      ) {
        return notReady;
      }
      if (!(await isEnrollmentScopeOperable(transaction, existing)))
        return notReady;
      const appendedReceiptId = await appendOpeningReceipt(transaction, {
        enrollmentId: existing.enrollmentId,
        messageId,
        payload,
        provider,
        providerAccountId,
        providerConversationId,
        providerLineId,
        secretEncryptionKey,
      });
      return ready({
        ...existing,
        provider: existing.provider,
        receiptId: appendedReceiptId,
      });
    }
    if (histories.length > 0) return notReady;
    if (
      !welcomeParts ||
      welcomeParts.some(
        (part) =>
          part.from !== providerLineId || part.to !== normalizedPhoneNumber
      )
    ) {
      return notReady;
    }
    const [line] = await transaction
      .select({ id: platformLines.id, status: platformLines.status })
      .from(platformLines)
      .where(
        and(
          eq(platformLines.provider, provider),
          eq(platformLines.providerLineId, providerLineId)
        )
      )
      .limit(1);
    if (line?.status !== "active") return notReady;

    const reservation = await reserveChannelOnboardingEnrollment({
      requestKey: enrollmentReservationKey({
        messageId,
        provider,
        providerAccountId,
        providerLineId,
      }),
      scope: { provider: "sendblue", providerAccountId, providerLineId },
      senderKey: phoneLookupHash,
      transaction,
    });
    if (reservation.kind !== "reserved") return notReady;

    const now = new Date();
    const userId = randomUUID();
    const scope = accessScopeForUser(`better-auth:${userId}`);
    const identityId = randomUUID();
    const agentId = randomUUID();
    const revisionId = randomUUID();
    const bindingId = randomUUID();
    const enrollmentId = randomUUID();
    const receiptId = randomUUID();
    const welcomeIds = welcomeParts.map(() => randomUUID());
    const openingOperationId = randomUUID();

    await transaction.insert(user).values({
      email: `channel-${createHash("sha256")
        .update(phoneLookupHash)
        .digest("hex")}@local-vault.invalid`,
      id: userId,
      name: "Channel user",
      phoneNumber: normalizedPhoneNumber,
      phoneNumberVerified: false,
    });

    await transaction.insert(workspaces).values({ id: scope.workspaceId });
    await transaction.insert(workspaceMemberships).values({
      role: "owner",
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    });
    await transaction.insert(phoneIdentities).values({
      assurance: "channel_observed",
      encryptedPhoneNumber: encryptPhoneIdentityPhoneNumber(
        identityId,
        normalizedPhoneNumber,
        secretEncryptionKey
      ),
      id: identityId,
      observedAt: now,
      phoneLookupHash,
      provenanceAccountId: providerAccountId,
      provenanceLineId: providerLineId,
      provenanceProvider: provider,
      status: "active",
      userId,
      verifiedAt: null,
    });
    await transaction.insert(agents).values({
      activeRevisionId: null,
      displayName: "Personal assistant",
      id: agentId,
      slug: "personal-assistant",
      status: "draft",
      workspaceId: scope.workspaceId,
    });
    await transaction.insert(agentRevisions).values({
      agentId,
      contentDigest: agentManifestContentDigest(defaultAgentManifest),
      createdByUserId: scope.userId,
      id: revisionId,
      manifest: defaultAgentManifest,
      revisionNumber: 1,
      workspaceId: scope.workspaceId,
    });
    await transaction
      .update(agents)
      .set({ activeRevisionId: revisionId, status: "active", updatedAt: now })
      .where(
        and(eq(agents.id, agentId), eq(agents.workspaceId, scope.workspaceId))
      );
    await transaction.insert(channelConversations).values({
      agentId,
      id: bindingId,
      pinnedRevisionId: revisionId,
      platformLineId: line.id,
      provider,
      providerAccountId,
      providerConversationId,
      workspaceId: scope.workspaceId,
    });
    await transaction.insert(channelParticipants).values({
      conversationId: bindingId,
      id: randomUUID(),
      phoneIdentityId: identityId,
    });
    await transaction.insert(channelOnboardingEnrollments).values({
      capabilities: channelCapabilities,
      channelConversationId: bindingId,
      id: enrollmentId,
      phoneIdentityId: identityId,
      principalId: scope.userId,
      nextOpeningRequestOrdinal: 1,
      userId,
      workspaceId: scope.workspaceId,
    });
    await transaction.insert(channelOnboardingReceipts).values({
      encryptedPayload: encrypt(
        receiptId,
        payload,
        secretEncryptionKey,
        "receipt"
      ),
      enrollmentId,
      id: receiptId,
      messageHandle: messageId,
      provider,
      providerAccountId,
      providerConversationId,
      providerLineId,
    });
    await transaction.insert(channelOnboardingOperations).values([
      ...welcomeIds.map((id, ordinal) => ({
        copyVersion: ONBOARDING_COPY_VERSION,
        dependsOnOperationId: ordinal === 0 ? null : welcomeIds[ordinal - 1],
        enrollmentId,
        id,
        kind: "welcome" as const,
        ordinal,
        optional: Boolean(
          welcomeParts[ordinal]?.presentation &&
          welcomeParts[ordinal].presentation.kind !== "text"
        ),
        encryptedPayload: encrypt(
          id,
          JSON.stringify(welcomeParts[ordinal]),
          secretEncryptionKey,
          "operation"
        ),
        provider,
        providerAccountId,
        providerConversationId,
        providerLineId,
        receiptId,
      })),
      {
        dependsOnOperationId:
          openingDispatch === "after_welcome"
            ? welcomeIds[welcomeIds.length - 1]
            : welcomeIds[1],
        copyVersion: ONBOARDING_COPY_VERSION,
        enrollmentId,
        id: openingOperationId,
        kind: "opening_request" as const,
        ordinal: 0,
        provider,
        providerAccountId,
        providerConversationId,
        providerLineId,
        receiptId,
      },
    ]);
    return ready({
      agentId,
      bindingId,
      enrollmentId,
      phoneIdentityId: identityId,
      principalId: scope.userId,
      receiptId,
      userId,
      workspaceId: scope.workspaceId,
    });
  });
}

async function readyEnrollmentForIdentity(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  phoneIdentityId: string
) {
  const [row] = await transaction
    .select({
      agentId: agents.id,
      authAssurance: phoneIdentities.assurance,
      bindingId: channelOnboardingEnrollments.channelConversationId,
      enrollmentId: channelOnboardingEnrollments.id,
      phoneIdentityId: channelOnboardingEnrollments.phoneIdentityId,
      principalId: channelOnboardingEnrollments.principalId,
      receiptId: channelOnboardingReceipts.id,
      provider: channelConversations.provider,
      providerAccountId: channelConversations.providerAccountId,
      providerConversationId: channelConversations.providerConversationId,
      providerLineId: platformLines.providerLineId,
      userId: channelOnboardingEnrollments.userId,
      workspaceId: channelOnboardingEnrollments.workspaceId,
    })
    .from(channelOnboardingEnrollments)
    .innerJoin(
      phoneIdentities,
      eq(channelOnboardingEnrollments.phoneIdentityId, phoneIdentities.id)
    )
    .innerJoin(
      channelConversations,
      eq(
        channelOnboardingEnrollments.channelConversationId,
        channelConversations.id
      )
    )
    .innerJoin(
      channelParticipants,
      and(
        eq(channelParticipants.conversationId, channelConversations.id),
        eq(
          channelParticipants.phoneIdentityId,
          channelOnboardingEnrollments.phoneIdentityId
        )
      )
    )
    .innerJoin(agents, eq(channelConversations.agentId, agents.id))
    .innerJoin(
      platformLines,
      eq(channelConversations.platformLineId, platformLines.id)
    )
    .leftJoin(
      channelOnboardingReceipts,
      eq(
        channelOnboardingReceipts.enrollmentId,
        channelOnboardingEnrollments.id
      )
    )
    .where(
      and(
        eq(channelOnboardingEnrollments.phoneIdentityId, phoneIdentityId),
        eq(channelOnboardingEnrollments.status, "ready"),
        eq(channelParticipants.status, "active"),
        eq(channelConversations.status, "active"),
        eq(platformLines.status, "active"),
        eq(agents.status, "active")
      )
    )
    .limit(1);
  return row;
}

async function isEnrollmentScopeOperable(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  enrollment: { readonly principalId: string; readonly workspaceId: string }
) {
  const [scope] = await transaction
    .select({
      lifecycleState: workspaces.lifecycleState,
      membershipStatus: workspaceMemberships.status,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, enrollment.principalId)
      )
    )
    .where(eq(workspaces.id, enrollment.workspaceId))
    .limit(1);
  return (
    scope?.membershipStatus === "active" &&
    (scope.lifecycleState === "trial" || scope.lifecycleState === "active")
  );
}

async function appendOpeningReceipt(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    readonly enrollmentId: string;
    readonly messageId: string;
    readonly payload: string;
    readonly provider: PlatformLineProvider;
    readonly providerAccountId: string;
    readonly providerConversationId: string;
    readonly providerLineId: string;
    readonly secretEncryptionKey: string;
  }
) {
  const [enrollment] = await transaction
    .select({
      nextOrdinal: channelOnboardingEnrollments.nextOpeningRequestOrdinal,
    })
    .from(channelOnboardingEnrollments)
    .where(eq(channelOnboardingEnrollments.id, input.enrollmentId))
    .for("update")
    .limit(1);
  if (!enrollment) throw new Error("Channel enrollment is missing.");
  const [welcomeDependency] = await transaction
    .select({ id: channelOnboardingOperations.id })
    .from(channelOnboardingOperations)
    .where(
      and(
        eq(channelOnboardingOperations.enrollmentId, input.enrollmentId),
        eq(channelOnboardingOperations.kind, "welcome"),
        eq(channelOnboardingOperations.ordinal, 1)
      )
    )
    .limit(1);
  if (!welcomeDependency)
    throw new Error("Channel enrollment is missing its core welcome.");
  const [previousOpening] = await transaction
    .select({ id: channelOnboardingOperations.id })
    .from(channelOnboardingOperations)
    .where(
      and(
        eq(channelOnboardingOperations.enrollmentId, input.enrollmentId),
        eq(channelOnboardingOperations.kind, "opening_request")
      )
    )
    .orderBy(desc(channelOnboardingOperations.ordinal))
    .limit(1);
  await transaction
    .update(channelOnboardingOperations)
    .set({ state: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(channelOnboardingOperations.enrollmentId, input.enrollmentId),
        eq(channelOnboardingOperations.kind, "welcome"),
        eq(channelOnboardingOperations.optional, true),
        inArray(channelOnboardingOperations.state, ["pending", "leased"])
      )
    );
  const receiptId = randomUUID();
  await transaction.insert(channelOnboardingReceipts).values({
    encryptedPayload: encrypt(
      receiptId,
      input.payload,
      input.secretEncryptionKey,
      "receipt"
    ),
    enrollmentId: input.enrollmentId,
    id: receiptId,
    messageHandle: input.messageId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerConversationId: input.providerConversationId,
    providerLineId: input.providerLineId,
  });
  await transaction.insert(channelOnboardingOperations).values({
    copyVersion: ONBOARDING_COPY_VERSION,
    dependsOnOperationId: previousOpening?.id ?? welcomeDependency.id,
    enrollmentId: input.enrollmentId,
    id: randomUUID(),
    kind: "opening_request",
    ordinal: enrollment.nextOrdinal,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerConversationId: input.providerConversationId,
    providerLineId: input.providerLineId,
    receiptId,
  });
  await transaction
    .update(channelOnboardingEnrollments)
    .set({
      nextOpeningRequestOrdinal: enrollment.nextOrdinal + 1,
      updatedAt: new Date(),
    })
    .where(eq(channelOnboardingEnrollments.id, input.enrollmentId));
  return receiptId;
}

function ready(input: {
  readonly agentId: string;
  readonly authAssurance?: "channel_observed" | "otp_verified";
  readonly bindingId: string;
  readonly enrollmentId: string;
  readonly phoneIdentityId: string;
  readonly principalId: string;
  readonly receiptId: string | null;
  readonly provider?: PlatformLineProvider;
  readonly providerAccountId?: string;
  readonly providerConversationId?: string;
  readonly providerLineId?: string;
  readonly userId: string;
  readonly workspaceId: string;
}): ChannelEnrollmentReady {
  if (!input.receiptId)
    throw new Error("Ready enrollment is missing a receipt.");
  const authAssurance = input.authAssurance ?? "channel_observed";
  return {
    ...input,
    assurance: authAssurance,
    authAssurance,
    capabilityProfile:
      authAssurance === "otp_verified" ? "full" : "channel-basic",
    capabilities: channelCapabilities,
    identityProvenance:
      authAssurance === "otp_verified" ? "phone_otp" : "sendblue_direct",
    receiptId: input.receiptId,
    status: "ready",
  };
}

export async function resolveChannelEnrollment(
  input: ResolveChannelEnrollmentInput
): Promise<ChannelEnrollmentReady | undefined> {
  const parsed = enrollmentInputSchema
    .omit({ messageId: true, openingRequest: true, welcomeParts: true })
    .parse(input);
  if (await isChannelCommunicationStopped(parsed)) return undefined;
  const { phoneLookupHash } = await phoneIdentityMaterial(parsed.phoneNumber);
  const [row] = await db
    .select({
      agentId: agents.id,
      authAssurance: phoneIdentities.assurance,
      bindingId: channelOnboardingEnrollments.channelConversationId,
      enrollmentId: channelOnboardingEnrollments.id,
      phoneIdentityId: channelOnboardingEnrollments.phoneIdentityId,
      principalId: channelOnboardingEnrollments.principalId,
      receiptId: channelOnboardingReceipts.id,
      userId: channelOnboardingEnrollments.userId,
      workspaceId: channelOnboardingEnrollments.workspaceId,
    })
    .from(channelOnboardingEnrollments)
    .innerJoin(
      phoneIdentities,
      eq(channelOnboardingEnrollments.phoneIdentityId, phoneIdentities.id)
    )
    .innerJoin(
      channelConversations,
      eq(
        channelOnboardingEnrollments.channelConversationId,
        channelConversations.id
      )
    )
    .innerJoin(
      channelParticipants,
      and(
        eq(channelParticipants.conversationId, channelConversations.id),
        eq(
          channelParticipants.phoneIdentityId,
          channelOnboardingEnrollments.phoneIdentityId
        )
      )
    )
    .innerJoin(agents, eq(channelConversations.agentId, agents.id))
    .innerJoin(
      platformLines,
      eq(channelConversations.platformLineId, platformLines.id)
    )
    .leftJoin(
      channelOnboardingReceipts,
      eq(
        channelOnboardingReceipts.enrollmentId,
        channelOnboardingEnrollments.id
      )
    )
    .where(
      and(
        eq(channelOnboardingEnrollments.status, "ready"),
        eq(channelParticipants.status, "active"),
        eq(phoneIdentities.phoneLookupHash, phoneLookupHash),
        inArray(phoneIdentities.status, ["active", "verified"]),
        inArray(phoneIdentities.assurance, [
          "channel_observed",
          "otp_verified",
        ]),
        eq(phoneIdentities.provenanceProvider, parsed.provider),
        eq(phoneIdentities.provenanceAccountId, parsed.providerAccountId),
        eq(phoneIdentities.provenanceLineId, parsed.providerLineId),
        eq(channelConversations.status, "active"),
        eq(channelConversations.provider, parsed.provider),
        eq(channelConversations.providerAccountId, parsed.providerAccountId),
        eq(
          channelConversations.providerConversationId,
          parsed.providerConversationId
        ),
        eq(platformLines.providerLineId, parsed.providerLineId),
        eq(platformLines.status, "active"),
        eq(agents.status, "active")
      )
    )
    .limit(1);
  if (!row?.receiptId) return undefined;
  const scope = await verifyScopeAccess({
    userId: row.principalId,
    workspaceId: row.workspaceId,
  });
  return scope ? ready(row) : undefined;
}

const communicationSubjectSchema = enrollmentInputSchema.pick({
  phoneNumber: true,
  provider: true,
  providerAccountId: true,
  providerLineId: true,
});

const communicationCommandSchema = communicationSubjectSchema.extend({
  messageHandle: z.string().min(1).max(512),
});

export type ChannelCommunicationCommandInput = z.input<
  typeof communicationCommandSchema
>;
export async function isChannelCommunicationStopped(
  input: z.input<typeof communicationSubjectSchema>
) {
  const parsed = communicationSubjectSchema.parse(input);
  const { phoneLookupHash } = await phoneIdentityMaterial(parsed.phoneNumber);
  const [suppression] = await db
    .select({ status: channelCommunicationSuppressions.status })
    .from(channelCommunicationSuppressions)
    .where(
      and(
        eq(channelCommunicationSuppressions.provider, parsed.provider),
        eq(
          channelCommunicationSuppressions.providerAccountId,
          parsed.providerAccountId
        ),
        eq(
          channelCommunicationSuppressions.providerLineId,
          parsed.providerLineId
        ),
        eq(channelCommunicationSuppressions.phoneLookupHash, phoneLookupHash)
      )
    )
    .limit(1);
  return suppression?.status === "stopped";
}

export function parseChannelCommunicationCommand(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll(/\s+/g, " ");
  if (
    [
      "stop",
      "unsubscribe",
      "cancel",
      "opt out",
      "revoke",
      "end",
      "quit",
    ].includes(normalized)
  )
    return "stop" as const;
  return normalized === "start" ? ("start" as const) : undefined;
}

export async function recordChannelCommunicationStop(
  input: ChannelCommunicationCommandInput
) {
  const parsed = communicationCommandSchema.parse(input);
  const { phoneLookupHash } = await phoneIdentityMaterial(parsed.phoneNumber);
  const now = new Date();
  await db.transaction(async (transaction) => {
    await lockChannelOnboardingSubject(transaction, {
      phoneLookupHash,
      provider: parsed.provider,
      providerAccountId: parsed.providerAccountId,
      providerLineId: parsed.providerLineId,
    });
    const [event] = await transaction
      .insert(channelCommunicationPreferenceEvents)
      .values({
        command: "stop",
        id: randomUUID(),
        messageHandle: parsed.messageHandle,
        phoneLookupHash,
        provider: parsed.provider,
        providerAccountId: parsed.providerAccountId,
        providerLineId: parsed.providerLineId,
      })
      .onConflictDoNothing()
      .returning({ id: channelCommunicationPreferenceEvents.id });
    if (!event) return;
    await transaction
      .insert(channelCommunicationSuppressions)
      .values({
        id: randomUUID(),
        phoneLookupHash,
        provider: parsed.provider,
        providerAccountId: parsed.providerAccountId,
        providerLineId: parsed.providerLineId,
        status: "stopped",
        stoppedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: { status: "stopped", stoppedAt: now, updatedAt: now },
        target: [
          channelCommunicationSuppressions.provider,
          channelCommunicationSuppressions.providerAccountId,
          channelCommunicationSuppressions.providerLineId,
          channelCommunicationSuppressions.phoneLookupHash,
        ],
      });
    const enrolled = await transaction
      .select({ id: channelOnboardingEnrollments.id })
      .from(channelOnboardingEnrollments)
      .innerJoin(
        phoneIdentities,
        eq(channelOnboardingEnrollments.phoneIdentityId, phoneIdentities.id)
      )
      .where(
        and(
          eq(channelOnboardingEnrollments.status, "ready"),
          eq(phoneIdentities.phoneLookupHash, phoneLookupHash),
          inArray(phoneIdentities.status, ["active", "verified"]),
          inArray(phoneIdentities.assurance, [
            "channel_observed",
            "otp_verified",
          ]),
          eq(phoneIdentities.provenanceProvider, parsed.provider),
          eq(phoneIdentities.provenanceAccountId, parsed.providerAccountId),
          eq(phoneIdentities.provenanceLineId, parsed.providerLineId)
        )
      );
    const enrollmentIds = enrolled.map((row) => row.id);
    if (enrollmentIds.length === 0) return;
    await transaction
      .update(channelOnboardingOperations)
      .set({ state: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(channelOnboardingOperations.enrollmentId, enrollmentIds),
          inArray(channelOnboardingOperations.state, ["pending", "leased"])
        )
      );
  });
}

async function lockChannelOnboardingSubject(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  subject: {
    readonly phoneLookupHash: string;
    readonly provider: PlatformLineProvider;
    readonly providerAccountId: string;
    readonly providerLineId: string;
  }
) {
  const lockKey = `channel-onboarding-subject:${subject.provider}:${subject.providerAccountId}:${subject.providerLineId}:${subject.phoneLookupHash}`;
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
  );
}

function enrollmentReservationKey(input: {
  readonly messageId: string;
  readonly provider: PlatformLineProvider;
  readonly providerAccountId: string;
  readonly providerLineId: string;
}) {
  return createHash("sha256")
    .update(
      `${input.provider}\u0000${input.providerAccountId}\u0000${input.providerLineId}\u0000${input.messageId}`
    )
    .digest("base64url");
}

export async function recordChannelCommunicationStart(
  input: ChannelCommunicationCommandInput
) {
  const parsed = communicationCommandSchema.parse(input);
  const { phoneLookupHash } = await phoneIdentityMaterial(parsed.phoneNumber);
  const now = new Date();
  await db.transaction(async (transaction) => {
    await lockChannelOnboardingSubject(transaction, {
      phoneLookupHash,
      provider: parsed.provider,
      providerAccountId: parsed.providerAccountId,
      providerLineId: parsed.providerLineId,
    });
    const [event] = await transaction
      .insert(channelCommunicationPreferenceEvents)
      .values({
        command: "start",
        id: randomUUID(),
        messageHandle: parsed.messageHandle,
        phoneLookupHash,
        provider: parsed.provider,
        providerAccountId: parsed.providerAccountId,
        providerLineId: parsed.providerLineId,
      })
      .onConflictDoNothing()
      .returning({ id: channelCommunicationPreferenceEvents.id });
    if (!event) return;
    await transaction
      .update(channelCommunicationSuppressions)
      .set({ providerOptedInAt: now, status: "active", updatedAt: now })
      .where(
        and(
          eq(channelCommunicationSuppressions.provider, parsed.provider),
          eq(
            channelCommunicationSuppressions.providerAccountId,
            parsed.providerAccountId
          ),
          eq(
            channelCommunicationSuppressions.providerLineId,
            parsed.providerLineId
          ),
          eq(channelCommunicationSuppressions.phoneLookupHash, phoneLookupHash)
        )
      );
  });
}

function encrypt(
  id: string,
  value: string,
  secretEncryptionKey: string,
  purpose: "operation" | "receipt"
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(secretEncryptionKey, "base64"),
        Buffer.alloc(0),
        `channel-onboarding-${purpose}`,
        32
      )
    ),
    iv
  );
  cipher.setAAD(Buffer.from(`channel-onboarding-${purpose}\u0000${id}`));
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

function decrypt(
  id: string,
  encryptedValue: string,
  secretEncryptionKey: string,
  purpose: "operation" | "receipt"
) {
  const [version, encodedIv, encodedTag, encodedCiphertext] =
    encryptedValue.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error(
      "Channel onboarding payload has an invalid encryption envelope."
    );
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(secretEncryptionKey, "base64"),
        Buffer.alloc(0),
        `channel-onboarding-${purpose}`,
        32
      )
    ),
    Buffer.from(encodedIv, "base64url")
  );
  decipher.setAAD(Buffer.from(`channel-onboarding-${purpose}\u0000${id}`));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

const uniqueViolationSchema = z.object({
  cause: z.object({ code: z.literal("23505") }),
});
