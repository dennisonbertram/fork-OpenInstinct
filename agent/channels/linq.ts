import { connectLinqCredentials } from "@vercel/connect/eve";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createLinqAdapter } from "@linqapp/chat-sdk-adapter";
import { LinqAPIV3 } from "@linqapp/sdk";
import type { AdapterPostableMessage } from "chat";
import {
  defaultLinqAuth,
  type LinqChannelConfig,
  type LinqChannelCredentials,
} from "eve/channels/linq";
import { vercelOidc } from "eve/channels/auth";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import { z } from "zod";
import { getAuth } from "@/auth";
import { reactToMessageToolResultSchema } from "@/agent/lib/react-to-message";
import { sendMessageToolResultSchema } from "@/agent/lib/send-message";
import { normalizeAuthPhoneNumber } from "@/auth/phone-number";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import { accessScopeForUser, type AccessScope } from "@/lib/access-scope";
import { prepareLinqImageArtifactDelivery } from "../lib/linq-image-artifact/delivery";
import {
  extractImageArtifactMarkdownReferences,
  stripImageArtifactMarkdownReferences,
} from "../lib/linq-image-artifact/markdown";
import { env } from "@/env";
import {
  finalizeScheduledReportDelivery,
  releaseScheduledReportDelivery,
  scheduledReportFromSession,
} from "@/agent/lib/schedules/report-lifecycle";
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
  claimConversationInboundMessage,
  createConversationBinding,
  resolveConversationBinding,
} from "@/db/services/channel-conversations";
import { recordConnectionInstallation } from "@/db/services/connection-installations";
import { findVerifiedUserByPhoneNumber } from "@/db/services/phone-identities";

const verifiedPhoneUserSchema = z.object({
  id: z.string().min(1),
  phoneNumberVerified: z.literal(true),
});

const trustedForwarder = vercelOidc();

// The Linq adapter only rejects a webhook when the verifier returns `false`,
// while eve's OIDC verifier reports failure as `null`. Translate explicitly so
// an unverified forwarder can never reach message dispatch.
export const linqWebhookVerifier: NonNullable<
  LinqChannelCredentials["webhookVerifier"]
> = async (request) => (await trustedForwarder(request)) ?? false;

const credentials = (
  env.LINQ_CONNECTOR
    ? {
        ...connectLinqCredentials(env.LINQ_CONNECTOR),
        webhookVerifier: linqWebhookVerifier,
      }
    : {
        apiKey() {
          throw new Error(
            "LINQ_CONNECTOR is not configured for this deployment."
          );
        },
        webhookVerifier: () => false,
      }
) satisfies LinqChannelCredentials;

const pendingLinqInputSchema = z.object({
  requests: z.array(
    z.object({
      allowFreeform: z.boolean().optional(),
      kind: z.enum(["question", "session-limit", "tool-approval"]).optional(),
      options: z
        .array(z.object({ id: z.string(), label: z.string() }))
        .optional(),
      requestId: z.string(),
    })
  ),
  workspaceId: z.string().min(1),
});
const pendingInputTtlMs = 86_400_000;
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
const linqState = createPostgresState({
  keyPrefix: "openinstinct-linq",
  url: env.DATABASE_URL,
});

type LinqInputRequest = Parameters<
  NonNullable<NonNullable<LinqChannelConfig["events"]>["input.requested"]>
>[0]["requests"][number];
type LinqOnMessage = NonNullable<LinqChannelConfig["onMessage"]>;
type LinqInboundMessage = Parameters<LinqOnMessage>[1];
type BaseLinqInboundResult = Exclude<Awaited<ReturnType<LinqOnMessage>>, null>;
interface LinqInputResponse {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
}
type OpenInstinctLinqInboundResult =
  | (BaseLinqInboundResult & {
      readonly inputResponseStateKey?: string;
      readonly inputResponses?: readonly LinqInputResponse[];
    })
  | null;
type OpenInstinctLinqChannelConfig = Omit<LinqChannelConfig, "onMessage"> & {
  readonly onMessage: (
    ...args: Parameters<LinqOnMessage>
  ) => OpenInstinctLinqInboundResult | Promise<OpenInstinctLinqInboundResult>;
};

/**
 * Renders one pending approval or question as user-facing plain text. eve
 * renders HITL natively only for Discord, so Linq must post the choices itself.
 */
function renderLinqInputRequest(request: LinqInputRequest) {
  const options = request.options ?? [];
  if (request.kind === "tool-approval") {
    return [
      "Ready for me to do that?",
      "Reply naturally—“yes,” “go ahead,” or “cancel.”",
    ].join("\n\n");
  }
  if (options.length > 0) {
    const choices = options
      .map((option, index) => `${String(index + 1)}. ${option.label}`)
      .join("\n");
    return [
      request.prompt,
      choices,
      "Reply with an option label or number.",
    ].join("\n\n");
  }
  return [request.prompt, "Reply with your answer."].join("\n\n");
}

export const linqChannelConfig = {
  credentials,
  events: {
    async "input.requested"(event, context, session) {
      if (!context.thread || event.requests.length === 0) return;
      const caller =
        session.session.auth.current ?? session.session.auth.initiator;
      if (caller) {
        const scope = scopeFromPrincipal(caller);
        const threadId = z.string().safeParse(context.thread.id);
        if (!threadId.success) return;
        await linqState.connect();
        await linqState.set(
          pendingInputKey(threadId.data),
          {
            requests: event.requests.map((request) => ({
              allowFreeform: request.allowFreeform,
              kind: request.kind,
              options: request.options?.map((option) => ({
                id: option.id,
                label: option.label,
              })),
              requestId: request.requestId,
            })),
            workspaceId: scope.workspaceId,
          },
          pendingInputTtlMs
        );
      }
      await context.thread.post({
        raw: event.requests.map(renderLinqInputRequest).join("\n\n"),
      });
    },
    async "authorization.required"(event, context) {
      if (!context.thread || event.candidateId !== undefined) return;
      const displayName = event.authorization?.displayName ?? "this account";
      const url = event.authorization?.url;
      const prompt = url
        ? `Connect ${displayName} to continue:\n${url}`
        : (event.authorization?.instructions ??
          `Connect ${displayName} to continue.`);
      const posted = await context.thread.post({ raw: prompt });
      if (posted.id) {
        context.state.pendingAuthMessageIds = {
          ...context.state.pendingAuthMessageIds,
          [event.name]: posted.id,
        };
      }
    },
    async "action.result"(event, context, session) {
      const reaction = reactToMessageToolResultSchema.safeParse(event.result);
      if (event.status === "completed" && reaction.success) {
        if (!context.thread) {
          throw new Error(
            "react_to_message requires an active Linq conversation thread."
          );
        }
        const messageId = context.thread.toJSON().currentMessage?.id;
        if (!messageId) {
          throw new Error("react_to_message requires a current Linq message.");
        }
        const adapter = context.bot.getAdapter("linq");
        if (reaction.data.output.operation === "remove") {
          await adapter.removeReaction(
            context.thread.id,
            messageId,
            reaction.data.output.type
          );
        } else {
          await adapter.addReaction(
            context.thread.id,
            messageId,
            reaction.data.output.type
          );
        }
        await finalizeScheduledReportDelivery(session);
        return;
      }

      const message = sendMessageToolResultSchema.safeParse(event.result);
      if (event.status === "completed" && message.success) {
        const { thread } = context;
        if (!thread) {
          throw new Error(
            "send_message requires an active Linq conversation thread."
          );
        }
        const report = scheduledReportFromSession(session);
        const idempotencyKey = report
          ? `scheduled-report:${report.runId}:${String(report.sequence)}`
          : undefined;
        // Both branches discard the posted message so `postLinqReply` never
        // hands an adapter-shaped value back to its caller.
        const post = idempotencyKey
          ? async (content: AdapterPostableMessage) => {
              await context.bot
                .getAdapter("linq")
                .postMessage(thread.id, content, { idempotencyKey });
            }
          : async (content: AdapterPostableMessage) => {
              await thread.post(content);
            };

        if (message.data.output.kind === "link") {
          const adapter = context.bot.getAdapter("linq");
          const { chatId, pendingHandle } = adapter.decodeThreadId(thread.id);
          if (pendingHandle || !chatId) {
            throw new Error(
              "A native link preview requires an existing Linq conversation."
            );
          }
          const apiKey = await credentials.apiKey();
          const client = new LinqAPIV3({ apiKey });
          await client.chats.messages.send(
            chatId,
            {
              message: {
                parts: [{ type: "link", value: message.data.output.url }],
              },
            },
            idempotencyKey ? { idempotencyKey } : undefined
          );
          await finalizeScheduledReportDelivery(session);
          return;
        }

        const attachments = message.data.output.attachments?.map(
          ({ kind, ...attachment }) => ({ ...attachment, type: kind })
        );
        const { text: requestedText } = message.data.output;
        if (!requestedText) {
          if (attachments?.length) {
            await post({ attachments, raw: "" });
          }
          await finalizeScheduledReportDelivery(session);
          return;
        }

        const caller =
          session.session.auth.current ?? session.session.auth.initiator;
        if (!caller) {
          const references =
            extractImageArtifactMarkdownReferences(requestedText);
          const text =
            references.length === 0
              ? requestedText
              : [
                  stripImageArtifactMarkdownReferences(requestedText),
                  "I couldn't attach the image.",
                ]
                  .filter(Boolean)
                  .join("\n\n");
          const outgoing: Extract<
            Parameters<typeof thread.post>[0],
            { raw: string }
          > = { raw: text };
          if (attachments?.length) outgoing.attachments = attachments;
          // Provider-auth-only replies lack a workspace: not budgeted or ledgered.
          await postLinqReply(post, outgoing);
          await finalizeScheduledReportDelivery(session);
          return;
        }

        const delivery = await prepareLinqImageArtifactDelivery(requestedText, {
          rootSessionId: report?.workerSessionId ?? session.session.id,
          scope: scopeFromPrincipal(caller),
        });
        if (delivery.failedArtifactIds.length > 0) {
          console.warn("[linq] browser image delivery failed", {
            artifactIds: delivery.failedArtifactIds,
            sessionId: session.session.id,
          });
        }
        const failureMessage =
          delivery.failedArtifactIds.length === 0
            ? ""
            : delivery.failedArtifactIds.length === 1
              ? "I couldn't attach one image."
              : `I couldn't attach ${String(delivery.failedArtifactIds.length)} images.`;
        const text = [delivery.text, failureMessage]
          .filter(Boolean)
          .join("\n\n");
        const outgoing: Extract<
          Parameters<typeof thread.post>[0],
          { raw: string }
        > = { raw: text };
        if (attachments?.length) outgoing.attachments = attachments;
        if (delivery.files.length > 0) outgoing.files = delivery.files;
        try {
          await postLinqReply(post, outgoing, scopeFromPrincipal(caller));
        } catch (error) {
          if (
            error instanceof BudgetExceededError ||
            error instanceof WorkspaceNotOperableError
          )
            return;
          throw error;
        }
        await finalizeScheduledReportDelivery(session);
      }
    },
    async "message.completed"(event, _context, session) {
      if (event.finishReason === "tool-calls") return;
      const report = scheduledReportFromSession(session);
      if (report) {
        await finalizeScheduledReportDelivery(session, "suppressed");
      }
    },
    async "session.completed"(_event, _context, session) {
      const report = scheduledReportFromSession(session);
      if (report) {
        await finalizeScheduledReportDelivery(session, "suppressed");
      }
    },
    async "turn.cancelled"(_event, _context, session) {
      await releaseScheduledReportDelivery(
        session,
        "Scheduled result reporting was cancelled."
      );
    },
    async "turn.failed"(event, _context, session) {
      await releaseScheduledReportDelivery(session, event.message);
    },
  },
  async onMessage(context, message): Promise<OpenInstinctLinqInboundResult> {
    if (message.author.isBot) return null;

    const auth = defaultLinqAuth(message);
    const authorUserName = z.string().safeParse(message.author.userName);
    const phoneNumber = authorUserName.success
      ? normalizeAuthPhoneNumber(authorUserName.data)
      : undefined;
    const verifiedUserId = phoneNumber
      ? await findVerifiedAuthUserIdByPhoneNumber(phoneNumber)
      : undefined;
    if (!verifiedUserId || !phoneNumber) {
      // Phone possession is the only sign-in factor, so a handle that is not
      // linked to a verified user is unauthenticated: never mint a principal
      // or a workspace for it.
      console.warn("[linq] ignoring message from an unlinked handle", {
        threadId: context.thread.id,
      });
      return null;
    }
    const principalId = `better-auth:${verifiedUserId}`;
    const scope = accessScopeForUser(principalId);
    const verifiedScope = await verifyScopeAccess(scope);
    if (!verifiedScope) return null;

    const identity = await findVerifiedUserByPhoneNumber(phoneNumber);
    if (identity?.userId !== verifiedUserId) return null;

    const provider = "linq";
    const providerAccountId = env.LINQ_CONNECTOR;
    const providerLineId = env.LINQ_PHONE_NUMBER;
    const providerConversationId = context.thread.id;
    if (!providerAccountId || !providerLineId) return null;

    let binding = await resolveConversationBinding({
      provider,
      providerAccountId,
      providerConversationId,
    });
    let bindingCreated = false;
    if (!binding) {
      binding = await createConversationBinding({
        phoneIdentityId: identity.phoneIdentityId,
        platformLine: { connectorId: providerAccountId, providerLineId },
        provider,
        providerAccountId,
        providerConversationId,
        userId: verifiedUserId,
      });
      bindingCreated = binding !== undefined;
    }
    if (!binding || binding.workspaceId !== verifiedScope.workspaceId) {
      return null;
    }
    const messageId = z.string().min(1).safeParse(message.id);
    if (!messageId.success) return null;
    const claimed = await claimConversationInboundMessage({
      bindingId: binding.id,
      messageId: messageId.data,
      workspaceId: verifiedScope.workspaceId,
    });
    if (!claimed) return null;
    if (bindingCreated) {
      try {
        await recordConnectionInstallation(verifiedScope, {
          authorizationSubject: providerLineId,
          connectorId: providerAccountId,
          provider: "linq",
        });
      } catch {
        console.warn("[linq] connection installation recording failed");
      }
    }

    const pendingInputResponse = await resolvePendingInputResponses({
      message,
      threadId: providerConversationId,
      workspaceId: verifiedScope.workspaceId,
    });

    return {
      auth: {
        ...auth,
        attributes: {
          ...auth.attributes,
          conversationChannel: "linq",
          conversationId: context.thread.id,
          linqThreadId: context.thread.id,
          phoneNumber,
          workspaceId: verifiedScope.workspaceId,
        },
        principalId,
      },
      ...pendingInputResponse,
    };
  },
} satisfies OpenInstinctLinqChannelConfig;

const bridge = chatSdkChannel({
  adapters: {
    linq: createLinqAdapter({
      credentials: async () => ({ apiKey: await credentials.apiKey() }),
      webhookVerifier: credentials.webhookVerifier,
    }),
  },
  concurrency: "concurrent",
  events: linqChannelConfig.events,
  routes: { linq: "/eve/v1/linq" },
  state: linqState,
  streaming: false,
  userName: "eve",
});

bridge.bot.onDirectMessage(
  async (
    thread: Parameters<LinqOnMessage>[0]["thread"],
    message: LinqInboundMessage
  ) => {
    await dispatchLinqMessage(thread, message);
  }
);
bridge.bot.onNewMessage(
  /[\s\S]*/u,
  async (
    thread: Parameters<LinqOnMessage>[0]["thread"],
    message: LinqInboundMessage
  ) => {
    await dispatchLinqMessage(thread, message);
  }
);

export default bridge.channel;

async function dispatchLinqMessage(
  thread: Parameters<LinqOnMessage>[0]["thread"],
  message: LinqInboundMessage
) {
  const result = await linqChannelConfig.onMessage({ thread }, message);
  if (!result) return;

  try {
    await bridge.bot.getAdapter("linq").markRead(thread.id, message.id);
  } catch {
    // Marking read is cosmetic and must not prevent the user turn.
  }

  if (result.inputResponses) {
    await bridge.send(
      { inputResponses: result.inputResponses },
      { auth: result.auth, thread, title: result.title }
    );
    if (result.inputResponseStateKey) {
      try {
        await linqState.connect();
        await linqState.delete(result.inputResponseStateKey);
      } catch {
        console.warn("[linq] resolved input state cleanup failed");
      }
    }
    return;
  }

  const content = messageToUserContent(message);
  if (Array.isArray(content)) {
    if (content.length === 0) return;
  } else if (content.trim().length === 0) return;
  await bridge.send(
    { context: [...(result.context ?? [])], message: content },
    { auth: result.auth, thread, title: result.title }
  );
}

function pendingInputKey(threadId: string) {
  return `pending-input:${threadId}`;
}

async function resolvePendingInputResponses({
  message,
  threadId,
  workspaceId,
}: {
  readonly message: LinqInboundMessage;
  readonly threadId: string;
  readonly workspaceId: string;
}): Promise<
  | {
      readonly inputResponses: readonly LinqInputResponse[];
      readonly inputResponseStateKey: string;
    }
  | undefined
> {
  const text = message.text.trim();
  if (!text) return undefined;
  const key = pendingInputKey(threadId);
  await linqState.connect();
  const parsed = pendingLinqInputSchema.safeParse(await linqState.get(key));
  if (!parsed.success || parsed.data.workspaceId !== workspaceId) {
    return undefined;
  }
  if (parsed.data.requests.length !== 1) return undefined;

  const [request] = parsed.data.requests;
  if (!request) return undefined;
  const normalized = normalizeInputReply(text);
  const options = request.options ?? [];
  let option = options.find(
    (candidate, index) =>
      normalizeInputReply(candidate.id) === normalized ||
      normalizeInputReply(candidate.label) === normalized ||
      String(index + 1) === normalized
  );
  if (!option && request.kind === "tool-approval") {
    const optionId = approvalOptionId(normalized);
    option = options.find((candidate) => candidate.id === optionId);
  }
  const response = option
    ? { optionId: option.id, requestId: request.requestId }
    : request.allowFreeform
      ? { requestId: request.requestId, text }
      : undefined;
  if (!response) return undefined;
  return {
    inputResponses: [response],
    inputResponseStateKey: key,
  };
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

/**
 * Posts one send_message reply, budgeted and ledgered when the caller has a
 * workspace. One `send_message` call is one iMessage bubble: the agent decides
 * bubble boundaries by calling the tool more than once, so the channel never
 * re-splits the text. `splitLinqReply` (`agent/lib/linq/reply.ts`) stays the
 * single splitter for the Square eval gym, which scores unsent reply shape.
 */
async function postLinqReply(
  post: (content: AdapterPostableMessage) => Promise<void>,
  outgoing: Extract<AdapterPostableMessage, { raw: string }>,
  scope?: AccessScope
) {
  if (scope) {
    try {
      await checkBudget(scope, "provider_message");
    } catch (error) {
      if (
        error instanceof BudgetExceededError ||
        error instanceof WorkspaceNotOperableError
      ) {
        await post({ raw: error.message });
        recordLinqUsage(scope);
      }
      throw error;
    }
  }
  await post(outgoing);
  recordLinqUsage(scope);
}

function recordLinqUsage(scope: AccessScope | undefined) {
  if (!scope) return;
  void recordUsageEvent(scope, {
    kind: "provider_message",
    quantity: 1,
    unit: "messages",
  }).catch(() => {
    console.warn("[usage] usage event recording failed");
  });
}

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
