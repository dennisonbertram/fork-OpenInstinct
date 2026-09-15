import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  channelOnboardingEnrollments,
  channelOnboardingOperations,
  channelOnboardingReceipts,
  channelCommunicationSuppressions,
  channelConversations,
  channelParticipants,
  db,
  phoneIdentities,
  platformLines,
  workspaceMemberships,
  workspaces,
  type ChannelOnboardingOperationKind,
  type PlatformLineProvider,
} from "@/db";
import {
  encryptChannelOnboardingOperationPayload,
  type ChannelOnboardingOperationPayload,
} from "./channel-onboarding";
import { phoneIdentityMaterial } from "./phone-identities";

// Dependencies establish presentation order, not a requirement that a previous
// provider attempt reached the recipient. A terminal optional/unknown welcome
// must not trap the user's original request or later usable conversation.
const settledDependencyStates = [
  "accepted",
  "cancelled",
  "delivered",
  "failed",
  "uncertain",
] as const;
const deliveryLeaseMs = 60_000;
const maximumProviderAttempts = 3;
const providerStatusRetryMs = 60_000;
const uncertainStatusRetryMs = 5 * 60_000;

export interface ChannelOnboardingOperationFence {
  readonly id: string;
  readonly leaseToken: string;
  readonly version: number;
}

/**
 * Persists one already-split model reply before SendBlue sees it. `replyKey`
 * must be stable for a model session/turn/call/part so a replay returns the
 * same operation rather than creating a duplicate physical message.
 */
export async function enqueueChannelOnboardingOutboundReply({
  bindingId,
  payload,
  replyKey,
}: {
  readonly bindingId: string;
  readonly payload: ChannelOnboardingOperationPayload;
  readonly replyKey: string;
}): Promise<{ readonly id: string; readonly inserted: boolean } | undefined> {
  if (replyKey.trim().length === 0) {
    throw new Error(
      "An onboarding outbound reply requires a stable reply key."
    );
  }
  const recipient = await phoneIdentityMaterial(payload.to);
  return db.transaction(async (transaction) => {
    const [enrollment] = await transaction
      .select({
        enrollmentId: channelOnboardingEnrollments.id,
        phoneLookupHash: phoneIdentities.phoneLookupHash,
        provider: channelConversations.provider,
        providerAccountId: channelConversations.providerAccountId,
        providerConversationId: channelConversations.providerConversationId,
        providerLineId: platformLines.providerLineId,
      })
      .from(channelOnboardingEnrollments)
      .innerJoin(
        channelConversations,
        eq(
          channelOnboardingEnrollments.channelConversationId,
          channelConversations.id
        )
      )
      .innerJoin(
        phoneIdentities,
        eq(phoneIdentities.id, channelOnboardingEnrollments.phoneIdentityId)
      )
      .innerJoin(
        platformLines,
        eq(channelConversations.platformLineId, platformLines.id)
      )
      .where(
        and(
          eq(channelOnboardingEnrollments.channelConversationId, bindingId),
          eq(channelOnboardingEnrollments.status, "ready"),
          eq(channelConversations.status, "active"),
          eq(platformLines.status, "active"),
          inArray(phoneIdentities.status, ["active", "verified"])
        )
      )
      .for("update")
      .limit(1);
    if (enrollment?.provider !== "sendblue") return undefined;
    if (payload.from !== enrollment.providerLineId) {
      throw new Error(
        "The outbound payload sender does not match its channel line."
      );
    }
    if (recipient.phoneLookupHash !== enrollment.phoneLookupHash) {
      throw new Error(
        "The outbound payload recipient does not match its enrollment."
      );
    }

    const [existing] = await transaction
      .select({
        enrollmentId: channelOnboardingOperations.enrollmentId,
        id: channelOnboardingOperations.id,
      })
      .from(channelOnboardingOperations)
      .where(eq(channelOnboardingOperations.replyKey, replyKey))
      .limit(1);
    if (existing) {
      if (existing.enrollmentId !== enrollment.enrollmentId) {
        throw new Error(
          "The outbound reply key belongs to another enrollment."
        );
      }
      return { id: existing.id, inserted: false };
    }

    // The enrollment row is locked above, so every split reply gets a stable
    // predecessor. This prevents a concurrent webhook/schedule claim from
    // physically sending part two before part one.
    const [last] = await transaction
      .select({
        id: channelOnboardingOperations.id,
        ordinal: channelOnboardingOperations.ordinal,
      })
      .from(channelOnboardingOperations)
      .where(
        and(
          eq(channelOnboardingOperations.enrollmentId, enrollment.enrollmentId),
          eq(channelOnboardingOperations.kind, "outbound_reply")
        )
      )
      .orderBy(sql`${channelOnboardingOperations.ordinal} desc`)
      .limit(1);
    const id = randomUUID();
    const encryptedPayload = await encryptChannelOnboardingOperationPayload({
      operationId: id,
      payload,
    });
    const [inserted] = await transaction
      .insert(channelOnboardingOperations)
      .values({
        copyVersion: "v1",
        dependsOnOperationId: last?.id,
        encryptedPayload,
        enrollmentId: enrollment.enrollmentId,
        id,
        kind: "outbound_reply",
        ordinal: (last?.ordinal ?? -1) + 1,
        provider: enrollment.provider,
        providerAccountId: enrollment.providerAccountId,
        providerConversationId: enrollment.providerConversationId,
        providerLineId: enrollment.providerLineId,
        replyKey,
      })
      .onConflictDoNothing()
      .returning({ id: channelOnboardingOperations.id });
    if (inserted) return { id: inserted.id, inserted: true };

    const [raced] = await transaction
      .select({
        enrollmentId: channelOnboardingOperations.enrollmentId,
        id: channelOnboardingOperations.id,
      })
      .from(channelOnboardingOperations)
      .where(eq(channelOnboardingOperations.replyKey, replyKey))
      .limit(1);
    if (!raced) return undefined;
    if (raced.enrollmentId !== enrollment.enrollmentId) {
      throw new Error("The outbound reply key belongs to another enrollment.");
    }
    return { id: raced.id, inserted: false };
  });
}

/**
 * Metadata-only post-drain view for the channel completion guard. It is scoped
 * to the exact binding and reply identity and never decrypts or returns the
 * assistant payload. `provider_accepted` means the provider returned a handle;
 * it is not a claim that the recipient received the message.
 */
export async function getChannelOnboardingOutboundReplyDelivery({
  bindingId,
  replyKey,
}: {
  readonly bindingId: string;
  readonly replyKey: string;
}): Promise<
  | { readonly kind: "pending" }
  | { readonly kind: "provider_accepted"; readonly providerHandle: string }
  | { readonly kind: "uncertain" }
  | { readonly kind: "failed" }
  | undefined
> {
  const [operation] = await db
    .select({
      providerHandle: channelOnboardingOperations.providerHandle,
      state: channelOnboardingOperations.state,
    })
    .from(channelOnboardingOperations)
    .innerJoin(
      channelOnboardingEnrollments,
      eq(
        channelOnboardingOperations.enrollmentId,
        channelOnboardingEnrollments.id
      )
    )
    .where(
      and(
        eq(channelOnboardingEnrollments.channelConversationId, bindingId),
        eq(channelOnboardingOperations.kind, "outbound_reply"),
        eq(channelOnboardingOperations.replyKey, replyKey)
      )
    )
    .limit(1);
  if (!operation) return undefined;
  if (operation.state === "accepted" || operation.state === "delivered") {
    return operation.providerHandle
      ? { kind: "provider_accepted", providerHandle: operation.providerHandle }
      : { kind: "pending" };
  }
  if (operation.state === "uncertain") return { kind: "uncertain" };
  if (operation.state === "failed" || operation.state === "cancelled") {
    return { kind: "failed" };
  }
  return { kind: "pending" };
}

/** Raw persisted claim. Payload decryption is deliberately deferred to its owner. */
export interface ClaimedChannelOnboardingOperation {
  readonly bindingId: string;
  readonly encryptedPayload: string | null;
  readonly encryptedReceiptPayload: string | null;
  readonly enrollmentId: string;
  readonly id: string;
  readonly identityAssurance: "channel_observed" | "otp_verified";
  readonly kind: ChannelOnboardingOperationKind;
  readonly leaseToken: string;
  readonly provider: "linq" | "sendblue";
  readonly providerAccountId: string;
  readonly providerConversationId: string;
  readonly providerLineId: string;
  readonly principalId: string;
  readonly receiptId: string | null;
  readonly version: number;
  readonly workspaceId: string;
}

export async function claimChannelOnboardingOperations({
  bindingId,
  kinds,
  leaseForMs = deliveryLeaseMs,
  limit,
  now = new Date(),
  owner,
  provider,
}: {
  /** Webhook drains must constrain claims to their current conversation. */
  readonly bindingId?: string;
  /** A workflow-only direct reply drain must not claim Eve handoff work. */
  readonly kinds?: readonly ChannelOnboardingOperationKind[];
  readonly leaseForMs?: number;
  readonly limit: number;
  readonly now?: Date;
  /** Recorded only in process-local diagnostics; lease ownership is the token. */
  readonly owner: string;
  readonly provider?: PlatformLineProvider;
}): Promise<readonly ClaimedChannelOnboardingOperation[]> {
  validateClaimInput({ leaseForMs, limit, owner });
  const dependency = alias(
    channelOnboardingOperations,
    "onboarding_dependency"
  );

  return db.transaction(async (transaction) => {
    // An `attempted` record may already have reached Eve or SendBlue. Recovery
    // converts it to uncertain before selecting new work, never to pending.
    await recoverExpiredAttempted(transaction, now);

    const candidates = await transaction
      .select({
        enrollment: {
          bindingId: channelOnboardingEnrollments.channelConversationId,
          principalId: channelOnboardingEnrollments.principalId,
          workspaceId: channelOnboardingEnrollments.workspaceId,
        },
        identity: { assurance: phoneIdentities.assurance },
        operation: channelOnboardingOperations,
        receipt: {
          encryptedPayload: channelOnboardingReceipts.encryptedPayload,
        },
      })
      .from(channelOnboardingOperations)
      .innerJoin(
        channelOnboardingEnrollments,
        eq(
          channelOnboardingOperations.enrollmentId,
          channelOnboardingEnrollments.id
        )
      )
      .leftJoin(
        channelOnboardingReceipts,
        eq(channelOnboardingOperations.receiptId, channelOnboardingReceipts.id)
      )
      .innerJoin(
        phoneIdentities,
        eq(phoneIdentities.id, channelOnboardingEnrollments.phoneIdentityId)
      )
      .leftJoin(
        dependency,
        eq(channelOnboardingOperations.dependsOnOperationId, dependency.id)
      )
      .where(
        and(
          eq(channelOnboardingEnrollments.status, "ready"),
          bindingId
            ? eq(channelOnboardingEnrollments.channelConversationId, bindingId)
            : undefined,
          kinds && kinds.length > 0
            ? inArray(channelOnboardingOperations.kind, kinds)
            : undefined,
          provider
            ? eq(channelOnboardingOperations.provider, provider)
            : undefined,
          activeRuntimeGuard(channelOnboardingOperations),
          or(
            eq(channelOnboardingOperations.state, "pending"),
            and(
              eq(channelOnboardingOperations.state, "leased"),
              lte(channelOnboardingOperations.leaseExpiresAt, now)
            )
          ),
          or(
            isNull(channelOnboardingOperations.retryAt),
            lte(channelOnboardingOperations.retryAt, now)
          ),
          or(
            isNull(channelOnboardingOperations.dependsOnOperationId),
            inArray(dependency.state, settledDependencyStates)
          )
        )
      )
      .orderBy(asc(channelOnboardingOperations.createdAt))
      .limit(limit)
      .for("update", { of: channelOnboardingOperations, skipLocked: true });

    const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
    return candidates.reduce<Promise<ClaimedChannelOnboardingOperation[]>>(
      async (previous, { enrollment, identity, operation, receipt }) => {
        const claims = await previous;
        const leaseToken = randomUUID();
        const [claimed] = await transaction
          .update(channelOnboardingOperations)
          .set({
            leaseExpiresAt,
            leaseToken,
            retryAt: null,
            state: "leased",
            updatedAt: now,
            version: sql`${channelOnboardingOperations.version} + 1`,
          })
          .where(
            and(
              eq(channelOnboardingOperations.id, operation.id),
              eq(channelOnboardingOperations.version, operation.version),
              eq(channelOnboardingOperations.state, operation.state)
            )
          )
          .returning();
        if (claimed) {
          claims.push({
            bindingId: enrollment.bindingId,
            encryptedPayload: claimed.encryptedPayload,
            encryptedReceiptPayload: receipt?.encryptedPayload ?? null,
            enrollmentId: claimed.enrollmentId,
            id: claimed.id,
            identityAssurance: identity.assurance,
            kind: claimed.kind,
            leaseToken,
            provider: claimed.provider,
            providerAccountId: claimed.providerAccountId,
            providerConversationId: claimed.providerConversationId,
            providerLineId: claimed.providerLineId,
            principalId: enrollment.principalId,
            receiptId: claimed.receiptId,
            version: claimed.version,
            workspaceId: enrollment.workspaceId,
          });
        }
        return claims;
      },
      Promise.resolve([])
    );
  });
}

export async function markChannelOnboardingOperationAttempted(
  fence: ChannelOnboardingOperationFence,
  now = new Date()
) {
  const [updated] = await db
    .update(channelOnboardingOperations)
    .set({
      attemptCount: sql`${channelOnboardingOperations.attemptCount} + 1`,
      state: "attempted",
      updatedAt: now,
    })
    .where(
      and(
        exactLease(fence),
        eq(channelOnboardingOperations.state, "leased"),
        gt(channelOnboardingOperations.leaseExpiresAt, now),
        activeRuntimeGuard(channelOnboardingOperations)
      )
    )
    .returning({ id: channelOnboardingOperations.id });
  return updated !== undefined;
}

export async function acceptChannelOnboardingProviderOperation(
  input: ChannelOnboardingOperationFence & { readonly providerHandle: string },
  now = new Date()
) {
  return transitionAttempt(input, {
    leaseExpiresAt: null,
    leaseToken: null,
    providerHandle: input.providerHandle,
    retryAt: null,
    state: "accepted",
    updatedAt: now,
  });
}

export async function acceptChannelOnboardingHandoffOperation(
  input: ChannelOnboardingOperationFence & { readonly sessionId: string },
  now = new Date()
) {
  return transitionAttempt(input, {
    eveSessionId: input.sessionId,
    leaseExpiresAt: null,
    leaseToken: null,
    retryAt: null,
    state: "accepted",
    updatedAt: now,
  });
}

export async function releaseChannelOnboardingOperationAfterProvenUnsentFailure(
  input: ChannelOnboardingOperationFence & { readonly retryAt?: Date },
  now = new Date()
) {
  return db.transaction(async (transaction) => {
    const [operation] = await transaction
      .select({ attemptCount: channelOnboardingOperations.attemptCount })
      .from(channelOnboardingOperations)
      .where(
        and(
          exactLease(input),
          eq(channelOnboardingOperations.state, "attempted")
        )
      )
      .for("update");
    if (!operation) return false;
    const exhausted = operation.attemptCount >= maximumProviderAttempts;
    const [updated] = await transaction
      .update(channelOnboardingOperations)
      .set({
        lastError: exhausted
          ? "Provider rejected the onboarding operation after the retry budget."
          : null,
        leaseExpiresAt: null,
        leaseToken: null,
        retryAt: exhausted
          ? null
          : (input.retryAt ?? new Date(now.getTime() + providerStatusRetryMs)),
        state: exhausted ? "failed" : "pending",
        updatedAt: now,
      })
      .where(
        and(
          exactLease(input),
          eq(channelOnboardingOperations.state, "attempted")
        )
      )
      .returning({ id: channelOnboardingOperations.id });
    return updated !== undefined;
  });
}

/**
 * A quota refusal happens before the external call and before the final
 * attempt fence. It is therefore safe to make a leased operation terminal,
 * unlike a transport timeout or an ambiguous provider response.
 */
export async function failChannelOnboardingOperationAfterProvenUnsentFailure(
  fence: ChannelOnboardingOperationFence,
  now = new Date()
) {
  const [updated] = await db
    .update(channelOnboardingOperations)
    .set({
      lastError: "The onboarding delivery quota was exhausted before dispatch.",
      leaseExpiresAt: null,
      leaseToken: null,
      retryAt: null,
      state: "failed",
      updatedAt: now,
    })
    .where(
      and(exactLease(fence), eq(channelOnboardingOperations.state, "leased"))
    )
    .returning({ id: channelOnboardingOperations.id });
  return updated !== undefined;
}

export async function markChannelOnboardingOperationUncertain(
  fence: ChannelOnboardingOperationFence,
  now = new Date()
) {
  const [updated] = await db
    .update(channelOnboardingOperations)
    .set({
      lastError: "Dispatch outcome is unknown; reconciliation is required.",
      leaseExpiresAt: null,
      leaseToken: null,
      retryAt: null,
      state: "uncertain",
      updatedAt: now,
    })
    .where(
      and(exactLease(fence), eq(channelOnboardingOperations.state, "attempted"))
    )
    .returning({ id: channelOnboardingOperations.id });
  return updated !== undefined;
}

export async function recoverExpiredAttemptedChannelOnboardingOperations(
  now = new Date()
) {
  return db.transaction(async (transaction) => {
    const recovered = await recoverExpiredAttempted(transaction, now);
    return recovered.length;
  });
}

export type ClaimedChannelOnboardingProviderStatus =
  ChannelOnboardingOperationFence & {
    readonly providerHandle: string;
  };

export async function claimChannelOnboardingProviderStatuses({
  leaseForMs = deliveryLeaseMs,
  limit,
  now = new Date(),
  owner,
  provider,
}: {
  readonly leaseForMs?: number;
  readonly limit: number;
  readonly now?: Date;
  readonly owner: string;
  readonly provider?: PlatformLineProvider;
}): Promise<readonly ClaimedChannelOnboardingProviderStatus[]> {
  validateClaimInput({ leaseForMs, limit, owner });
  return db.transaction(async (transaction) => {
    const candidates = await transaction
      .select({ operation: channelOnboardingOperations })
      .from(channelOnboardingOperations)
      .where(
        and(
          eq(channelOnboardingOperations.state, "accepted"),
          provider
            ? eq(channelOnboardingOperations.provider, provider)
            : undefined,
          isNotNull(channelOnboardingOperations.providerHandle),
          or(
            isNull(channelOnboardingOperations.leaseExpiresAt),
            lte(channelOnboardingOperations.leaseExpiresAt, now)
          ),
          or(
            isNull(channelOnboardingOperations.retryAt),
            lte(channelOnboardingOperations.retryAt, now)
          )
        )
      )
      .orderBy(asc(channelOnboardingOperations.updatedAt))
      .limit(limit)
      .for("update", { of: channelOnboardingOperations, skipLocked: true });
    const leaseExpiresAt = new Date(now.getTime() + leaseForMs);
    return candidates.reduce<Promise<ClaimedChannelOnboardingProviderStatus[]>>(
      async (previous, { operation }) => {
        const claims = await previous;
        if (!operation.providerHandle) return claims;
        const leaseToken = randomUUID();
        const [claimed] = await transaction
          .update(channelOnboardingOperations)
          .set({
            leaseExpiresAt,
            leaseToken,
            updatedAt: now,
            version: sql`${channelOnboardingOperations.version} + 1`,
          })
          .where(
            and(
              eq(channelOnboardingOperations.id, operation.id),
              eq(channelOnboardingOperations.version, operation.version),
              eq(channelOnboardingOperations.state, "accepted")
            )
          )
          .returning({
            id: channelOnboardingOperations.id,
            version: channelOnboardingOperations.version,
          });
        if (claimed) {
          claims.push({
            id: claimed.id,
            leaseToken,
            providerHandle: operation.providerHandle,
            version: claimed.version,
          });
        }
        return claims;
      },
      Promise.resolve([])
    );
  });
}

export async function markChannelOnboardingProviderDelivered(
  fence: ChannelOnboardingOperationFence,
  now = new Date()
) {
  return transitionAcceptedProvider(fence, {
    state: "delivered",
    updatedAt: now,
  });
}

export async function markChannelOnboardingProviderRejected(
  fence: ChannelOnboardingOperationFence,
  now = new Date()
) {
  return transitionAcceptedProvider(fence, {
    lastError: "Provider reported a terminal delivery rejection.",
    state: "failed",
    updatedAt: now,
  });
}

export async function observeChannelOnboardingProviderStatus(
  input: ChannelOnboardingOperationFence & {
    readonly providerStatus: "accepted" | "pending" | "uncertain";
  },
  now = new Date()
) {
  const [updated] = await db
    .update(channelOnboardingOperations)
    .set({
      lastError:
        input.providerStatus === "uncertain"
          ? "Provider status lookup was inconclusive; retry is scheduled."
          : null,
      leaseExpiresAt: null,
      leaseToken: null,
      retryAt: new Date(
        now.getTime() +
          (input.providerStatus === "uncertain"
            ? uncertainStatusRetryMs
            : providerStatusRetryMs)
      ),
      updatedAt: now,
    })
    .where(
      and(exactLease(input), eq(channelOnboardingOperations.state, "accepted"))
    )
    .returning({ id: channelOnboardingOperations.id });
  return updated !== undefined;
}

function exactLease(fence: ChannelOnboardingOperationFence) {
  return and(
    eq(channelOnboardingOperations.id, fence.id),
    eq(channelOnboardingOperations.leaseToken, fence.leaseToken),
    eq(channelOnboardingOperations.version, fence.version)
  );
}

/**
 * Re-check all revocable authority immediately before a provider/Eve attempt.
 * An OTP-upgraded identity remains valid (`verified`), while a revoked identity,
 * participant, binding, line, workspace/membership, or STOP suppression fails
 * closed. The operation routing tuple must still match its active binding.
 */
function activeRuntimeGuard(
  outerOperation: typeof channelOnboardingOperations
) {
  const operation = alias(channelOnboardingOperations, "onboarding_guard");
  return inArray(
    outerOperation.id,
    db
      .select({ id: operation.id })
      .from(operation)
      .innerJoin(
        channelOnboardingEnrollments,
        eq(operation.enrollmentId, channelOnboardingEnrollments.id)
      )
      .innerJoin(
        channelConversations,
        eq(
          channelOnboardingEnrollments.channelConversationId,
          channelConversations.id
        )
      )
      .innerJoin(
        platformLines,
        eq(channelConversations.platformLineId, platformLines.id)
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
      .innerJoin(
        phoneIdentities,
        eq(phoneIdentities.id, channelOnboardingEnrollments.phoneIdentityId)
      )
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            channelOnboardingEnrollments.workspaceId
          ),
          eq(
            workspaceMemberships.userId,
            channelOnboardingEnrollments.principalId
          )
        )
      )
      .innerJoin(
        workspaces,
        eq(workspaces.id, channelOnboardingEnrollments.workspaceId)
      )
      .leftJoin(
        channelCommunicationSuppressions,
        and(
          eq(
            channelCommunicationSuppressions.phoneLookupHash,
            phoneIdentities.phoneLookupHash
          ),
          eq(channelCommunicationSuppressions.provider, operation.provider),
          eq(
            channelCommunicationSuppressions.providerAccountId,
            operation.providerAccountId
          ),
          eq(
            channelCommunicationSuppressions.providerLineId,
            operation.providerLineId
          )
        )
      )
      .where(
        and(
          eq(channelOnboardingEnrollments.status, "ready"),
          eq(channelConversations.status, "active"),
          eq(channelParticipants.status, "active"),
          or(
            and(
              eq(phoneIdentities.status, "active"),
              eq(phoneIdentities.assurance, "channel_observed"),
              eq(phoneIdentities.provenanceProvider, operation.provider),
              eq(
                phoneIdentities.provenanceAccountId,
                operation.providerAccountId
              ),
              eq(phoneIdentities.provenanceLineId, operation.providerLineId)
            ),
            and(
              eq(phoneIdentities.status, "verified"),
              eq(phoneIdentities.assurance, "otp_verified")
            )
          ),
          eq(workspaceMemberships.status, "active"),
          inArray(workspaces.lifecycleState, ["trial", "active"]),
          eq(platformLines.status, "active"),
          eq(operation.provider, channelConversations.provider),
          eq(
            operation.providerAccountId,
            channelConversations.providerAccountId
          ),
          eq(
            operation.providerConversationId,
            channelConversations.providerConversationId
          ),
          eq(operation.providerLineId, platformLines.providerLineId),
          or(
            isNull(channelCommunicationSuppressions.id),
            ne(channelCommunicationSuppressions.status, "stopped")
          )
        )
      )
  );
}

async function transitionAttempt(
  fence: ChannelOnboardingOperationFence,
  values: Partial<typeof channelOnboardingOperations.$inferInsert>
) {
  const [updated] = await db
    .update(channelOnboardingOperations)
    .set(values)
    .where(
      and(exactLease(fence), eq(channelOnboardingOperations.state, "attempted"))
    )
    .returning({ id: channelOnboardingOperations.id });
  return updated !== undefined;
}

async function transitionAcceptedProvider(
  fence: ChannelOnboardingOperationFence,
  values: Partial<typeof channelOnboardingOperations.$inferInsert>
) {
  const [updated] = await db
    .update(channelOnboardingOperations)
    .set({ ...values, leaseExpiresAt: null, leaseToken: null, retryAt: null })
    .where(
      and(exactLease(fence), eq(channelOnboardingOperations.state, "accepted"))
    )
    .returning({ id: channelOnboardingOperations.id });
  return updated !== undefined;
}

async function recoverExpiredAttempted(
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  now: Date
) {
  return transaction
    .update(channelOnboardingOperations)
    .set({
      lastError: "Dispatch outcome is unknown; reconciliation is required.",
      leaseExpiresAt: null,
      leaseToken: null,
      retryAt: null,
      state: "uncertain",
      updatedAt: now,
    })
    .where(
      and(
        eq(channelOnboardingOperations.state, "attempted"),
        lte(channelOnboardingOperations.leaseExpiresAt, now)
      )
    )
    .returning({ id: channelOnboardingOperations.id });
}

function validateClaimInput(input: {
  readonly leaseForMs: number;
  readonly limit: number;
  readonly owner: string;
}) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
    throw new Error("The onboarding claim limit must be a positive integer.");
  }
  if (!Number.isSafeInteger(input.leaseForMs) || input.leaseForMs < 1) {
    throw new Error(
      "The onboarding lease duration must be a positive integer."
    );
  }
  if (input.owner.trim().length === 0) {
    throw new Error("The onboarding lease owner is required.");
  }
}
