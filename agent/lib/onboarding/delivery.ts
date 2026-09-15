import { randomUUID } from "node:crypto";
import type { ChannelOnboardingOperationKind as PersistedOperationKind } from "@/db";
import type { UserContent } from "ai";
import type { SessionAuthContext } from "eve/context";
import {
  decryptChannelOnboardingOperationPayload,
  decryptChannelOnboardingReceiptPayload,
} from "@/db/services/channel-onboarding";
import {
  acceptChannelOnboardingHandoffOperation,
  acceptChannelOnboardingProviderOperation,
  claimChannelOnboardingOperations,
  type ClaimedChannelOnboardingOperation as PersistedChannelOnboardingOperation,
  failChannelOnboardingOperationAfterProvenUnsentFailure,
  markChannelOnboardingOperationAttempted,
  markChannelOnboardingOperationUncertain,
  releaseChannelOnboardingOperationAfterProvenUnsentFailure,
} from "@/db/services/channel-onboarding-delivery";
import {
  reserveChannelOnboardingModelTurn,
  reserveChannelOnboardingOutboundMessage,
} from "@/db/services/channel-onboarding-budgets";
import { sendOnboardingSendbluePayload } from "@/agent/lib/onboarding/sendblue-provider";

/**
 * Application-owned consumer for first-contact outbound work.
 *
 * Eve schedules give this consumer a place to run; the persistence service owns
 * the durable state, lease fencing, dependency ordering, and cancellation.  A
 * provider response that is lost after an attempt is deliberately uncertain:
 * this module never retries it as though no message was sent.
 */

export type ChannelOnboardingOperationKind = PersistedOperationKind;

interface ClaimedOperationBase {
  id: string;
  leaseToken: string;
  version: number;
}

type ClaimedDirectMessageOperation = ClaimedOperationBase & {
  /** The configured platform line that owns this conversation. */
  sender: string;
  providerAccountId: string;
  providerLineId: string;
  /** A normalized E.164 recipient, provided only after the claim succeeds. */
  recipient: string;
  /** Already-rendered private content or a persistence-owned media reference. */
  text: string;
  /**
   * Optional ordered media held by application storage. A provider adapter may
   * send them only when the line capability was explicitly established.
   */
  media?: { contentType: string; url: string }[];
  presentation?:
    | { kind: "text" }
    | { kind: "carousel" }
    | { kind: "single_media"; sendStyle?: "celebration" };
};

type ClaimedWelcomeOperation = ClaimedDirectMessageOperation & {
  kind: "welcome";
};

type ClaimedOutboundReplyOperation = ClaimedDirectMessageOperation & {
  kind: "outbound_reply";
};

type ClaimedOpeningRequestOperation = ClaimedOperationBase & {
  authAssurance: "channel_observed" | "otp_verified";
  bindingId: string;
  capabilityProfile: "channel-basic" | "full";
  identityProvenance: "phone_otp" | "sendblue_direct";
  kind: "opening_request";
  /** The original inbound content, reconstructed only after the claim succeeds. */
  payload: UserContent;
  principalId: string;
  providerAccountId: string;
  providerLineId: string;
  threadId: string;
  workspaceId: string;
};

export type ClaimedChannelOnboardingOperation =
  | ClaimedWelcomeOperation
  | ClaimedOutboundReplyOperation
  | ClaimedOpeningRequestOperation;

type OperationFence = ClaimedOperationBase;

type ProviderSendResult =
  | { kind: "accepted"; providerHandle: string }
  | { kind: "rejected"; retryAt?: Date }
  | { kind: "uncertain" };

export type OpeningRequestDispatchResult =
  | { kind: "accepted"; sessionId: string }
  | { kind: "proven_unsent"; retryAt?: Date };

export interface SendblueOpeningRequest {
  readonly auth: SessionAuthContext;
  readonly content: UserContent;
  readonly threadId: string;
}

/**
 * Persistence and transport edges are injected by their owners.  In
 * particular, this module must not import the SendBlue channel: doing so would
 * make scheduled recovery depend on a webhook channel instance.
 */
export interface ChannelOnboardingDeliveryDependencies {
  readonly claim: (input: {
    limit: number;
    now: Date;
    owner: string;
  }) => Promise<readonly ClaimedChannelOnboardingOperation[]>;
  readonly markAttempted: (fence: OperationFence) => Promise<boolean>;
  readonly reserve: (
    operation: ClaimedChannelOnboardingOperation
  ) => Promise<{ kind: "proceed" } | { kind: "limit_reached" }>;
  readonly acceptProvider: (
    input: OperationFence & { providerHandle: string }
  ) => Promise<void>;
  readonly acceptHandoff: (
    input: OperationFence & { sessionId: string }
  ) => Promise<void>;
  readonly releaseProvenUnsent: (
    input: OperationFence & { retryAt?: Date }
  ) => Promise<void>;
  readonly failProvenUnsent: (fence: OperationFence) => Promise<void>;
  readonly markUncertain: (fence: OperationFence) => Promise<void>;
  readonly sendWelcome: (
    operation: ClaimedWelcomeOperation
  ) => Promise<ProviderSendResult>;
  readonly sendOutboundReply: (
    operation: ClaimedOutboundReplyOperation
  ) => Promise<ProviderSendResult>;
  readonly dispatchOpeningRequest: (
    operation: Extract<
      ClaimedChannelOnboardingOperation,
      { kind: "opening_request" }
    >
  ) => Promise<OpeningRequestDispatchResult>;
}

export interface DrainChannelOnboardingDeliveryInput {
  dependencies: ChannelOnboardingDeliveryDependencies;
  limit?: number;
  now?: Date;
  owner: string;
}

export interface ChannelOnboardingDeliveryDrain {
  claimed: number;
  attempted: number;
}

type ClaimedProviderStatusOperation = OperationFence & {
  providerHandle: string;
};

type ProviderDeliveryStatus =
  | "accepted"
  | "delivered"
  | "pending"
  | "rejected"
  | "uncertain";

/**
 * This is intentionally separate from sending. A known provider handle can be
 * reconciled without reissuing the message; a missing handle cannot.
 */
export interface ChannelOnboardingReconciliationDependencies {
  readonly claimProviderStatus: (input: {
    limit: number;
    now: Date;
    owner: string;
  }) => Promise<readonly ClaimedProviderStatusOperation[]>;
  readonly getProviderStatus: (
    providerHandle: string
  ) => Promise<ProviderDeliveryStatus>;
  readonly markProviderDelivered: (fence: OperationFence) => Promise<void>;
  readonly markProviderRejected: (fence: OperationFence) => Promise<void>;
  /** Records status/diagnostics and the service-owned next check time. */
  readonly observeProviderStatus: (
    input: OperationFence & {
      providerStatus: Exclude<ProviderDeliveryStatus, "delivered" | "rejected">;
    }
  ) => Promise<void>;
}

const defaultClaimLimit = 10;

/**
 * Drains a bounded number of operations sequentially. It reclaims immediately
 * after each completed batch, so a dependency-gated welcome → opening handoff
 * can progress during the webhook invocation instead of waiting for cron.
 * Ordering across one enrollment is enforced by the persistence claim query;
 * sequential processing keeps this consumer conservative until cross-enrollment
 * concurrency is needed.
 */
export async function drainChannelOnboardingDelivery({
  dependencies,
  limit = defaultClaimLimit,
  now = new Date(),
  owner,
}: DrainChannelOnboardingDeliveryInput): Promise<ChannelOnboardingDeliveryDrain> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(
      "The onboarding delivery claim limit must be a positive integer."
    );
  }

  let remaining = limit;
  let claimed = 0;
  let attempted = 0;

  while (remaining > 0) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each claim observes prior fenced transitions
    const operations = await dependencies.claim({
      limit: remaining,
      now,
      owner,
    });
    if (operations.length === 0) break;
    claimed += operations.length;
    remaining -= operations.length;

    // The next claim depends on each operation's fenced transition, and the
    // provider/Eve calls must preserve their durable order.
    /* eslint-disable no-await-in-loop -- intentionally bounded, causal batch drain */
    for (const operation of operations) {
      const reservation = await dependencies.reserve(operation);
      if (reservation.kind === "limit_reached") {
        await dependencies.failProvenUnsent(fenceFor(operation));
        continue;
      }
      if (!(await dependencies.markAttempted(fenceFor(operation)))) continue;
      attempted += 1;

      if (operation.kind === "opening_request") {
        await dispatchOpeningRequest(dependencies, operation);
      } else {
        await dispatchDirectMessage(dependencies, operation);
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  return { attempted, claimed };
}

/**
 * Production SendBlue drain. The only transport seam is the Eve handoff: a
 * webhook uses its in-context bridge while the native schedule uses `to`.
 * Direct provider sends always use the persisted payload format.
 */
export async function drainSendblueChannelOnboarding({
  bindingId,
  dispatchOpeningRequest: openingRequestDispatcher,
  kinds,
  limit,
  now,
  owner = `channel-onboarding:${randomUUID()}`,
}: {
  /** Required for webhook drains; omitted only by the global recovery schedule. */
  readonly bindingId?: string;
  /** Action-result drains use `['outbound_reply']` and never claim Eve work. */
  readonly kinds?: readonly ChannelOnboardingOperationKind[];
  readonly dispatchOpeningRequest?: (
    input: SendblueOpeningRequest
  ) => Promise<OpeningRequestDispatchResult>;
  readonly limit?: number;
  readonly now?: Date;
  readonly owner?: string;
}) {
  return drainChannelOnboardingDelivery({
    dependencies: {
      acceptHandoff: async (input) => {
        await acceptChannelOnboardingHandoffOperation(input);
      },
      acceptProvider: async (input) => {
        await acceptChannelOnboardingProviderOperation(input);
      },
      claim: async ({ limit: claimLimit, now: claimNow, owner: claimOwner }) =>
        Promise.all(
          (
            await claimChannelOnboardingOperations({
              bindingId,
              kinds,
              limit: claimLimit,
              now: claimNow,
              owner: claimOwner,
              provider: "sendblue",
            })
          ).map(projectPersistedOperation)
        ),
      dispatchOpeningRequest: async (operation) => {
        // `action.result` deliberately supplies no dispatcher with its
        // direct-only kind filter. Keep this fail-closed if a caller ever
        // widens that filter without providing an Eve handoff transport.
        if (!openingRequestDispatcher) return { kind: "proven_unsent" };
        return openingRequestDispatcher({
          auth: openingAuth(operation),
          content: operation.payload,
          threadId: operation.threadId,
        });
      },
      markAttempted: markChannelOnboardingOperationAttempted,
      markUncertain: async (fence) => {
        await markChannelOnboardingOperationUncertain(fence);
      },
      failProvenUnsent: async (fence) => {
        await failChannelOnboardingOperationAfterProvenUnsentFailure(fence);
      },
      releaseProvenUnsent: async (input) => {
        await releaseChannelOnboardingOperationAfterProvenUnsentFailure(input);
      },
      reserve: async (operation) => {
        const reservation =
          operation.kind === "opening_request"
            ? await reserveChannelOnboardingModelTurn({
                requestKey: operation.id,
                scope: sendblueScope(operation),
              })
            : await reserveChannelOnboardingOutboundMessage({
                requestKey: operation.id,
                scope: sendblueScope(operation),
              });
        return reservation.kind === "limit_reached"
          ? { kind: "limit_reached" as const }
          : { kind: "proceed" as const };
      },
      sendOutboundReply: sendPersistedDirectMessage,
      sendWelcome: sendPersistedDirectMessage,
    },
    limit,
    now,
    owner,
  });
}

/**
 * Polls only operations with a persisted SendBlue handle. It does not send.
 * `uncertain` here means status lookup failed; the operation remains provider
 * accepted with an operator-visible diagnostic, rather than being relabelled
 * delivered or retried.
 */
export async function reconcileChannelOnboardingProviderDelivery({
  dependencies,
  limit = defaultClaimLimit,
  now = new Date(),
  owner,
}: {
  dependencies: ChannelOnboardingReconciliationDependencies;
  limit?: number;
  now?: Date;
  owner: string;
}): Promise<{ claimed: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(
      "The onboarding reconciliation limit must be a positive integer."
    );
  }

  const operations = await dependencies.claimProviderStatus({
    limit,
    now,
    owner,
  });
  await operations.reduce(async (previous, operation) => {
    await previous;
    const fence = fenceFor(operation);
    let providerStatus: ProviderDeliveryStatus;
    try {
      providerStatus = await dependencies.getProviderStatus(
        operation.providerHandle
      );
    } catch {
      providerStatus = "uncertain";
    }

    if (providerStatus === "delivered") {
      await dependencies.markProviderDelivered(fence);
    } else if (providerStatus === "rejected") {
      await dependencies.markProviderRejected(fence);
    } else {
      await dependencies.observeProviderStatus({ ...fence, providerStatus });
    }
  }, Promise.resolve());

  return { claimed: operations.length };
}

async function dispatchDirectMessage(
  dependencies: ChannelOnboardingDeliveryDependencies,
  operation: ClaimedWelcomeOperation | ClaimedOutboundReplyOperation
) {
  let result: ProviderSendResult;
  try {
    result =
      operation.kind === "welcome"
        ? await dependencies.sendWelcome(operation)
        : await dependencies.sendOutboundReply(operation);
  } catch {
    // A thrown transport call could have reached the provider. It is not a
    // proven rejection, so recovery must reconcile rather than resend.
    await dependencies.markUncertain(fenceFor(operation));
    return;
  }

  if (result.kind === "accepted") {
    await dependencies.acceptProvider({
      ...fenceFor(operation),
      providerHandle: result.providerHandle,
    });
    return;
  }

  if (result.kind === "rejected") {
    await dependencies.releaseProvenUnsent({
      ...fenceFor(operation),
      retryAt: result.retryAt,
    });
    return;
  }

  await dependencies.markUncertain(fenceFor(operation));
}

async function dispatchOpeningRequest(
  dependencies: ChannelOnboardingDeliveryDependencies,
  operation: ClaimedOpeningRequestOperation
) {
  let result: OpeningRequestDispatchResult;
  try {
    result = await dependencies.dispatchOpeningRequest(operation);
  } catch {
    // Eve's cross-channel send returns only a Session. If the process loses the
    // response before it records that Session, there is no safe idempotency key
    // or lookup to establish whether a handoff already happened.
    await dependencies.markUncertain(fenceFor(operation));
    return;
  }

  if (result.kind === "accepted") {
    await dependencies.acceptHandoff({
      ...fenceFor(operation),
      sessionId: result.sessionId,
    });
    return;
  }

  await dependencies.releaseProvenUnsent({
    ...fenceFor(operation),
    retryAt: result.retryAt,
  });
}

function fenceFor(
  operation: ClaimedChannelOnboardingOperation | ClaimedProviderStatusOperation
): OperationFence {
  return {
    id: operation.id,
    leaseToken: operation.leaseToken,
    version: operation.version,
  };
}

export async function projectPersistedOperation(
  operation: PersistedChannelOnboardingOperation
): Promise<ClaimedChannelOnboardingOperation> {
  if (operation.kind === "opening_request") {
    if (!operation.receiptId || !operation.encryptedReceiptPayload) {
      throw new Error(
        "A claimed opening request is missing its private receipt."
      );
    }
    const receipt = await decryptChannelOnboardingReceiptPayload({
      encryptedPayload: operation.encryptedReceiptPayload,
      receiptId: operation.receiptId,
    });
    const payload: UserContent = [];
    if (receipt.text) payload.push({ text: receipt.text, type: "text" });
    for (const attachment of receipt.attachments ?? []) {
      payload.push({
        data: new URL(
          `data:${attachment.contentType};base64,${attachment.privateData}`
        ),
        mediaType: attachment.contentType,
        type: "file",
      });
    }
    return {
      authAssurance:
        operation.identityAssurance === "otp_verified"
          ? "otp_verified"
          : "channel_observed",
      bindingId: operation.bindingId,
      capabilityProfile:
        operation.identityAssurance === "otp_verified"
          ? "full"
          : "channel-basic",
      id: operation.id,
      identityProvenance:
        operation.identityAssurance === "otp_verified"
          ? "phone_otp"
          : "sendblue_direct",
      kind: "opening_request",
      leaseToken: operation.leaseToken,
      payload,
      principalId: operation.principalId,
      providerAccountId: operation.providerAccountId,
      providerLineId: operation.providerLineId,
      threadId: operation.providerConversationId,
      version: operation.version,
      workspaceId: operation.workspaceId,
    };
  }

  if (!operation.encryptedPayload) {
    throw new Error(
      "A claimed direct operation is missing its durable payload."
    );
  }
  const payload = await decryptChannelOnboardingOperationPayload({
    encryptedPayload: operation.encryptedPayload,
    operationId: operation.id,
  });
  return {
    id: operation.id,
    kind: operation.kind,
    leaseToken: operation.leaseToken,
    media: payload.media,
    presentation: payload.presentation,
    providerAccountId: operation.providerAccountId,
    providerLineId: operation.providerLineId,
    recipient: payload.to,
    sender: payload.from,
    text: payload.text,
    version: operation.version,
  };
}

function openingAuth(
  operation: Extract<
    ClaimedChannelOnboardingOperation,
    { kind: "opening_request" }
  >
): SessionAuthContext {
  return {
    attributes: {
      authAssurance: operation.authAssurance,
      capabilityProfile: operation.capabilityProfile,
      channelBindingId: operation.bindingId,
      conversationChannel: "sendblue",
      conversationId: operation.threadId,
      identityProvenance: operation.identityProvenance,
      workspaceId: operation.workspaceId,
    },
    authenticator: "sendblue-message",
    principalId: operation.principalId,
    principalType: "user",
  };
}

function sendPersistedDirectMessage(
  operation: ClaimedWelcomeOperation | ClaimedOutboundReplyOperation
) {
  return sendOnboardingSendbluePayload({
    from: operation.sender,
    media: operation.media,
    presentation: operation.presentation,
    text: operation.text,
    to: operation.recipient,
    version: 1,
  });
}

function sendblueScope(operation: {
  readonly providerAccountId: string;
  readonly providerLineId: string;
}) {
  return {
    provider: "sendblue" as const,
    providerAccountId: operation.providerAccountId,
    providerLineId: operation.providerLineId,
  };
}
