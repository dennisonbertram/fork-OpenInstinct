import { createPostgresState } from "@chat-adapter/state-pg";
import { createSendblueAdapter } from "chat-adapter-sendblue";
import type { Lock, Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import {
  finalDeliveryStatus,
  hasUnconfirmedProviderAttempt,
  isFinalDeliveryReplay,
  recordUnconfirmedDelivery,
  requestFinalDeliveryCompletion,
  settleFinalDelivery,
} from "@/agent/lib/message-delivery";
import { sendMessageToolResultSchema } from "@/agent/lib/send-message";
import { reactToMessageToolResultSchema } from "@/agent/lib/react-to-message";
import { dispatchReportPart } from "@/agent/lib/report-part-dispatch";
import { reportPartIdentityFor } from "@/agent/lib/completion-report-policy";
import type {
  ReportPart,
  ReportPartIdentity,
} from "@/agent/lib/completion-report-attempts";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@/auth";
import { env, isSendblueTextOnboardingEnabled } from "@/env";
import {
  drainSendblueChannelOnboarding,
  type OpeningRequestDispatchResult,
  type SendblueOpeningRequest,
} from "@/agent/lib/onboarding/delivery";
import { buildWelcomeOperations } from "@/agent/lib/onboarding/welcome";
import {
  enqueueChannelOnboardingOutboundReply,
  getChannelOnboardingOutboundReplyDelivery,
} from "@/db/services/channel-onboarding-delivery";
import { accessScopeForUser, type AccessScope } from "@/lib/access-scope";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import {
  createConversationBinding,
  resolveConversationBinding,
  resolveVerifiedConversationBinding,
} from "@/db/services/channel-conversations";
import { findVerifiedUserByPhoneNumber } from "@/db/services/phone-identities";
import {
  isChannelCommunicationStopped,
  parseChannelCommunicationCommand,
  provisionChannelEnrollment,
  recordChannelCommunicationStart,
  recordChannelCommunicationStop,
  replayChannelOnboardingWelcome,
  resolveChannelEnrollment,
} from "@/db/services/channel-onboarding";
import {
  verifyScopeAccess,
  WorkspaceNotOperableError,
} from "@/db/services/scope";
import {
  BudgetExceededError,
  checkBudget,
  recordUsageEvent,
} from "@/db/services/usage";
import {
  hasSendblueWebhookSecret,
  validateSendblueInboundPayload,
} from "@/agent/lib/sendblue/admission";
import { maximumWorkerCompletionImages } from "@/lib/worker-completion";
import {
  prepareBrowserImageArtifactDelivery,
  type BrowserImageArtifactFile,
} from "@/agent/lib/browser-image-artifact/delivery";
import {
  extractImageArtifactMarkdownReferences,
  stripImageArtifactMarkdownReferences,
} from "@/agent/lib/browser-image-artifact/markdown";
import {
  partitionDirectPromptAttachments,
  prepareModelImageAttachments,
} from "@/agent/lib/linq/inbound-media";
import { maximumSendblueOnboardingTextCharacters } from "@/lib/channel-onboarding-contract";
import { isChannelObservedSession } from "@/agent/lib/mode";

const verifiedPhoneUserSchema = z.object({
  id: z.string().min(1),
  phoneNumberVerified: z.literal(true),
});
const enabled = env.SENDBLUE_CONVERSATIONS === "on";
const state = createPostgresState({
  keyPrefix: "openinstinct-sendblue",
  url: env.DATABASE_URL,
});
const configured = {
  accountId: env.SENDBLUE_ACCOUNT_ID ?? "",
  fromNumber: env.SENDBLUE_FROM_NUMBER ?? "",
};
const pendingInputTtlMs = 86_400_000;
const pendingInputLockTtlMs = 30_000;
const pendingInputLockRetryMs = 250;
const maxWebhookBytes = 65_536;
const sendblueFileUploadUrl = "https://api.sendblue.com/api/upload-file";
const sendblueFileUploadTimeoutMs = 30_000;
const maximumSendblueUploadResponseBytes = 16 * 1024;
const sendblueFileUploadSchema = z.object({
  media_url: z.url().refine((url) => new URL(url).protocol === "https:", {
    message: "SendBlue uploaded media must use HTTPS.",
  }),
  status: z.literal("OK"),
});
type SendblueMedia =
  | { readonly file: BrowserImageArtifactFile }
  | { readonly attachment: { readonly url: string } };
const pendingSendblueInputSchema = z.object({
  generation: z.string().min(1).default("legacy"),
  requests: z.array(
    z.object({
      allowFreeform: z.boolean().optional(),
      kind: z.enum(["question", "session-limit", "tool-approval"]).optional(),
      options: z
        .array(z.object({ id: z.string(), label: z.string() }))
        .optional(),
      prompt: z.string(),
      requestId: z.string(),
    })
  ),
  responses: z
    .array(
      z.object({
        optionId: z.string().optional(),
        requestId: z.string(),
        text: z.string().optional(),
      })
    )
    .default([]),
  workspaceId: z.string().min(1),
});
const channelObservedSessionAttributesSchema = z.object({
  authAssurance: z.literal("channel_observed"),
  capabilityProfile: z.literal("channel-basic"),
  channelBindingId: z.string().min(1),
  conversationChannel: z.literal("sendblue"),
  conversationId: z.string().min(1),
  identityProvenance: z.literal("sendblue_direct"),
  workspaceId: z.string().min(1),
});
const inputRequestTurnSchema = z.object({
  turnId: z.string().min(1).optional(),
});
const approvalReplies = new Set([
  "do it",
  "go ahead",
  "looks good",
  "ok",
  "okay",
  "send",
  "send it",
  "sure",
  "yeah",
  "yep",
  "yes",
]);
const cancellationReplies = new Set([
  "cancel",
  "don't",
  "do not",
  "never mind",
  "no",
  "nope",
  "stop",
]);
interface SendblueInputResponse {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
}
interface PendingInputResult {
  readonly inputResponseStateGeneration?: string;
  readonly inputResponseStateKey?: string;
  readonly inputResponses?: readonly SendblueInputResponse[];
  readonly pendingInputLock?: Lock;
  readonly pendingInputPrompt?: string;
  readonly pendingInputState?: z.output<typeof pendingSendblueInputSchema>;
  readonly pendingInputStateKey?: string;
}
type OnboardingOpeningRequest = NonNullable<
  Parameters<typeof provisionChannelEnrollment>[0]["openingRequest"]
>;
interface InputRequestEventMetadata {
  readonly turnId?: string;
}
type SendblueThread = Thread;
interface SendblueOnMessageResult extends PendingInputResult {
  readonly drainOnboarding?: true;
  readonly drainWelcomeOnly?: true;
  /** Authenticated inbound handle used only for stable follow-up reply keys. */
  readonly inboundMessageHandle?: string;
  readonly auth: {
    readonly attributes: {
      readonly authAssurance: "channel_observed" | "otp_verified";
      readonly capabilityProfile: "channel-basic" | "full";
      readonly channelBindingId: string;
      readonly conversationChannel: "sendblue";
      readonly conversationId: string;
      readonly identityProvenance: "phone_otp" | "sendblue_direct";
      readonly workspaceId: string;
    };
    readonly authenticator: "sendblue-message";
    readonly principalId: string;
    readonly principalType: "user";
  };
}

const adapter = createSendblueAdapter({
  apiKey: env.SENDBLUE_API_KEY_ID ?? "disabled",
  apiSecret: env.SENDBLUE_API_SECRET_KEY ?? "disabled",
  allowedServices: ["iMessage", "SMS", "RCS"],
  defaultFromNumber: configured.fromNumber || "+10000000000",
  webhookSecret: env.SENDBLUE_WEBHOOK_SECRET ?? "disabled",
  webhookSecretHeader: "sb-signing-secret",
});

function isResetOnboardingCommand(text: string) {
  return (
    text.trim().toLowerCase().replaceAll(/\s+/g, " ") === "reset onboarding"
  );
}

async function replaySendblueOnboardingWelcome({
  accountId,
  fromNumber,
  messageHandle,
  senderNumber,
  threadId,
}: {
  readonly accountId: string;
  readonly fromNumber: string;
  readonly messageHandle: string;
  readonly senderNumber: string;
  readonly threadId: string;
}) {
  const cardMode = env.SENDBLUE_TEXT_ONBOARDING_CARD_DELIVERY;
  if (!cardMode) return { status: "not_ready" } as const;
  return replayChannelOnboardingWelcome({
    messageId: messageHandle,
    phoneNumber: senderNumber,
    provider: "sendblue",
    providerAccountId: accountId,
    providerConversationId: threadId,
    providerLineId: fromNumber,
    welcomeParts: buildWelcomeOperations({
      cardMode,
      from: fromNumber,
      to: senderNumber,
    }).map((operation) => operation.payload),
  });
}

const nativeHandleWebhook = adapter.handleWebhook.bind(adapter);
adapter.handleWebhook = async (request, options) => {
  if (!enabled) return new Response("Not Found", { status: 404 });
  if (!hasSendblueWebhookSecret(request, env.SENDBLUE_WEBHOOK_SECRET ?? ""))
    return new Response("Unauthorized", { status: 401 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxWebhookBytes)
    return new Response("Payload Too Large", { status: 413 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxWebhookBytes)
    return new Response("Payload Too Large", { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  if (!validateSendblueInboundPayload(payload, configured))
    return new Response("OK", { status: 200 });
  return nativeHandleWebhook(
    new Request(request.url, {
      body: bytes,
      headers: request.headers,
      method: request.method,
    }),
    options
  );
};

export const sendblueChannelConfig = {
  async onMessage(
    context: { readonly thread: SendblueThread },
    message: Message
  ): Promise<SendblueOnMessageResult | null> {
    if (message.author.isBot === true) return null;
    const admitted = validateSendblueInboundPayload(message.raw, configured);
    if (!admitted || admitted.messageHandle !== message.id) return null;
    const communicationSubject = {
      phoneNumber: admitted.senderNumber,
      provider: "sendblue" as const,
      providerAccountId: admitted.accountId,
      providerLineId: admitted.fromNumber,
    };
    const command = parseChannelCommunicationCommand(message.text);
    if (command === "stop") {
      await recordChannelCommunicationStop({
        ...communicationSubject,
        messageHandle: admitted.messageHandle,
      });
      return null;
    }
    if (command === "start") {
      await recordChannelCommunicationStart({
        ...communicationSubject,
        messageHandle: admitted.messageHandle,
      });
      return null;
    }
    const enrolled = await resolveChannelEnrollment({
      ...communicationSubject,
      providerConversationId: context.thread.id,
    });
    if (enrolled) {
      if (isResetOnboardingCommand(message.text)) {
        const reset = await replaySendblueOnboardingWelcome({
          accountId: admitted.accountId,
          fromNumber: admitted.fromNumber,
          messageHandle: admitted.messageHandle,
          senderNumber: admitted.senderNumber,
          threadId: context.thread.id,
        });
        if (reset.status !== "ready") return null;
        return {
          auth: channelEnrollmentAuth(reset, context.thread.id),
          drainWelcomeOnly: true,
        };
      }
      // A pending ask_question reply must resume its existing Eve input flow;
      // it is not a new ordinary request to append behind onboarding work.
      await state.connect();
      const pending = await resolvePendingInputResponses({
        message,
        threadId: context.thread.id,
        workspaceId: enrolled.workspaceId,
      });
      if (pending) {
        return claimSendblueInboundTurn({
          auth: channelEnrollmentAuth(enrolled, context.thread.id),
          bindingId: enrolled.bindingId,
          message,
          threadId: context.thread.id,
          workspaceId: enrolled.workspaceId,
        });
      }
      const prepared = await prepareModelImageAttachments(message.attachments);
      const partitioned = partitionDirectPromptAttachments(prepared.kept);
      const continued = await provisionChannelEnrollment({
        messageId: admitted.messageHandle,
        openingDispatch: isKnownCapabilityGreeting(
          message.text,
          message.attachments.length
        ),
        openingRequest: openingRequestFrom(
          message.text,
          partitioned.kept,
          message.attachments.length > 0
        ),
        phoneNumber: admitted.senderNumber,
        provider: "sendblue",
        providerAccountId: admitted.accountId,
        providerConversationId: context.thread.id,
        providerLineId: admitted.fromNumber,
      });
      if (continued.status !== "ready") return null;
      return {
        auth: channelEnrollmentAuth(continued, context.thread.id),
        drainOnboarding: true,
      };
    }
    // `resolveChannelEnrollment` intentionally returns undefined for a
    // stopped enrollment. Recheck the exact authenticated subject before any
    // legacy OTP fallback so a STOP cannot be bypassed through Better Auth.
    if (await isChannelCommunicationStopped(communicationSubject)) return null;
    const verifiedUserId = await findVerifiedAuthUserIdByPhoneNumber(
      admitted.senderNumber
    );
    if (!verifiedUserId) {
      if (!isSendblueTextOnboardingEnabled()) return null;
      const cardMode = env.SENDBLUE_TEXT_ONBOARDING_CARD_DELIVERY;
      if (!cardMode) return null;
      const prepared = await prepareModelImageAttachments(message.attachments);
      const partitioned = partitionDirectPromptAttachments(prepared.kept);
      const enrollment = await provisionChannelEnrollment({
        messageId: admitted.messageHandle,
        openingRequest: openingRequestFrom(
          message.text,
          partitioned.kept,
          message.attachments.length > 0
        ),
        phoneNumber: admitted.senderNumber,
        provider: "sendblue",
        providerAccountId: admitted.accountId,
        providerConversationId: context.thread.id,
        providerLineId: admitted.fromNumber,
        openingDispatch: isKnownCapabilityGreeting(
          message.text,
          message.attachments.length
        ),
        welcomeParts: buildWelcomeOperations({
          cardMode,
          from: admitted.fromNumber,
          to: admitted.senderNumber,
        }).map((operation) => operation.payload),
      });
      if (enrollment.status !== "ready") return null;
      return {
        auth: channelEnrollmentAuth(enrollment, context.thread.id),
        drainOnboarding: true,
      };
    }
    const scope = accessScopeForUser(`better-auth:${verifiedUserId}`);
    const verifiedScope = await verifyScopeAccess(scope);
    if (!verifiedScope) return null;
    const identity = await findVerifiedUserByPhoneNumber(admitted.senderNumber);
    if (!identity || identity.userId !== verifiedUserId) return null;
    let binding = await resolveConversationBinding({
      provider: "sendblue",
      providerAccountId: admitted.accountId,
      providerConversationId: context.thread.id,
    });
    binding ??= await createConversationBinding({
      phoneIdentityId: identity.phoneIdentityId,
      platformLine: { providerLineId: admitted.fromNumber },
      provider: "sendblue",
      providerAccountId: admitted.accountId,
      providerConversationId: context.thread.id,
      userId: verifiedUserId,
    });
    if (!binding || binding.workspaceId !== verifiedScope.workspaceId)
      return null;
    binding = await resolveVerifiedConversationBinding({
      phoneIdentityId: identity.phoneIdentityId,
      provider: "sendblue",
      providerAccountId: admitted.accountId,
      providerConversationId: context.thread.id,
      providerLineId: admitted.fromNumber,
      workspaceId: verifiedScope.workspaceId,
    });
    if (!binding) return null;
    if (isResetOnboardingCommand(message.text)) {
      const reset = await replaySendblueOnboardingWelcome({
        accountId: admitted.accountId,
        fromNumber: admitted.fromNumber,
        messageHandle: admitted.messageHandle,
        senderNumber: admitted.senderNumber,
        threadId: context.thread.id,
      });
      if (reset.status !== "ready") return null;
      return {
        auth: channelEnrollmentAuth(reset, context.thread.id),
        drainWelcomeOnly: true,
      };
    }
    return claimSendblueInboundTurn({
      auth: {
        attributes: {
          authAssurance: "otp_verified",
          capabilityProfile: "full",
          channelBindingId: binding.id,
          conversationChannel: "sendblue",
          conversationId: context.thread.id,
          identityProvenance: "phone_otp",
          workspaceId: verifiedScope.workspaceId,
        },
        authenticator: "sendblue-message",
        principalId: `better-auth:${verifiedUserId}`,
        principalType: "user",
      },
      bindingId: binding.id,
      message,
      threadId: context.thread.id,
      workspaceId: verifiedScope.workspaceId,
    });
  },
};

const bridge = chatSdkChannel({
  adapters: { sendblue: adapter },
  concurrency: "concurrent",
  events: {
    async "input.requested"(event, context, session) {
      if (!context.thread || event.requests.length === 0) return;
      const caller =
        session.session.auth.current ?? session.session.auth.initiator;
      if (!caller) return;
      const scope = scopeFromPrincipal(caller);
      await state.connect();
      const [request] = event.requests;
      if (!request) return;
      const observedBinding = channelObservedBindingForSession(session);
      const prompt = renderInputRequest(request);
      const eventTurnId = inputRequestTurnId(event);
      if (isChannelObservedSession(session) && !observedBinding) return;
      const generation = observedBinding
        ? `observed:${session.session.id}:${observedBinding}:${eventTurnId}:${event.requests
            .map((pendingRequest) => pendingRequest.requestId)
            .join(",")}`
        : randomUUID();
      const existing = observedBinding
        ? pendingSendblueInputSchema.safeParse(
            await state.get(pendingInputKey(context.thread.id))
          )
        : undefined;
      const retainedResponses =
        existing?.success &&
        existing.data.generation === generation &&
        existing.data.workspaceId === scope.workspaceId
          ? existing.data.responses
          : [];
      const pendingState = {
        // A replayed observed request must retain the same state generation:
        // the direct outbox may be accepted later by the scheduler.
        generation,
        requests: event.requests.map((pendingRequest) => ({
          allowFreeform: pendingRequest.allowFreeform,
          kind: pendingRequest.kind,
          options: pendingRequest.options?.map((option) => ({
            id: option.id,
            label: option.label,
          })),
          prompt: pendingRequest.prompt,
          requestId: pendingRequest.requestId,
        })),
        responses: retainedResponses,
        workspaceId: scope.workspaceId,
      };
      // The outbox may need schedule recovery after this webhook returns. The
      // response state must survive that recovery before any provider attempt.
      if (observedBinding)
        await state.set(
          pendingInputKey(context.thread.id),
          pendingState,
          pendingInputTtlMs
        );
      const posted = observedBinding
        ? await queueObservedSendblueReply({
            bindingId: observedBinding,
            replyKeyPrefix: `input:${session.session.id}:${observedBinding}:${eventTurnId}:${request.requestId}`,
            text: prompt,
            thread: context.thread,
          })
        : await postSendblueReply(context.thread, { raw: prompt }, scope);
      if (!posted) return;
      if (!observedBinding)
        await state.set(
          pendingInputKey(context.thread.id),
          pendingState,
          pendingInputTtlMs
        );
    },
    async "action.result"(event, context, session) {
      if (event.status !== "completed" || !context.thread) return;
      const actionThread = context.thread;
      if (isFinalDeliveryReplay(event.turnId, event.result.callId)) return;
      const scope = scopeForSession(session);
      const reaction = reactToMessageToolResultSchema.safeParse(event.result);
      if (reaction.success) {
        if (reaction.data.output.operation !== "add") return;
        let accepted = false;
        try {
          const messageId = context.thread.toJSON().currentMessage?.id;
          if (!messageId) return;
          await adapter.addReaction(
            context.thread.id,
            messageId,
            reaction.data.output.type
          );
          accepted = true;
        } catch (error) {
          recordUnconfirmedDelivery(event.turnId, event.result.callId);
          throw error;
        } finally {
          settleFinalDelivery(event.result.callId, accepted);
        }
        requestFinalDeliveryCompletion(
          event.result.callId,
          event.turnId,
          event.stepIndex
        );
        return;
      }
      const message = sendMessageToolResultSchema.safeParse(event.result);
      if (!message.success) return;
      const observedBinding = channelObservedBindingForSession(session);
      if (observedBinding) {
        const replyText =
          message.data.output.kind === "link"
            ? message.data.output.url
            : (message.data.output.text ?? "");
        // A generated attachment needs an immutable, persistence-owned media
        // reference before it can enter this outbox. Do not fall back to the
        // legacy direct sender with a transient attachment URL.
        if (
          replyText.trim().length > 0 &&
          (message.data.output.kind === "link" ||
            (message.data.output.attachments?.length ?? 0) === 0)
        ) {
          let accepted = false;
          try {
            accepted = await queueObservedSendblueReply({
              bindingId: observedBinding,
              replyKeyPrefix: `${event.turnId}:${event.result.callId}:text`,
              text: replyText,
              thread: context.thread,
            });
            if (!accepted)
              recordUnconfirmedDelivery(event.turnId, event.result.callId);
          } finally {
            settleFinalDelivery(event.result.callId, accepted);
          }
          requestFinalDeliveryCompletion(
            event.result.callId,
            event.turnId,
            event.stepIndex
          );
          return;
        }
        // Never fall through to the legacy direct sender for a restricted
        // principal: attachments need immutable outbox media references.
        recordUnconfirmedDelivery(event.turnId, event.result.callId);
        settleFinalDelivery(event.result.callId, false);
        return;
      }
      if (isChannelObservedSession(session)) {
        recordUnconfirmedDelivery(event.turnId, event.result.callId);
        settleFinalDelivery(event.result.callId, false);
        return;
      }
      let accepted = false;
      try {
        if (message.data.output.kind === "link") {
          if (
            !(await postSendblueReply(
              context.thread,
              { raw: message.data.output.url },
              scope
            ))
          )
            return;
        } else {
          const attachments = message.data.output.attachments ?? [];
          const requestedText = message.data.output.text ?? "";
          const rootSessionId = session.session.id;
          const conversationId = context.thread.id;
          const leaseOwner = `${event.turnId}:${event.result.callId}`;
          const identityFor = (part: ReportPart) =>
            reportPartIdentity({
              callId: event.result.callId,
              part,
              rootSessionId,
              scope,
              turnId: event.turnId,
            });
          const artifactDelivery =
            scope && rootSessionId
              ? await prepareBrowserImageArtifactDelivery(requestedText, {
                  rootSessionId,
                  scope,
                })
              : {
                  failedArtifactIds: extractImageArtifactMarkdownReferences(
                    requestedText
                  ).map((reference) => reference.id),
                  files: [],
                  text: stripImageArtifactMarkdownReferences(requestedText),
                };
          const requestedMedia: readonly SendblueMedia[] = [
            ...artifactDelivery.files.map((file) => ({ file })),
            ...attachments.map((attachment) => ({ attachment })),
          ];
          const media = requestedMedia.slice(0, maximumWorkerCompletionImages);
          const failureMessage = imageDeliveryFailureMessage(
            artifactDelivery.failedArtifactIds.length +
              requestedMedia.length -
              media.length
          );
          const attachmentCaption = [artifactDelivery.text, failureMessage]
            .filter(Boolean)
            .join("\n\n");
          if (media.length === 0) {
            if (
              !(await postSendblueReply(
                context.thread,
                { raw: attachmentCaption },
                scope,
                { conversationId, identity: identityFor("text"), leaseOwner }
              ))
            )
              return;
          } else {
            const recipient = adapter.decodeThreadId(context.thread.id);
            const contactNumber = recipient.contactNumber;
            if (
              recipient.fromNumber !== configured.fromNumber ||
              !contactNumber
            )
              throw new Error(
                "SendBlue delivery requires the configured 1:1 sender line."
              );
            /* oxlint-disable eslint/no-await-in-loop -- Each accepted media message must be ledgered before the next budget check. */
            for (const [index, mediaItem] of media.entries()) {
              if (!(await checkSendblueMessageBudget(context.thread, scope)))
                return;
              let mediaUrl: string;
              try {
                if ("file" in mediaItem) {
                  const uploaded = await dispatchReportPart({
                    channel: "sendblue",
                    contentDigest: createHash("sha256")
                      .update(mediaItem.file.data)
                      .digest("hex"),
                    conversationId,
                    dispatch: () => uploadSendblueFile(mediaItem.file),
                    // oxlint-disable-next-line typescript/restrict-template-expressions -- index is the media loop's small integer ordinal, never NaN or a float.
                    identity: identityFor(`media-upload:${index}`),
                    leaseOwner,
                  });
                  // A media send cannot begin before its owned upload part is
                  // accepted. Whether it is uncertain or was already accepted
                  // by an owner this process cannot see, this call has no
                  // media URL to send, so it stops rather than guess or resend.
                  if (uploaded.kind === "not_dispatched") return;
                  mediaUrl = uploaded.value;
                } else {
                  mediaUrl = mediaItem.attachment.url;
                }
              } catch (error) {
                if (!("file" in mediaItem)) throw error;
                const failureText = [
                  index === 0 ? attachmentCaption : "",
                  imageDeliveryFailureMessage(media.length - index),
                ]
                  .filter(Boolean)
                  .join("\n\n");
                if (
                  !(await postSendblueReply(
                    context.thread,
                    { raw: failureText },
                    scope,
                    {
                      conversationId,
                      identity: identityFor("text"),
                      leaseOwner,
                    }
                  ))
                )
                  return;
                break;
              }
              if (!mediaUrl)
                throw new Error(
                  "SendBlue media delivery requires a valid URL."
                );
              const sent = await dispatchReportPart({
                channel: "sendblue",
                contentDigest: createHash("sha256")
                  .update(mediaUrl)
                  .digest("hex"),
                conversationId,
                dispatch: async () => {
                  if (await isSendblueThreadCommunicationStopped(actionThread))
                    throw new Error("SendBlue communication is stopped.");
                  const response = await adapter.getSdk().messages.send({
                    content: index === 0 ? attachmentCaption : "",
                    from_number: configured.fromNumber,
                    media_url: mediaUrl,
                    number: contactNumber,
                  });
                  if (!response.message_handle)
                    throw new Error(
                      "SendBlue did not accept the media message."
                    );
                  return response;
                },
                // oxlint-disable-next-line typescript/restrict-template-expressions -- index is the media loop's small integer ordinal, never NaN or a float.
                identity: identityFor(`media-send:${index}`),
                leaseOwner,
                providerHandle: (response) => response.message_handle,
              });
              if (sent.kind === "not_dispatched") return;
              await recordSendblueUsage(scope);
            }
            /* oxlint-enable eslint/no-await-in-loop */
          }
        }
        accepted = true;
      } catch (error) {
        recordUnconfirmedDelivery(event.turnId, event.result.callId);
        throw error;
      } finally {
        settleFinalDelivery(event.result.callId, accepted);
      }
      requestFinalDeliveryCompletion(
        event.result.callId,
        event.turnId,
        event.stepIndex
      );
    },
    // Delivery is owned by send_message/action.result. Never let the Chat SDK
    // default message handler send model text or DELIVERY_COMPLETE directly.
    async "message.completed"() {
      await Promise.resolve();
    },
    async "turn.failed"(event, context, session) {
      if (
        !context.thread ||
        finalDeliveryStatus(event.turnId) !== undefined ||
        hasUnconfirmedProviderAttempt(event.turnId)
      )
        return;
      const failure =
        "I couldn’t complete that request because of a service error. Please try again later.";
      const observedBinding = channelObservedBindingForSession(session);
      if (observedBinding) {
        await queueObservedSendblueReply({
          bindingId: observedBinding,
          replyKeyPrefix: `turn-failed:${session.session.id}:${event.turnId}`,
          text: failure,
          thread: context.thread,
        });
        return;
      }
      if (isChannelObservedSession(session)) return;
      await postSendblueReply(
        context.thread,
        { raw: failure },
        scopeForSession(session)
      );
    },
  },
  routes: { sendblue: "/eve/v1/sendblue" },
  state,
  streaming: false,
  userName: "eve",
});

export async function dispatchSendblueMessage(
  thread: SendblueThread,
  message: Parameters<typeof sendblueChannelConfig.onMessage>[1]
): Promise<void> {
  const result = await sendblueChannelConfig.onMessage({ thread }, message);
  if (!result) return;
  const lockRenewal = result.pendingInputLock
    ? startPendingInputLockRenewal(result.pendingInputLock)
    : undefined;
  try {
    try {
      await adapter.markRead(thread.id);
    } catch {
      // Read receipts are cosmetic and are never retried.
    }
    if (result.inputResponses) {
      await bridge.send(
        { inputResponses: result.inputResponses },
        { auth: result.auth, thread }
      );
      if (lockRenewal?.lost())
        throw new Error(
          "Lost the SendBlue conversation lock before acknowledgement."
        );
      if (result.inputResponseStateKey) {
        const pending = pendingSendblueInputSchema.safeParse(
          await state.get(result.inputResponseStateKey)
        );
        if (
          pending.success &&
          pending.data.generation === result.inputResponseStateGeneration
        )
          await state.delete(result.inputResponseStateKey);
      }
      return;
    }
    if (result.pendingInputPrompt) {
      const observedBinding = channelObservedBindingForAuth(result.auth);
      const nextRequest = result.pendingInputState?.requests.find(
        (request) =>
          !result.pendingInputState?.responses.some(
            (response) => response.requestId === request.requestId
          )
      );
      // The held inbound lock makes this response-to-next-prompt transition
      // atomic with respect to other SendBlue input. Persist it before the
      // provider attempt so scheduler recovery cannot send a prompt whose
      // preceding answer was lost.
      if (
        observedBinding &&
        result.pendingInputStateKey &&
        result.pendingInputState
      )
        await state.set(
          result.pendingInputStateKey,
          result.pendingInputState,
          pendingInputTtlMs
        );
      const posted =
        observedBinding && result.inboundMessageHandle
          ? await queueObservedSendblueReply({
              bindingId: observedBinding,
              replyKeyPrefix: `pending-input:${result.inboundMessageHandle}:${nextRequest?.requestId ?? "next"}`,
              text: result.pendingInputPrompt,
              thread,
            })
          : await postSendblueReply(
              thread,
              { raw: result.pendingInputPrompt },
              scopeFromPrincipal(result.auth)
            );
      if (!posted) return;
      if (lockRenewal?.lost())
        throw new Error(
          "Lost the SendBlue conversation lock before prompting."
        );
      if (
        !observedBinding &&
        result.pendingInputStateKey &&
        result.pendingInputState
      )
        await state.set(
          result.pendingInputStateKey,
          result.pendingInputState,
          pendingInputTtlMs
        );
      return;
    }
    if (result.drainOnboarding || result.drainWelcomeOnly) {
      const dispatchOpeningRequest = async (
        input: SendblueOpeningRequest
      ): Promise<OpeningRequestDispatchResult> => {
        if (input.threadId !== thread.id) return { kind: "proven_unsent" };
        const session = await bridge.send(input.content, {
          auth: input.auth,
          thread,
          turnPolicy: "queue",
        });
        return session.id
          ? { kind: "accepted", sessionId: session.id }
          : { kind: "proven_unsent" };
      };
      if (result.drainWelcomeOnly) {
        await drainSendblueChannelOnboarding({
          bindingId: result.auth.attributes.channelBindingId,
          dispatchOpeningRequest,
          kinds: ["welcome"],
        });
      } else {
        await drainSendblueChannelOnboarding({
          bindingId: result.auth.attributes.channelBindingId,
          dispatchOpeningRequest,
        });
      }
      return;
    }
    const prepared = await prepareModelImageAttachments(message.attachments);
    const partitioned = partitionDirectPromptAttachments(prepared.kept);
    const withheldCount = prepared.withheldCount + partitioned.droppedCount;
    message.attachments.length = 0;
    message.attachments.push(...partitioned.kept);

    const content = messageToUserContent(message);
    if (
      (Array.isArray(content) && content.length === 0) ||
      (!Array.isArray(content) && content.trim().length === 0)
    ) {
      if (withheldCount > 0) {
        const fallback =
          "I received your attachment, but I can't open that format. Please resend photos as JPEG or PNG and I'll take a look.";
        const observedBinding = channelObservedBindingForAuth(result.auth);
        if (observedBinding && result.inboundMessageHandle) {
          await queueObservedSendblueReply({
            bindingId: observedBinding,
            replyKeyPrefix: `attachment-fallback:${result.inboundMessageHandle}:unsupported-format`,
            text: fallback,
            thread,
          });
        } else {
          await postSendblueReply(
            thread,
            { raw: fallback },
            scopeFromPrincipal(result.auth)
          );
        }
        if (lockRenewal?.lost())
          throw new Error(
            "Lost the SendBlue conversation lock after attachment fallback."
          );
      }
      return;
    }
    await bridge.send(content, {
      auth: result.auth,
      thread,
    });
    if (lockRenewal?.lost())
      throw new Error("Lost the SendBlue conversation lock during dispatch.");
  } finally {
    lockRenewal?.stop();
    if (result.pendingInputLock)
      await state.releaseLock(result.pendingInputLock);
  }
}

bridge.bot.onDirectMessage(dispatchSendblueMessage);

export default bridge.channel;

async function findVerifiedAuthUserIdByPhoneNumber(phoneNumber: string) {
  const auth = await getAuth();
  const context = await auth.$context;
  const user = await context.adapter.findOne({
    model: "user",
    where: [{ field: "phoneNumber", value: phoneNumber }],
  });
  const parsed = verifiedPhoneUserSchema.safeParse(user);
  return parsed.success ? parsed.data.id : undefined;
}

function inboundMessageKey(bindingId: string, messageHandle: string) {
  const digest = createHash("sha256")
    .update(`${bindingId}:${messageHandle}`)
    .digest("hex");
  return `inbound:${digest}`;
}

function channelEnrollmentAuth(
  enrollment: Awaited<
    ReturnType<typeof resolveChannelEnrollment>
  > extends infer T
    ? Exclude<T, undefined>
    : never,
  conversationId: string
): SendblueOnMessageResult["auth"] {
  return {
    attributes: {
      authAssurance: enrollment.authAssurance,
      capabilityProfile: enrollment.capabilityProfile,
      channelBindingId: enrollment.bindingId,
      conversationChannel: "sendblue",
      conversationId,
      identityProvenance: enrollment.identityProvenance,
      workspaceId: enrollment.workspaceId,
    },
    authenticator: "sendblue-message",
    principalId: enrollment.principalId,
    principalType: "user",
  };
}

function channelObservedBindingForSession(
  session: Parameters<typeof isChannelObservedSession>[0]
) {
  if (!isChannelObservedSession(session)) return undefined;
  const parsed = channelObservedSessionAttributesSchema.safeParse(
    session.session.auth.initiator?.attributes
  );
  return parsed.success ? parsed.data.channelBindingId : undefined;
}

function channelObservedBindingForAuth(auth: SendblueOnMessageResult["auth"]) {
  return auth.attributes.authAssurance === "channel_observed" &&
    auth.attributes.capabilityProfile === "channel-basic"
    ? auth.attributes.channelBindingId
    : undefined;
}

/**
 * The SendBlue API accepts at most 18,996 characters in one message. Keep the
 * part ordinal in the durable key so a replay reuses each physical operation.
 */
function splitSendblueReply(text: string) {
  const parts: string[] = [];
  for (
    let offset = 0;
    offset < text.length;
    offset += maximumSendblueOnboardingTextCharacters
  ) {
    parts.push(
      text.slice(offset, offset + maximumSendblueOnboardingTextCharacters)
    );
  }
  return parts;
}

/**
 * Observed-channel replies always enter the delivery outbox before the
 * provider sees them. A truthy result means every persisted part has a
 * provider handle; it deliberately does not mean recipient delivery.
 */
async function queueObservedSendblueReply({
  bindingId,
  replyKeyPrefix,
  text,
  thread,
}: {
  readonly bindingId: string;
  readonly replyKeyPrefix: string;
  readonly text: string;
  readonly thread: SendblueThread;
}) {
  const recipient = adapter.decodeThreadId(thread.id).contactNumber;
  if (!recipient)
    throw new Error("SendBlue reply requires a direct recipient.");
  const parts = splitSendblueReply(text);
  if (parts.length === 0) return false;
  const replyKeys = parts.map((part, index) => {
    const replyKey = `${replyKeyPrefix}:${String(index)}`;
    return { part, replyKey };
  });
  // The operation ordinal is the visible multipart reply order. Inserting
  // later parts only after their predecessor prevents concurrent transactions
  // from assigning the same ordinal.
  /* oxlint-disable eslint/no-await-in-loop */
  for (const { part, replyKey } of replyKeys) {
    await enqueueChannelOnboardingOutboundReply({
      bindingId,
      payload: {
        from: configured.fromNumber,
        presentation: { kind: "text" },
        text: part,
        to: recipient,
        version: 1,
      },
      replyKey,
    });
  }
  /* oxlint-enable eslint/no-await-in-loop */
  await drainSendblueChannelOnboarding({
    bindingId,
    kinds: ["outbound_reply"],
  });
  const outcomes = await Promise.all(
    replyKeys.map(({ replyKey }) =>
      getChannelOnboardingOutboundReplyDelivery({ bindingId, replyKey })
    )
  );
  return outcomes.every((outcome) => outcome?.kind === "provider_accepted");
}

function inputRequestTurnId(event: InputRequestEventMetadata) {
  return inputRequestTurnSchema.safeParse(event).data?.turnId ?? "input";
}

function openingRequestFrom(
  text: string,
  attachments: readonly { readonly mimeType?: string; readonly url?: string }[],
  hadAttachment: boolean
) {
  const preserved = attachments.flatMap((attachment) => {
    const data = dataUrlPrivateAttachment(attachment.url, attachment.mimeType);
    return data ? [data] : [];
  });
  const request: OnboardingOpeningRequest = {};
  if (preserved.length) request.attachments = [...preserved];
  if (text.trim().length) request.text = text;
  else if (hadAttachment && preserved.length === 0)
    request.text =
      "The sender attached a file that could not be safely read. Ask them to resend it as a JPEG or PNG.";
  return request;
}

function isKnownCapabilityGreeting(text: string, attachmentCount: number) {
  if (attachmentCount > 0) return "after_intro";
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!.?]+$/u, "");
  const shortGreetings = new Set(["hi", "hello", "hey", "hey jory"]);
  return shortGreetings.has(normalized) ||
    normalized.includes("what can you do")
    ? "after_welcome"
    : "after_intro";
}

function dataUrlPrivateAttachment(
  url: string | undefined,
  mimeType: string | undefined
) {
  if (!url?.startsWith("data:")) return undefined;
  const comma = url.indexOf(",");
  if (comma < 0) return undefined;
  const metadata = url.slice(5, comma);
  const [contentType] = metadata.split(";");
  if (!contentType || !metadata.toLowerCase().includes(";base64"))
    return undefined;
  const privateData = url.slice(comma + 1);
  if (!privateData) return undefined;
  return { contentType: mimeType ?? contentType, privateData };
}

async function claimSendblueInboundTurn({
  auth,
  bindingId,
  message,
  threadId,
  workspaceId,
}: {
  readonly auth: SendblueOnMessageResult["auth"];
  readonly bindingId: string;
  readonly message: Message;
  readonly threadId: string;
  readonly workspaceId: string;
}): Promise<SendblueOnMessageResult | null> {
  await state.connect();
  const pendingInputLock = await acquirePendingInputLock(threadId);
  let lockHandedToDispatch = false;
  try {
    const admitted = validateSendblueInboundPayload(message.raw, configured);
    if (!admitted) return null;
    const claimed = await state.setIfNotExists(
      inboundMessageKey(bindingId, admitted.messageHandle),
      true
    );
    if (!claimed) return null;
    const pendingInputResponse = await resolvePendingInputResponses({
      message,
      threadId,
      workspaceId,
    });
    const result: SendblueOnMessageResult = {
      auth,
      inboundMessageHandle: admitted.messageHandle,
      ...pendingInputResponse,
      pendingInputLock,
    };
    lockHandedToDispatch = true;
    return result;
  } finally {
    if (!lockHandedToDispatch) await state.releaseLock(pendingInputLock);
  }
}

function pendingInputKey(threadId: string) {
  return `pending-input:${threadId}`;
}

async function acquirePendingInputLock(threadId: string) {
  /* oxlint-disable eslint/no-await-in-loop -- Each attempt must observe the prior owner before retrying; the native adapter has already acknowledged the webhook. */
  for (;;) {
    const lock = await state.acquireLock(threadId, pendingInputLockTtlMs);
    if (lock) return lock;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pendingInputLockRetryMs);
    });
  }
}

function startPendingInputLockRenewal(lock: Lock) {
  let lost = false;
  const timer = setInterval(() => {
    void state
      .extendLock(lock, pendingInputLockTtlMs)
      .then((extended) => {
        if (!extended) lost = true;
        return undefined;
      })
      .catch(() => {
        lost = true;
        return undefined;
      });
  }, pendingInputLockTtlMs / 2);
  return {
    lost: () => lost,
    stop: () => {
      clearInterval(timer);
    },
  };
}

function renderInputRequest(request: {
  readonly kind?: string;
  readonly options?: readonly { readonly label: string }[];
  readonly prompt: string;
}) {
  if (request.kind === "tool-approval")
    return "Ready for me to do that?\n\nReply naturally—“yes,” “go ahead,” or “no.”";
  if (request.options?.length)
    return [
      request.prompt,
      request.options
        .map((option, index) => `${String(index + 1)}. ${option.label}`)
        .join("\n"),
      "Reply with an option label or number.",
    ].join("\n\n");
  return `${request.prompt}\n\nReply with your answer.`;
}

async function resolvePendingInputResponses({
  message,
  threadId,
  workspaceId,
}: {
  readonly message: { readonly text: string };
  readonly threadId: string;
  readonly workspaceId: string;
}): Promise<PendingInputResult | undefined> {
  const text = message.text.trim();
  if (!text) return undefined;
  const key = pendingInputKey(threadId);
  await state.connect();
  const parsed = pendingSendblueInputSchema.safeParse(await state.get(key));
  if (!parsed.success || parsed.data.workspaceId !== workspaceId)
    return undefined;
  const answeredRequestIds = new Set(
    parsed.data.responses.map((response) => response.requestId)
  );
  const request = parsed.data.requests.find(
    (candidate) => !answeredRequestIds.has(candidate.requestId)
  );
  if (!request)
    return parsed.data.responses.length === parsed.data.requests.length
      ? {
          inputResponses: parsed.data.responses,
          inputResponseStateGeneration: parsed.data.generation,
          inputResponseStateKey: key,
        }
      : undefined;
  const normalized = normalizeInputReply(text);
  let option = request.options?.find(
    (candidate, index) =>
      normalizeInputReply(candidate.id) === normalized ||
      normalizeInputReply(candidate.label) === normalized ||
      String(index + 1) === normalized
  );
  if (!option && request.kind === "tool-approval")
    option = request.options?.find(
      (candidate) => candidate.id === approvalOptionId(normalized)
    );
  const response = option
    ? { optionId: option.id, requestId: request.requestId }
    : request.allowFreeform
      ? { requestId: request.requestId, text }
      : undefined;
  if (!response) return undefined;
  const responses = [...parsed.data.responses, response];
  const nextRequest = parsed.data.requests.find(
    (candidate) =>
      candidate.requestId !== request.requestId &&
      !answeredRequestIds.has(candidate.requestId)
  );
  if (nextRequest) {
    return {
      pendingInputPrompt: renderInputRequest(nextRequest),
      pendingInputState: { ...parsed.data, responses },
      pendingInputStateKey: key,
    };
  }
  await state.set(key, { ...parsed.data, responses }, pendingInputTtlMs);
  return {
    inputResponses: responses,
    inputResponseStateGeneration: parsed.data.generation,
    inputResponseStateKey: key,
  };
}

/**
 * Where a physical send fits in a bound completion report. Absent for every
 * ordinary message, which is almost all of them.
 */
interface ReportDispatchOptions {
  readonly identity?: ReportPartIdentity;
  readonly leaseOwner: string;
  readonly conversationId: string;
}

/**
 * The durable identity of one physical effect of the report this call may be
 * making, or undefined when there is no scope to bind one to or this call
 * answers no completion obligation. Never computed from anything the caller
 * controls beyond the part name itself.
 */
function reportPartIdentity(input: {
  readonly scope: AccessScope | undefined;
  readonly rootSessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly part: ReportPart;
}): ReportPartIdentity | undefined {
  return input.scope
    ? reportPartIdentityFor({
        callId: input.callId,
        part: input.part,
        rootSessionId: input.rootSessionId,
        turnId: input.turnId,
        workspaceId: input.scope.workspaceId,
      })
    : undefined;
}

async function postSendblueReply(
  thread: SendblueThread,
  outgoing: { readonly raw: string },
  scope?: AccessScope,
  report?: ReportDispatchOptions
) {
  if (await isSendblueThreadCommunicationStopped(thread)) return false;
  if (!(await checkSendblueMessageBudget(thread, scope))) return false;
  const dispatched = await dispatchReportPart({
    channel: "sendblue",
    contentDigest: createHash("sha256").update(outgoing.raw).digest("hex"),
    conversationId: report?.conversationId ?? thread.id,
    dispatch: async () => {
      if (await isSendblueThreadCommunicationStopped(thread))
        throw new Error("SendBlue communication is stopped.");
      const posted = await thread.post(outgoing);
      if (!posted.id) throw new Error("SendBlue did not accept the message.");
    },
    identity: report?.identity,
    leaseOwner: report?.leaseOwner ?? "sendblue",
  });
  if (dispatched.kind === "not_dispatched")
    return dispatched.reason === "already_accepted";
  await recordSendblueUsage(scope);
  return true;
}

async function checkSendblueMessageBudget(
  thread: SendblueThread,
  scope?: AccessScope
) {
  if (await isSendblueThreadCommunicationStopped(thread)) return false;
  if (!scope) return true;
  try {
    await checkBudget(scope, "provider_message");
    return true;
  } catch (error) {
    if (
      !(error instanceof BudgetExceededError) &&
      !(error instanceof WorkspaceNotOperableError)
    )
      throw error;
    if (await isSendblueThreadCommunicationStopped(thread)) return false;
    const posted = await thread.post({ raw: error.message });
    if (!posted.id)
      throw new Error("SendBlue did not accept the message.", {
        cause: error,
      });
    await recordSendblueUsage(scope);
    return false;
  }
}

async function isSendblueThreadCommunicationStopped(thread: SendblueThread) {
  const recipient = adapter.decodeThreadId(thread.id);
  if (
    !recipient.contactNumber ||
    recipient.fromNumber !== configured.fromNumber
  )
    return true;
  return isChannelCommunicationStopped({
    phoneNumber: recipient.contactNumber,
    provider: "sendblue",
    providerAccountId: configured.accountId,
    providerLineId: configured.fromNumber,
  });
}

async function recordSendblueUsage(scope?: AccessScope) {
  if (!scope) return;
  try {
    await recordUsageEvent(scope, {
      kind: "provider_message",
      quantity: 1,
      unit: "messages",
    });
  } catch {
    console.warn("[usage] usage event recording failed");
  }
}

function scopeForSession(
  session:
    | {
        readonly session: {
          readonly auth: {
            readonly current: Parameters<typeof scopeFromPrincipal>[0] | null;
            readonly initiator: Parameters<typeof scopeFromPrincipal>[0] | null;
          };
        };
      }
    | undefined
) {
  const caller =
    session?.session.auth.current ?? session?.session.auth.initiator;
  return caller ? scopeFromPrincipal(caller) : undefined;
}

async function uploadSendblueFile(file: BrowserImageArtifactFile) {
  const bytes = new Uint8Array(new ArrayBuffer(file.data.byteLength));
  bytes.set(file.data);
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes.buffer], { type: file.mimeType }),
    file.filename
  );
  let response: Response;
  try {
    response = await fetch(sendblueFileUploadUrl, {
      body: form,
      headers: {
        "sb-api-key-id": env.SENDBLUE_API_KEY_ID ?? "",
        "sb-api-secret-key": env.SENDBLUE_API_SECRET_KEY ?? "",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(sendblueFileUploadTimeoutMs),
    });
  } catch {
    throw new Error("SendBlue could not upload the image for delivery.");
  }
  if (response.status !== 201)
    throw new Error("SendBlue could not upload the image for delivery.");
  const uploaded = sendblueFileUploadSchema.safeParse(
    await readBoundedSendblueUploadResponse(response)
  );
  if (!uploaded.success)
    throw new Error("SendBlue could not upload the image for delivery.");
  return uploaded.data.media_url;
}

async function readBoundedSendblueUploadResponse(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > maximumSendblueUploadResponseBytes
  )
    return undefined;
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    /* oxlint-disable eslint/no-await-in-loop -- A response body is an ordered stream and must be read and cancelled sequentially. */
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumSendblueUploadResponseBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    /* oxlint-enable eslint/no-await-in-loop */
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    // SAFETY: The provider body remains untrusted until the upload schema validates it.
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

function imageDeliveryFailureMessage(failedImageCount: number) {
  if (failedImageCount === 0) return "";
  if (failedImageCount === 1) return "I couldn't attach one image.";
  return `I couldn't attach ${String(failedImageCount)} images.`;
}

function normalizeInputReply(text: string) {
  return text
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?]+$/gu, "")
    .trim();
}

function approvalOptionId(reply: string) {
  if (approvalReplies.has(reply)) return "approve";
  if (cancellationReplies.has(reply)) return "cancel";
  return undefined;
}
