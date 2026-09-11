import { createPostgresState } from "@chat-adapter/state-pg";
import { createSendblueAdapter } from "chat-adapter-sendblue";
import type { Lock, Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import {
  finalDeliveryStatus,
  recordUnconfirmedDelivery,
  requestFinalDeliveryCompletion,
  settleFinalDelivery,
} from "@/agent/lib/message-delivery";
import { sendMessageToolResultSchema } from "@/agent/lib/send-message";
import { reactToMessageToolResultSchema } from "@/agent/lib/react-to-message";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@/auth";
import { env } from "@/env";
import { accessScopeForUser, type AccessScope } from "@/lib/access-scope";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import {
  createConversationBinding,
  resolveConversationBinding,
  resolveVerifiedConversationBinding,
} from "@/db/services/channel-conversations";
import { findVerifiedUserByPhoneNumber } from "@/db/services/phone-identities";
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
type SendblueThread = Thread;
interface SendblueOnMessageResult extends PendingInputResult {
  readonly auth: {
    readonly attributes: {
      readonly conversationChannel: "sendblue";
      readonly conversationId: string;
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
    const verifiedUserId = await findVerifiedAuthUserIdByPhoneNumber(
      admitted.senderNumber
    );
    if (!verifiedUserId) return null;
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
    await state.connect();
    const pendingInputLock = await acquirePendingInputLock(context.thread.id);
    let lockHandedToDispatch = false;
    try {
      const claimed = await state.setIfNotExists(
        inboundMessageKey(binding.id, admitted.messageHandle),
        true
      );
      if (!claimed) return null;
      const pendingInputResponse = await resolvePendingInputResponses({
        message,
        threadId: context.thread.id,
        workspaceId: verifiedScope.workspaceId,
      });
      const result: SendblueOnMessageResult = {
        auth: {
          attributes: {
            conversationChannel: "sendblue" as const,
            conversationId: context.thread.id,
            workspaceId: verifiedScope.workspaceId,
          },
          authenticator: "sendblue-message" as const,
          principalId: `better-auth:${verifiedUserId}`,
          principalType: "user" as const,
        },
        ...pendingInputResponse,
        pendingInputLock,
      };
      lockHandedToDispatch = true;
      return result;
    } finally {
      if (!lockHandedToDispatch) await state.releaseLock(pendingInputLock);
    }
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
      const posted = await postSendblueReply(
        context.thread,
        { raw: renderInputRequest(request) },
        scope
      );
      if (!posted) return;
      await state.set(
        pendingInputKey(context.thread.id),
        {
          // SMS receives one request at a time. The remaining requests and
          // their accepted replies stay in the same scoped durable state.
          generation: randomUUID(),
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
          responses: [],
          workspaceId: scope.workspaceId,
        },
        pendingInputTtlMs
      );
    },
    async "action.result"(event, context, session) {
      if (event.status !== "completed" || !context.thread) return;
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
                scope
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
                mediaUrl =
                  "file" in mediaItem
                    ? await uploadSendblueFile(mediaItem.file)
                    : mediaItem.attachment.url;
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
                    scope
                  ))
                )
                  return;
                break;
              }
              if (!mediaUrl)
                throw new Error(
                  "SendBlue media delivery requires a valid URL."
                );
              const response = await adapter.getSdk().messages.send({
                content: index === 0 ? attachmentCaption : "",
                from_number: configured.fromNumber,
                media_url: mediaUrl,
                number: contactNumber,
              });
              if (!response.message_handle)
                throw new Error("SendBlue did not accept the media message.");
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
      if (!context.thread || finalDeliveryStatus(event.turnId) !== undefined)
        return;
      await postSendblueReply(
        context.thread,
        {
          raw: "I couldn’t complete that request because of a service error. Please try again later.",
        },
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
      const posted = await postSendblueReply(
        thread,
        { raw: result.pendingInputPrompt },
        scopeFromPrincipal(result.auth)
      );
      if (!posted) return;
      if (lockRenewal?.lost())
        throw new Error(
          "Lost the SendBlue conversation lock before prompting."
        );
      if (result.pendingInputStateKey && result.pendingInputState)
        await state.set(
          result.pendingInputStateKey,
          result.pendingInputState,
          pendingInputTtlMs
        );
      return;
    }
    await bridge.send(messageToUserContent(message), {
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

async function postSendblueReply(
  thread: SendblueThread,
  outgoing: { readonly raw: string },
  scope?: AccessScope
) {
  if (!(await checkSendblueMessageBudget(thread, scope))) return false;
  const posted = await thread.post(outgoing);
  if (!posted.id) throw new Error("SendBlue did not accept the message.");
  await recordSendblueUsage(scope);
  return true;
}

async function checkSendblueMessageBudget(
  thread: SendblueThread,
  scope?: AccessScope
) {
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
    const posted = await thread.post({ raw: error.message });
    if (!posted.id)
      throw new Error("SendBlue did not accept the message.", {
        cause: error,
      });
    await recordSendblueUsage(scope);
    return false;
  }
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
