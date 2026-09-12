import type { LinqSendOptions } from "@linqapp/chat-sdk-adapter";
import type { LinqAPIV3 } from "@linqapp/sdk";
import type { AdapterPostableMessage } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as Blob from "@vercel/blob";
import type * as EnvModule from "@/env";
import type * as UsageService from "@/db/services/usage";
import type { checkBudget, recordUsageEvent } from "@/db/services/usage";
import { reactToMessageOutputSchema } from "@/agent/lib/react-to-message";
import { sendMessageOutputSchema } from "@/agent/lib/send-message";
import type { AccessScope } from "@/lib/access-scope";
import type {
  finalizeScheduledReport,
  releaseScheduledReport,
} from "@/db/services/scheduled-agent-jobs";
import { defineMessagingProviderContract } from "./provider-contract";
import messaging from "@/agent/tools/messaging";
import { toolContextFor } from "@/tests/helpers/tool-context";

const deliveryStateFixture = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});

const dynamicToolSetSchema = z.record(
  z.string(),
  z
    .object({
      description: z.string(),
      execute: z
        .function()
        .input([z.unknown(), z.unknown()])
        .output(z.unknown()),
      inputSchema: z.unknown(),
    })
    .loose()
);
vi.mock("eve/context", () => ({
  defineState: <T>(_name: string, initial: () => T) => {
    let value = initial();
    deliveryStateFixture.resets.push(() => {
      value = initial();
    });
    return {
      get: () => value,
      update: (update: (current: T) => T) => {
        value = update(value);
      },
    };
  },
}));

interface BrowserImage {
  bytes: Uint8Array;
  filename: string;
  id: string;
  mediaType: string;
}

interface PendingInputStateFixture {
  readonly requests: readonly {
    readonly allowFreeform?: boolean;
    readonly kind?: "question" | "session-limit" | "tool-approval";
    readonly options?: readonly {
      readonly id: string;
      readonly label: string;
    }[];
    readonly requestId: string;
  }[];
  readonly workspaceId: string;
}

type NativeMessageBody = Parameters<LinqAPIV3["chats"]["messages"]["send"]>[1];
type NativeMessageOptions = Parameters<
  LinqAPIV3["chats"]["messages"]["send"]
>[2];

// The fork budgets and ledgers every provider message. This suite covers
// outbound rendering only, so keep it clear of workspace lifecycle and usage
// lookups: enforcement off short-circuits checkBudget, and the usage ledger is
// mocked so no fire-and-forget insert reaches a database.
const usageCapture = vi.hoisted(() => {
  vi.stubEnv("WORKSPACE_SCOPE_ENFORCEMENT", "off");
  return { recordUsageEvent: vi.fn<typeof recordUsageEvent>() };
});
// Enforcement is off, so the real check never rejects. A denial is a state this
// suite has to be able to produce: it is the one path that posts to the provider
// without sending the message the turn was about.
const budget = vi.hoisted(() => ({ check: vi.fn<typeof checkBudget>() }));
vi.mock("@/db/services/usage", async (importOriginal) => ({
  ...(await importOriginal<typeof UsageService>()),
  checkBudget: budget.check,
  recordUsageEvent: usageCapture.recordUsageEvent,
}));

const linqChannelCapture = vi.hoisted(() => ({
  // SAFETY: This mutable test capture stores only API keys from the typed SDK constructor mock.
  clientApiKeys: [] as string[],
  connectState: vi.fn<() => Promise<void>>(),
  deleteState: vi.fn<(key: string) => Promise<void>>(),
  getState: vi.fn<(key: string) => Promise<PendingInputStateFixture | null>>(),
  images: new Map<string, BrowserImage>(),
  readImage: vi.fn<
    (
      scope: AccessScope,
      id: string,
      options: {
        readonly rootSessionId: string;
        readonly signal?: AbortSignal;
      }
    ) => Promise<BrowserImage | undefined>
  >(),
  postMessage: vi
    .fn<
      (
        threadId: string,
        message: AdapterPostableMessage,
        options?: LinqSendOptions
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined),
  resolveApiKey: vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("linq-test-api-key"),
  sendNativeMessage: vi
    .fn<
      (
        chatId: string,
        body: NativeMessageBody,
        options?: NativeMessageOptions
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined),
  setState:
    vi.fn<
      (
        key: string,
        value: PendingInputStateFixture,
        ttlMs?: number
      ) => Promise<void>
    >(),
}));
const scheduleDeliveryCapture = vi.hoisted(() => ({
  finalize: vi.fn<typeof finalizeScheduledReport>(),
  release: vi.fn<typeof releaseScheduledReport>(),
}));
const completionCapture = vi.hoisted(() => ({
  request: vi.fn<(callId: string, turnId: string, stepIndex: number) => void>(),
}));
vi.mock("@/agent/lib/message-delivery", async (importOriginal) => ({
  ...(await importOriginal()),
  requestFinalDeliveryCompletion: completionCapture.request,
}));
vi.mock("@/db/services/scheduled-agent-jobs", () => ({
  finalizeScheduledReport: scheduleDeliveryCapture.finalize,
  releaseScheduledReport: scheduleDeliveryCapture.release,
}));
vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof EnvModule>();
  return {
    ...original,
    env: { ...original.env, LINQ_CONNECTOR: "linq/test" },
  };
});
vi.mock("@vercel/connect/eve", () => ({
  connectLinqCredentials: () => ({
    apiKey: linqChannelCapture.resolveApiKey,
    webhookVerifier: vi.fn<() => true>(),
  }),
}));
vi.mock("@chat-adapter/state-pg", () => ({
  createPostgresState: () => ({
    connect: linqChannelCapture.connectState,
    delete: linqChannelCapture.deleteState,
    get: linqChannelCapture.getState,
    set: linqChannelCapture.setState,
  }),
}));
vi.mock("@linqapp/sdk", () => ({
  LinqAPIV3: class {
    constructor(options: Pick<LinqAPIV3, "apiKey">) {
      linqChannelCapture.clientApiKeys.push(options.apiKey);
    }

    chats = {
      messages: { send: linqChannelCapture.sendNativeMessage },
    };
  },
}));
vi.mock("@/db/services/browser-images", () => ({
  async readReadyBrowserImageArtifact(
    scope: AccessScope,
    id: string,
    options: { readonly rootSessionId: string; readonly signal?: AbortSignal }
  ) {
    const image = await linqChannelCapture.readImage(scope, id, options);
    if (!image) return undefined;
    linqChannelCapture.images.set(id, image);
    return {
      byteSize: image.bytes.byteLength,
      contentHash:
        image.bytes[0] === 1
          ? "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81"
          : "787c798e39a5bc1910355bae6d0cd87a36b2e10fd0202a83e3bb6b005da83472",
      filename: image.filename,
      id,
      mediaType: image.mediaType,
      storagePathname: id,
    };
  },
}));
vi.mock("@vercel/blob", async (importOriginal) => {
  const blob = await importOriginal<typeof Blob>();
  return {
    ...blob,
    async get(pathname: string) {
      const image = linqChannelCapture.images.get(pathname);
      if (!image) return null;
      return {
        blob: { contentType: image.mediaType, size: image.bytes.byteLength },
        statusCode: 200,
        stream: new Response(Buffer.from(image.bytes)).body,
      };
    },
  };
});
/**
 * A faithful in-memory replica of `db/services/completion-report-attempts.ts`,
 * standing in for Postgres so this suite can observe real claim/attempt/accept
 * transitions without a database. Real contention and restart behaviour is
 * covered in `tests/integration/real-postgres.test.ts`; what this proves is
 * that the channel calls the real seam correctly against actual Linq
 * provider-call counts.
 */
interface StoredReportPart {
  id: string;
  state: "claimed" | "attempted" | "accepted" | "unconfirmed";
  leaseOwner: string;
  version: number;
  providerHandle: string | null;
  leaseExpiresAt: Date;
}
interface ReportPartKey {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly cohortId: string;
  readonly reportRevision: number;
  readonly part: string;
}
function reportPartKeyOf(key: ReportPartKey) {
  return JSON.stringify([
    key.workspaceId,
    key.rootSessionId,
    key.cohortId,
    key.reportRevision,
    key.part,
  ]);
}
function projectReportPart(row: StoredReportPart) {
  return {
    id: row.id,
    leaseOwner: row.leaseOwner,
    providerHandle: row.providerHandle,
    state: row.state,
    version: row.version,
  };
}
function requireReportPart(
  row: StoredReportPart | undefined
): StoredReportPart {
  if (!row) throw new Error("Synthetic report attempt is missing.");
  return row;
}

const reportAttempts = vi.hoisted(() => {
  const durable = new Map<string, StoredReportPart>();
  const byId = (id: string) => {
    for (const row of durable.values()) if (row.id === id) return row;
    return undefined;
  };
  return {
    durable,
    claimCompletionReportPart: (input: {
      key: ReportPartKey;
      id: string;
      leaseOwner: string;
      leaseExpiresAt: Date;
      now?: Date;
    }) => {
      const now = input.now ?? new Date();
      const existing = durable.get(reportPartKeyOf(input.key));
      if (!existing) {
        const created: StoredReportPart = {
          id: input.id,
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          providerHandle: null,
          state: "claimed",
          version: 1,
        };
        durable.set(reportPartKeyOf(input.key), created);
        return Promise.resolve({
          claim: projectReportPart(created),
          kind: "claimed",
        });
      }
      if (existing.state === "accepted")
        return Promise.resolve({
          claim: projectReportPart(existing),
          kind: "settled",
        });
      if (existing.state === "attempted" || existing.state === "unconfirmed")
        return Promise.resolve({
          claim: projectReportPart(existing),
          kind: "uncertain",
        });
      if (existing.leaseExpiresAt > now)
        return Promise.resolve({
          claim: projectReportPart(existing),
          kind: "uncertain",
        });
      existing.leaseExpiresAt = input.leaseExpiresAt;
      existing.leaseOwner = input.leaseOwner;
      existing.version += 1;
      return Promise.resolve({
        claim: projectReportPart(existing),
        kind: "claimed",
      });
    },
    markProviderAttempted: (input: {
      id: string;
      leaseOwner: string;
      version: number;
    }) => {
      const row = byId(input.id);
      if (
        row?.state !== "claimed" ||
        row.leaseOwner !== input.leaseOwner ||
        row.version !== input.version
      )
        return Promise.resolve(undefined);
      row.state = "attempted";
      row.version += 1;
      return Promise.resolve(projectReportPart(row));
    },
    markAccepted: (input: {
      id: string;
      leaseOwner: string;
      version: number;
      providerHandle?: string;
    }) => {
      const row = byId(input.id);
      if (
        row?.state !== "attempted" ||
        row.leaseOwner !== input.leaseOwner ||
        row.version !== input.version
      )
        return Promise.resolve(undefined);
      row.state = "accepted";
      row.version += 1;
      if (input.providerHandle !== undefined)
        row.providerHandle = input.providerHandle;
      return Promise.resolve(projectReportPart(row));
    },
    markUnconfirmed: (input: {
      id: string;
      leaseOwner: string;
      version: number;
    }) => {
      const row = byId(input.id);
      if (
        row?.state !== "attempted" ||
        row.leaseOwner !== input.leaseOwner ||
        row.version !== input.version
      )
        return Promise.resolve(undefined);
      row.state = "unconfirmed";
      row.version += 1;
      return Promise.resolve(projectReportPart(row));
    },
    claimCompletionReportBundle: (input: {
      workspaceId: string;
      rootSessionId: string;
      members: readonly { cohortId: string; reportRevision: number }[];
      physicalPart: string;
      leaseOwner: string;
      leaseExpiresAt: Date;
      now?: Date;
    }) => {
      const now = input.now ?? new Date();
      const entries = input.members.map((member) => {
        const key = { ...input, ...member, part: input.physicalPart };
        return { key, stored: durable.get(reportPartKeyOf(key)) };
      });
      if (entries.some((entry) => entry.stored)) {
        if (entries.every((entry) => entry.stored?.state === "accepted"))
          return Promise.resolve({
            claims: entries.map((entry) =>
              projectReportPart(requireReportPart(entry.stored))
            ),
            kind: "settled" as const,
          });
        if (
          entries.every(
            (entry) =>
              entry.stored?.state === "claimed" &&
              entry.stored.leaseExpiresAt <= now
          )
        ) {
          for (const entry of entries) {
            requireReportPart(entry.stored).leaseExpiresAt =
              input.leaseExpiresAt;
            requireReportPart(entry.stored).leaseOwner = input.leaseOwner;
            requireReportPart(entry.stored).version += 1;
          }
          return Promise.resolve({
            claims: entries.map((entry) =>
              projectReportPart(requireReportPart(entry.stored))
            ),
            kind: "claimed" as const,
          });
        }
        return Promise.resolve({
          claims: entries.flatMap((entry) =>
            entry.stored ? [projectReportPart(entry.stored)] : []
          ),
          kind: "uncertain" as const,
        });
      }
      const claims = entries.map((entry) => {
        const created: StoredReportPart = {
          id: reportPartKeyOf(entry.key),
          leaseExpiresAt: input.leaseExpiresAt,
          leaseOwner: input.leaseOwner,
          providerHandle: null,
          state: "claimed",
          version: 1,
        };
        durable.set(reportPartKeyOf(entry.key), created);
        return projectReportPart(created);
      });
      return Promise.resolve({ claims, kind: "claimed" as const });
    },
    markBundleProviderAttempted: (
      claims: readonly ReturnType<typeof projectReportPart>[]
    ) => {
      const rows = claims.map((claim) => byId(claim.id));
      if (
        rows.some(
          (row, index) =>
            row?.state !== "claimed" ||
            row.leaseOwner !== claims.at(index)?.leaseOwner ||
            row.version !== claims.at(index)?.version
        )
      )
        return Promise.resolve(undefined);
      for (const row of rows) {
        requireReportPart(row).state = "attempted";
        requireReportPart(row).version += 1;
      }
      return Promise.resolve(
        rows.map((row) => projectReportPart(requireReportPart(row)))
      );
    },
    markBundleAccepted: (input: {
      readonly claims: readonly ReturnType<typeof projectReportPart>[];
      readonly providerHandle?: string;
    }) => {
      const rows = input.claims.map((claim) => byId(claim.id));
      if (
        rows.some(
          (row, index) =>
            row?.state !== "attempted" ||
            row.leaseOwner !== input.claims.at(index)?.leaseOwner ||
            row.version !== input.claims.at(index)?.version
        )
      )
        return Promise.resolve(undefined);
      for (const row of rows) {
        requireReportPart(row).state = "accepted";
        requireReportPart(row).version += 1;
        if (input.providerHandle !== undefined)
          requireReportPart(row).providerHandle = input.providerHandle;
      }
      return Promise.resolve(
        rows.map((row) => projectReportPart(requireReportPart(row)))
      );
    },
    markBundleUnconfirmed: (
      claims: readonly ReturnType<typeof projectReportPart>[]
    ) => {
      const rows = claims.map((claim) => byId(claim.id));
      if (
        rows.some(
          (row, index) =>
            row?.state !== "attempted" ||
            row.leaseOwner !== claims.at(index)?.leaseOwner ||
            row.version !== claims.at(index)?.version
        )
      )
        return Promise.resolve(undefined);
      for (const row of rows) {
        requireReportPart(row).state = "unconfirmed";
        requireReportPart(row).version += 1;
      }
      return Promise.resolve(
        rows.map((row) => projectReportPart(requireReportPart(row)))
      );
    },
    reset: () => {
      durable.clear();
    },
  };
});
vi.mock("@/db/services/completion-report-attempts", () => ({
  claimCompletionReportBundle: reportAttempts.claimCompletionReportBundle,
  markBundleAccepted: reportAttempts.markBundleAccepted,
  markBundleProviderAttempted: reportAttempts.markBundleProviderAttempted,
  markBundleUnconfirmed: reportAttempts.markBundleUnconfirmed,
}));

const { linqChannelConfig } = await import("@/agent/channels/linq");
const handleActionResult = linqChannelConfig.events["action.result"];
const deliverInputRequest = linqChannelConfig.events["input.requested"];
const handleAuthorizationRequired =
  linqChannelConfig.events["authorization.required"];
const handleTurnFailed = linqChannelConfig.events["turn.failed"];

const {
  admitTask,
  beginCohortReport,
  cohortFor,
  recordTerminal,
  reportableCohorts,
} = await import("@/agent/lib/completion-obligations");
const { BudgetExceededError } = await import("@/db/services/usage");

/**
 * Binds the completion-report obligation for one turn/call, the way the
 * `send_message` tool does in production, without going through the tool: an
 * admitted, terminal, must-report cohort is what makes `reportPartIdentityFor`
 * resolve an identity for this exact turn and call.
 */
function bindReportObligation(turnId: string, callId: string) {
  const cohortId = `cohort-${turnId}`;
  admitTask({
    objectiveRevision: `objective-${turnId}`,
    parentTurnId: cohortId,
    taskId: `task-${callId}`,
  });
  recordTerminal(
    {
      childSessionId: `${callId}-worker-session`,
      parentTurnId: cohortId,
      status: "completed",
      taskId: `task-${callId}`,
      workerName: "worker",
    },
    [{ claim: "The worker finished.", evidence: "observed" }]
  );
  beginCohortReport(cohortId, { callId, turnId });
  return cohortId;
}

type ActionHandlerParameters = Parameters<typeof handleActionResult>;

interface LinqTestMessage {
  readonly attachments?: readonly {
    readonly mimeType?: string;
    readonly name?: string;
    readonly type: "audio" | "file" | "image" | "video";
    readonly url: string;
  }[];
  readonly files?: readonly {
    readonly data: Buffer;
    readonly filename: string;
    readonly mimeType: string;
  }[];
  readonly raw: string;
}

describe("Linq message delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const reset of deliveryStateFixture.resets) reset();
    reportAttempts.reset();
    linqChannelCapture.connectState.mockResolvedValue(undefined);
    linqChannelCapture.deleteState.mockResolvedValue(undefined);
    linqChannelCapture.getState.mockResolvedValue(null);
    linqChannelCapture.setState.mockResolvedValue(undefined);
    usageCapture.recordUsageEvent.mockResolvedValue(undefined);
    budget.check.mockResolvedValue(undefined);
    scheduleDeliveryCapture.finalize.mockResolvedValue(true);
    scheduleDeliveryCapture.release.mockResolvedValue(true);
    completionCapture.request.mockReset();
  });

  it.each([false, true])(
    "closes final delivery only after Linq accepts it (failure=%s)",
    async (failed) => {
      const resolverContext = {
        channel: { kind: "channel:linq" },
        session: { id: "root", auth: { current: null, initiator: null } },
        messages: [],
      };
      const event = { data: { stepIndex: 0, turnId: "turn-1" } };
      const tools = await messaging.events["step.started"]?.(
        event,
        resolverContext
      );
      if (!tools) throw new Error("Missing messaging tools");
      const base = toolContextFor({
        sessionId: "root",
        callId: "call-send-message",
      });
      const output = sendMessageOutputSchema.parse(
        await tools.send_message.execute(
          { kind: "message", text: "Result", final: true },
          {
            ...base,
            session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
          }
        )
      );
      await expect(
        Promise.resolve().then(() =>
          tools.send_message.execute(
            { kind: "message", text: "Duplicate" },
            {
              ...base,
              session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
            }
          )
        )
      ).rejects.toThrow(/awaiting channel confirmation/iu);
      const { context, post } = handlerContext();
      if (failed)
        post.mockRejectedValueOnce(new Error("Provider rejected the request"));
      const delivery = handleActionResult(
        sendMessageResult(output),
        context,
        sessionContext()
      );
      const rejected = await delivery.then(
        () => false,
        () => true
      );
      expect(rejected).toBe(failed);
      const nextTools = await messaging.events["step.started"]?.(
        event,
        resolverContext
      );
      expect(nextTools).toBeNull();
      const retryAllowed = await Promise.resolve()
        .then(() =>
          tools.send_message.execute(
            {
              kind: "message",
              text: "Explicitly requested retry",
              final: true,
            },
            {
              ...base,
              callId: "retry-call",
              session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
            }
          )
        )
        .then(
          () => true,
          () => false
        );
      expect(retryAllowed).toBe(false);
      expect(post).toHaveBeenCalledTimes(1);
      expect(output).not.toHaveProperty("final");
      expect(completionCapture.request.mock.calls).toEqual(
        failed ? [] : [["call-send-message", "turn-1", 0]]
      );
    }
  );

  it("waits for provider acceptance before requesting interactive completion", async () => {
    let releaseProvider!: () => void;
    const providerAccepted = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const { context, post } = handlerContext();
    post.mockImplementationOnce(async () => {
      await providerAccepted;
      return { id: "posted-message" };
    });
    const resolverContext = {
      channel: { kind: "channel:linq" },
      session: { id: "root", auth: { current: null, initiator: null } },
      messages: [],
    };
    const tools = await messaging.events["step.started"]?.(
      { data: { stepIndex: 0, turnId: "turn-1" } },
      resolverContext
    );
    if (!tools) throw new Error("Missing messaging tools");
    const base = toolContextFor({
      sessionId: "root",
      callId: "call-send-message",
    });
    const output = sendMessageOutputSchema.parse(
      await tools.send_message.execute(
        { kind: "message", text: "Result", final: true },
        {
          ...base,
          session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
        }
      )
    );
    const delivery = handleActionResult(
      sendMessageResult(output),
      context,
      sessionContext()
    );
    await Promise.resolve();
    expect(completionCapture.request).not.toHaveBeenCalled();
    releaseProvider();
    await delivery;
    expect(completionCapture.request).toHaveBeenCalledExactlyOnceWith(
      "call-send-message",
      "turn-1",
      0
    );
  });

  it("does not request completion when scheduled bookkeeping fails after acceptance", async () => {
    const { context } = handlerContext();
    scheduleDeliveryCapture.finalize.mockRejectedValueOnce(
      new Error("bookkeeping failed")
    );
    await expect(
      handleActionResult(
        sendMessageResult({ kind: "message", text: "Result" }),
        context,
        sessionContext("scheduled-result")
      )
    ).rejects.toThrow("bookkeeping failed");
    expect(linqChannelCapture.postMessage).toHaveBeenCalledOnce();
    expect(completionCapture.request).not.toHaveBeenCalled();
  });

  it("surfaces a later final delivery failure after an earlier progress post", async () => {
    const { context, post } = handlerContext();
    post.mockResolvedValueOnce({ id: "progress-message" });
    post.mockRejectedValueOnce(new Error("Provider rejected final message"));
    const resolverContext = {
      channel: { kind: "channel:linq" },
      session: { id: "root", auth: { current: null, initiator: null } },
      messages: [],
    };
    const tools = await messaging.events["step.started"]?.(
      { data: { stepIndex: 0, turnId: "turn-1" } },
      resolverContext
    );
    if (!tools) throw new Error("Missing messaging tools");
    const base = toolContextFor({
      sessionId: "root",
      callId: "call-send-message",
    });
    const progress = sendMessageOutputSchema.parse(
      await tools.send_message.execute(
        { kind: "message", text: "Progress" },
        {
          ...base,
          session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
        }
      )
    );
    await handleActionResult(
      sendMessageResult(progress),
      context,
      sessionContext()
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(completionCapture.request).toHaveBeenCalledExactlyOnceWith(
      "call-send-message",
      "turn-1",
      0
    );
    completionCapture.request.mockClear();

    const final = sendMessageOutputSchema.parse(
      await tools.send_message.execute(
        {
          final: true,
          kind: "message",
          text: "Paragraph one.\n\nParagraph two.",
        },
        {
          ...base,
          session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
        }
      )
    );
    await expect(
      handleActionResult(sendMessageResult(final), context, sessionContext())
    ).rejects.toThrow("Provider rejected final message");
    expect(post).toHaveBeenCalledTimes(2);
    expect(completionCapture.request).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "closes a reaction-only reply only after Linq accepts it (failure=%s)",
    async (failed) => {
      const resolverContext = {
        channel: { kind: "channel:linq" },
        session: { id: "root", auth: { current: null, initiator: null } },
        messages: [],
      };
      const event = { data: { stepIndex: 0, turnId: "turn-1" } };
      const tools = dynamicToolSetSchema.parse(
        await messaging.events["step.started"]?.(event, resolverContext)
      );
      const reactionTool = tools.react_to_message;
      if (!reactionTool) {
        throw new Error("Missing reaction tool");
      }
      const base = toolContextFor({
        sessionId: "root",
        callId: "call-react-to-message",
      });
      const output = reactToMessageOutputSchema.parse(
        await reactionTool.execute(
          { operation: "add", type: "heart" },
          {
            ...base,
            session: {
              ...base.session,
              turn: { id: "turn-1", sequence: 0 },
            },
          }
        )
      );
      const { addReaction, context } = handlerContext();
      if (failed)
        addReaction.mockRejectedValueOnce(
          new Error("Provider rejected the reaction")
        );
      const rejected = await handleActionResult(
        reactToMessageResult(output),
        context,
        sessionContext()
      ).then(
        () => false,
        () => true
      );
      expect(rejected).toBe(failed);
      const nextTools = await messaging.events["step.started"]?.(
        event,
        resolverContext
      );
      expect(nextTools).toBeNull();
      await expect(
        Promise.resolve().then(() =>
          reactionTool.execute(
            { operation: "add", type: "heart" },
            {
              ...base,
              callId: "retry-reaction-call",
              session: {
                ...base.session,
                turn: { id: "turn-1", sequence: 0 },
              },
            }
          )
        )
      ).rejects.toThrow(
        /already.*final|final.*already|not confirmed|do not resend/iu
      );
      expect(completionCapture.request).toHaveBeenCalledTimes(failed ? 0 : 1);
    }
  );

  it("completes an Eve reaction without leaving delivery pending", async () => {
    const resolverContext = {
      channel: { kind: "channel:eve" },
      session: { id: "root", auth: { current: null, initiator: null } },
      messages: [],
    };
    const event = { data: { stepIndex: 0, turnId: "turn-1" } };
    const tools = dynamicToolSetSchema.parse(
      await messaging.events["step.started"]?.(event, resolverContext)
    );
    const reactionTool = tools.react_to_message;
    if (!reactionTool) {
      throw new Error("Missing Eve reaction tool");
    }
    const base = toolContextFor({
      sessionId: "root",
      callId: "call-react-to-message",
    });
    await reactionTool.execute(
      { operation: "add", type: "heart" },
      {
        ...base,
        session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
      }
    );

    expect(
      await messaging.events["step.started"]?.(event, resolverContext)
    ).toBeNull();
  });

  defineMessagingProviderContract("Linq", () => ({
    async addReaction() {
      const { addReaction, context, post } = handlerContext();
      await handleActionResult(
        reactToMessageResult({ operation: "add", type: "heart" }),
        context,
        sessionContext()
      );
      return {
        messageCount: post.mock.calls.length,
        reactionCount: addReaction.mock.calls.length,
      };
    },
    async requestApproval(toolName) {
      const { context, post } = handlerContext();
      await deliverInputRequest(
        inputRequestEvent([
          {
            action: {
              callId: "call-provider-contract",
              input: {},
              kind: "tool-call",
              toolName,
            },
            allowFreeform: false,
            display: "confirmation",
            kind: "tool-approval",
            options: [
              { id: "approve", label: "Approve" },
              { id: "cancel", label: "Cancel" },
            ],
            prompt: `Approve tool call: ${toolName}`,
            requestId: "provider-contract-approval",
          },
        ]),
        context,
        sessionContext()
      );
      return post.mock.calls[0]?.[0].raw ?? "";
    },
    async sendImage(url) {
      const { context, post } = handlerContext();
      await handleActionResult(
        sendMessageResult({
          attachments: [{ kind: "image", url }],
          kind: "message",
        }),
        context,
        sessionContext()
      );
      return {
        attachmentUrls:
          post.mock.calls[0]?.[0].attachments?.map(
            (attachment) => attachment.url
          ) ?? [],
        messageCount: post.mock.calls.length,
      };
    },
    async sendText(text) {
      const { context, post } = handlerContext();
      await handleActionResult(
        sendMessageResult({ kind: "message", text }),
        context,
        sessionContext()
      );
      return {
        messageCount: post.mock.calls.length,
        text: post.mock.calls[0]?.[0].raw ?? "",
      };
    },
  }));

  it("renders every tool approval without exposing tool internals", async () => {
    expect(deliverInputRequest).toBeTypeOf("function");
    const { context, post } = handlerContext();

    await deliverInputRequest(
      inputRequestEvent([
        {
          action: {
            callId: "call-google-write",
            input: {
              attendees: ["recipient@example.com"],
              start: "2026-09-05T14:00:00-04:00",
              title: "Planning",
            },
            kind: "tool-call",
            toolName: "calendar-create-event",
          },
          allowFreeform: false,
          display: "confirmation",
          kind: "tool-approval",
          options: [
            { id: "approve", label: "Approve" },
            { id: "cancel", label: "Cancel" },
          ],
          prompt: "Approve tool call: calendar-create-event",
          requestId: "approval-1",
        },
      ]),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: "Ready for me to do that?\n\nReply naturally—“yes,” “go ahead,” or “cancel.”",
    });
    expect(linqChannelCapture.connectState).toHaveBeenCalledOnce();
    expect(linqChannelCapture.setState).toHaveBeenCalledExactlyOnceWith(
      "pending-input:linq:dm:chat-1",
      {
        requests: [
          {
            allowFreeform: false,
            kind: "tool-approval",
            options: [
              { id: "approve", label: "Approve" },
              { id: "cancel", label: "Cancel" },
            ],
            requestId: "approval-1",
          },
        ],
        workspaceId: "workspace-1",
      },
      86_400_000
    );
  });

  it("posts the Google sign-in URL as a direct connection prompt", async () => {
    expect(handleAuthorizationRequired).toBeTypeOf("function");
    const { context, post } = handlerContext();

    await handleAuthorizationRequired(
      {
        authorization: {
          displayName: "Google",
          instructions: "Connect Google to continue.",
          url: "https://accounts.google.test/authorize",
        },
        description: "Google authorization",
        name: "google",
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-1",
      },
      context
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: "Connect Google to continue:\nhttps://accounts.google.test/authorize",
    });
  });

  it("keeps selectable and freeform questions usable over text", async () => {
    expect(deliverInputRequest).toBeTypeOf("function");
    const { context, post } = handlerContext();

    await deliverInputRequest(
      inputRequestEvent([
        {
          action: {
            callId: "call-question-1",
            input: {},
            kind: "tool-call",
            toolName: "ask_question",
          },
          allowFreeform: false,
          display: "select",
          kind: "question",
          options: [
            { id: "morning", label: "Morning" },
            { id: "afternoon", label: "Afternoon" },
          ],
          prompt: "What time works?",
          requestId: "question-1",
        },
        {
          action: {
            callId: "call-question-2",
            input: {},
            kind: "tool-call",
            toolName: "ask_question",
          },
          allowFreeform: true,
          display: "text",
          kind: "question",
          prompt: "What should the note say?",
          requestId: "question-2",
        },
      ]),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: [
        "What time works?",
        "1. Morning\n2. Afternoon",
        "Reply with an option label or number.",
        "What should the note say?",
        "Reply with your answer.",
      ].join("\n\n"),
    });
  });

  it("does not register automatic assistant text posting", () => {
    expect(linqChannelConfig.events["message.completed"]).toBeTypeOf(
      "function"
    );
  });

  it("posts one static notice when an ordinary turn fails", async () => {
    const { context, post } = handlerContext();

    await handleTurnFailed(
      {
        code: "provider_error",
        details: { provider: "upstream", model: "sensitive-model" },
        message: "402 insufficient funds for model sensitive-model",
        sequence: 0,
        turnId: "turn-1",
      },
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: "I couldn’t complete that request because of a service error. Please try again later.",
    });
    expect(JSON.stringify(post.mock.calls)).not.toContain("sensitive-model");
    expect(JSON.stringify(post.mock.calls)).not.toContain("insufficient funds");

    await handleActionResult(
      sendMessageResult({ kind: "message", text: "The retry succeeded." }),
      context,
      sessionContext()
    );
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(2, {
      raw: "The retry succeeded.",
    });
  });

  it("does not post a failure notice after final delivery completes", async () => {
    const { context, post } = handlerContext();
    const resolverContext = {
      channel: { kind: "channel:linq" },
      session: { id: "root", auth: { current: null, initiator: null } },
      messages: [],
    };
    const tools = await messaging.events["step.started"]?.(
      { data: { stepIndex: 0, turnId: "turn-1" } },
      resolverContext
    );
    if (!tools) throw new Error("Missing messaging tools");
    const base = toolContextFor({
      sessionId: "root",
      callId: "call-send-message",
    });
    const output = sendMessageOutputSchema.parse(
      await tools.send_message.execute(
        { kind: "message", text: "The order is ready.", final: true },
        {
          ...base,
          session: { ...base.session, turn: { id: "turn-1", sequence: 0 } },
        }
      )
    );

    await handleActionResult(
      sendMessageResult(output),
      context,
      sessionContext()
    );
    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: "The order is ready.",
    });

    await handleTurnFailed(
      {
        code: "model_call_failed",
        message: "Gateway stream timeout",
        sequence: 0,
        turnId: "turn-1",
      },
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: "The order is ready.",
    });
  });

  it("releases a scheduled failure without posting an unsolicited notice", async () => {
    const { context, post } = handlerContext();
    const event = {
      code: "provider_error",
      message: "402 insufficient funds for model sensitive-model",
      sequence: 0,
      turnId: "turn-1",
    };

    await handleTurnFailed(event, context, sessionContext("scheduled-result"));

    expect(scheduleDeliveryCapture.release).toHaveBeenCalledExactlyOnceWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      event.message
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("does not post or throw when a failed turn has no thread", async () => {
    const { context, post } = handlerContext(undefined, false);

    await expect(
      handleTurnFailed(
        {
          code: "provider_error",
          message: "provider detail",
          sequence: 0,
          turnId: "turn-1",
        },
        context,
        sessionContext()
      )
    ).resolves.toBeUndefined();

    expect(scheduleDeliveryCapture.release).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts send_message output as raw iMessage text", async () => {
    const message = [
      "Still blocked. No order was submitted.",
      "The order remains unchanged:",
      "Spider-Man: Brand New Day",
      "$15.00 total",
    ].join("\n");
    const { context, post } = handlerContext();

    await handleActionResult(
      sendMessageResult({ kind: "message", text: message }),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({ raw: message });
  });

  it("finalizes a scheduled result after send_message posts it", async () => {
    const { context } = handlerContext();

    await handleActionResult(
      sendMessageResult({ kind: "message", text: "The price fell." }),
      context,
      sessionContext("scheduled-result")
    );

    expect(scheduleDeliveryCapture.finalize).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      "delivered"
    );
    expect(linqChannelCapture.postMessage).toHaveBeenCalledExactlyOnceWith(
      "linq:dm:chat-1",
      { raw: "The price fell." },
      {
        idempotencyKey:
          "scheduled-report:00000000-0000-4000-8000-000000000002:1",
      }
    );
    expect(completionCapture.request).not.toHaveBeenCalled();
  });

  it("does not finalize a rejected scheduled delivery and retries with its key", async () => {
    const { context } = handlerContext();
    const event = sendMessageResult({
      kind: "message",
      text: "The price fell.",
    });
    linqChannelCapture.postMessage.mockRejectedValueOnce(
      new Error("Provider rejected the report")
    );

    await expect(
      handleActionResult(event, context, sessionContext("scheduled-result"))
    ).rejects.toThrow("Provider rejected the report");
    expect(scheduleDeliveryCapture.finalize).not.toHaveBeenCalled();
    expect(completionCapture.request).not.toHaveBeenCalled();

    await handleActionResult(
      event,
      context,
      sessionContext("scheduled-result")
    );
    expect(linqChannelCapture.postMessage).toHaveBeenCalledTimes(2);
    expect(linqChannelCapture.postMessage.mock.calls[0]?.[2]).toEqual(
      linqChannelCapture.postMessage.mock.calls[1]?.[2]
    );
    expect(scheduleDeliveryCapture.finalize).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      "delivered"
    );
    expect(completionCapture.request).not.toHaveBeenCalled();
  });

  it("uses the same Linq idempotency key when a report turn is retried", async () => {
    const { context } = handlerContext();
    const event = sendMessageResult({
      kind: "message",
      text: "The price fell.",
    });

    await handleActionResult(
      event,
      context,
      sessionContext("scheduled-result")
    );
    await handleActionResult(
      event,
      context,
      sessionContext("scheduled-result")
    );

    expect(linqChannelCapture.postMessage).toHaveBeenCalledTimes(2);
    expect(linqChannelCapture.postMessage.mock.calls[0]?.[2]).toEqual(
      linqChannelCapture.postMessage.mock.calls[1]?.[2]
    );
  });

  it("posts one native rich link preview per call with fresh credentials", async () => {
    const { context, post } = handlerContext();
    linqChannelCapture.clientApiKeys.length = 0;
    linqChannelCapture.resolveApiKey
      .mockResolvedValueOnce("linq-api-key-1")
      .mockResolvedValueOnce("linq-api-key-2");

    await handleActionResult(
      sendMessageResult({ kind: "link", url: "https://example.com/first" }),
      context,
      sessionContext()
    );
    await handleActionResult(
      sendMessageResult({ kind: "link", url: "https://example.com/second" }),
      context,
      sessionContext()
    );

    expect(linqChannelCapture.resolveApiKey).toHaveBeenCalledTimes(2);
    expect(linqChannelCapture.clientApiKeys).toEqual([
      "linq-api-key-1",
      "linq-api-key-2",
    ]);
    expect(linqChannelCapture.sendNativeMessage).toHaveBeenNthCalledWith(
      1,
      "chat-1",
      {
        message: {
          parts: [{ type: "link", value: "https://example.com/first" }],
        },
      },
      undefined
    );
    expect(linqChannelCapture.sendNativeMessage).toHaveBeenNthCalledWith(
      2,
      "chat-1",
      {
        message: {
          parts: [{ type: "link", value: "https://example.com/second" }],
        },
      },
      undefined
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("requires a native link preview to be its own send_message call", () => {
    expect(
      sendMessageOutputSchema.safeParse({
        kind: "link",
        text: "Read this",
        url: "https://example.com/article",
      }).success
    ).toBe(false);
  });

  it("discriminates native links from message content", () => {
    expect(
      sendMessageOutputSchema.safeParse({
        attachments: [{ kind: "image", url: "https://example.com/image.png" }],
        kind: "message",
        text: "A caption",
      }).success
    ).toBe(true);
    expect(sendMessageOutputSchema.safeParse({ kind: "message" }).success).toBe(
      false
    );
    expect(
      sendMessageOutputSchema.safeParse({
        kind: "message",
        text: "Read this",
        url: "https://example.com/article",
      }).success
    ).toBe(false);
    expect(
      sendMessageOutputSchema.safeParse({
        link: "https://example.com/article",
      }).success
    ).toBe(false);
  });

  it("enforces Linq's native link URL constraints", () => {
    const prefix = "https://example.com/";
    const maximumLengthLink = `${prefix}${"a".repeat(2048 - prefix.length)}`;

    expect(
      sendMessageOutputSchema.safeParse({
        kind: "link",
        url: maximumLengthLink,
      }).success
    ).toBe(true);
    expect(
      sendMessageOutputSchema.safeParse({
        kind: "link",
        url: `${maximumLengthLink}a`,
      }).success
    ).toBe(false);
    expect(
      sendMessageOutputSchema.safeParse({
        kind: "link",
        url: "http://example.com/article",
      }).success
    ).toBe(false);
  });

  it("posts a proactive message without a current inbound message", async () => {
    const { context, post } = handlerContext(undefined);

    await handleActionResult(
      sendMessageResult({
        kind: "message",
        text: "Your weekly summary is ready.",
      }),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      raw: "Your weekly summary is ready.",
    });
  });

  it.each([
    ["image", "image/jpeg", "photo.jpg"],
    ["video", "video/mp4", "clip.mp4"],
    ["audio", "audio/mpeg", "voice.mp3"],
    ["file", "application/pdf", "brief.pdf"],
  ] as const)("posts a native %s attachment", async (kind, mimeType, name) => {
    const { context, post } = handlerContext();
    const url = `https://media.example/${name}`;

    await handleActionResult(
      sendMessageResult({
        attachments: [{ kind, mimeType, name, url }],
        kind: "message",
      }),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      attachments: [{ mimeType, name, type: kind, url }],
      raw: "",
    });
  });

  it("replaces scoped artifact markdown with native iMessage files", async () => {
    const artifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";
    linqChannelCapture.readImage.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "product.png",
      id: artifactId,
      mediaType: "image/png",
    });
    const { context, post } = handlerContext();

    await handleActionResult(
      sendMessageResult({
        kind: "message",
        text: `Here it is.\n\n![Product](/artifacts/${artifactId})`,
      }),
      context,
      sessionContext()
    );

    expect(linqChannelCapture.readImage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
      artifactId,
      { rootSessionId: "session-1", signal: undefined }
    );
    expect(post).toHaveBeenCalledExactlyOnceWith({
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "product.png",
          mimeType: "image/png",
        },
      ],
      raw: "Here it is.",
    });
  });

  it("loads scheduled artifacts from the scheduled-run session", async () => {
    const artifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";
    linqChannelCapture.readImage.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "scheduled-product.png",
      id: artifactId,
      mediaType: "image/png",
    });
    const { context } = handlerContext();

    await handleActionResult(
      sendMessageResult({
        kind: "message",
        text: `Price changed.\n\n![Product](/artifacts/${artifactId})`,
      }),
      context,
      sessionContext("scheduled-result")
    );

    expect(linqChannelCapture.readImage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
      artifactId,
      { rootSessionId: "scheduled-run-session", signal: undefined }
    );
    expect(linqChannelCapture.postMessage).toHaveBeenCalledWith(
      "linq:dm:chat-1",
      expect.objectContaining({
        files: [expect.objectContaining({ filename: "scheduled-product.png" })],
        raw: "Price changed.",
      }),
      expect.objectContaining({
        idempotencyKey:
          "scheduled-report:00000000-0000-4000-8000-000000000002:1",
      })
    );
  });

  it("sends multiple artifact images as one native attachment gallery", async () => {
    const firstArtifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";
    const secondArtifactId = "206c3a7e-c0b8-4317-9e34-552cff646673";
    linqChannelCapture.readImage.mockImplementation(
      async (_scope, artifactId) => ({
        bytes: new Uint8Array(
          artifactId === firstArtifactId ? [1, 2, 3] : [4, 5, 6]
        ),
        filename: artifactId === firstArtifactId ? "first.png" : "second.png",
        id: artifactId,
        mediaType: "image/png",
      })
    );
    const { context, post } = handlerContext();

    await handleActionResult(
      sendMessageResult({
        kind: "message",
        text: [
          "Two good options.",
          `![First](/artifacts/${firstArtifactId})`,
          `![Second](/artifacts/${secondArtifactId})`,
        ].join("\n"),
      }),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "first.png",
          mimeType: "image/png",
        },
        {
          data: Buffer.from([4, 5, 6]),
          filename: "second.png",
          mimeType: "image/png",
        },
      ],
      raw: "Two good options.",
    });
  });

  it("keeps one send_message call in one bubble with its images", async () => {
    const artifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";
    linqChannelCapture.readImage.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "product.png",
      id: artifactId,
      mediaType: "image/png",
    });
    const { context, post } = handlerContext();

    await handleActionResult(
      sendMessageResult({
        kind: "message",
        text: `First thought.\n\nSecond thought.\n\n![Product](/artifacts/${artifactId})`,
      }),
      context,
      sessionContext()
    );

    expect(post).toHaveBeenCalledExactlyOnceWith({
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "product.png",
          mimeType: "image/png",
        },
      ],
      raw: "First thought.\n\nSecond thought.",
    });
  });

  it.each([
    "thumbs_up",
    "thumbs_down",
    "heart",
    "laugh",
    "exclamation",
    "question",
  ] as const)("adds the native %s Tapback", async (type) => {
    const { addReaction, context, post } = handlerContext();

    await handleActionResult(
      reactToMessageResult({ operation: "add", type }),
      context,
      sessionContext()
    );

    expect(addReaction).toHaveBeenCalledExactlyOnceWith(
      "linq:dm:chat-1",
      "message-1",
      type
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("removes a native Tapback", async () => {
    const { context, post, removeReaction } = handlerContext();

    await handleActionResult(
      reactToMessageResult({ operation: "remove", type: "heart" }),
      context,
      sessionContext()
    );

    expect(removeReaction).toHaveBeenCalledExactlyOnceWith(
      "linq:dm:chat-1",
      "message-1",
      "heart"
    );
    expect(post).not.toHaveBeenCalled();
    expect(completionCapture.request).not.toHaveBeenCalled();
  });

  describe("completion report parts (#157)", () => {
    it("CS-01: an accepted text report claims once and dispatches once", async () => {
      bindReportObligation("turn-1", "call-send-message");
      const { context, post } = handlerContext();

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );

      expect(post).toHaveBeenCalledTimes(1);
      const claims = [...reportAttempts.durable.values()];
      expect(claims).toHaveLength(1);
      expect(claims[0]?.state).toBe("accepted");
    });

    it("CS-05b: a refused text part is not posted and not reported as delivered", async () => {
      // A previous owner already recorded an attempt for this exact part, so
      // permission comes back refused. Without a case here, removing the
      // channel's check on that refusal passes every other test.
      bindReportObligation("turn-1", "call-send-message");
      reportAttempts.durable.set(
        reportPartKeyOf({
          cohortId: "cohort-turn-1",
          part: "text",
          reportRevision: 0,
          rootSessionId: "session-1",
          workspaceId: "workspace-1",
        }),
        {
          id: "text-prior-attempt",
          leaseExpiresAt: new Date(Date.now() + 60_000),
          leaseOwner: "an-owner-that-crashed",
          providerHandle: null,
          state: "attempted",
          version: 2,
        }
      );
      const { context, post } = handlerContext();

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );

      // The message may already have reached the provider, so nothing is posted.
      expect(post).not.toHaveBeenCalled();
      // And the consequence that matters more: the turn is not completed as
      // though a report had gone out. Asserting only the absent post is not
      // enough, because the dispatch refuses itself inside postLinqReply -- it
      // is the caller's early return that stops delivery being declared done.
      expect(completionCapture.request).not.toHaveBeenCalled();
    });

    it("CS-13: a budget denial does not discharge the report it could not send", async () => {
      // The denial notice goes out through the same post callback as a real
      // message, which marks the send accepted. The outer handler then settles
      // the obligation as delivered in its `finally`, so the user receives a
      // usage-limit notice, the records are never sent, and nothing is owed any
      // more. A lost obligation is the one outcome this whole mechanism exists
      // to prevent.
      const cohortId = bindReportObligation("turn-1", "call-send-message");
      budget.check.mockRejectedValueOnce(
        new BudgetExceededError("provider_message", 10)
      );
      const { context, post } = handlerContext();

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );

      // The notice was posted, and the report was not.
      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0]?.[0]).toMatchObject({
        raw: "Workspace usage limit reached. Please try again later.",
      });
      // So the summary is still owed. It is not `unconfirmed`: that phase means a
      // send may have reached the user and must not be repeated, and here the
      // records provably did not go out -- nothing was even claimed, because the
      // budget check runs before the dispatch.
      expect(cohortFor(cohortId)?.phase).toBe("must_report");
      expect(reportableCohorts().map((cohort) => cohort.cohortId)).toEqual([
        cohortId,
      ]);
    });

    it("CS-14: a report a prior attempt already delivered settles as delivered, not unconfirmed", async () => {
      // A crashed step reruns after the provider accepted the report. The
      // dispatch correctly refuses to send it twice and reports that it already
      // went out, but the handler's `accepted` flag only moves when the post
      // callback runs -- so a report the records show was accepted was being
      // settled as never confirmed.
      const cohortId = bindReportObligation("turn-1", "call-send-message");
      reportAttempts.durable.set(
        reportPartKeyOf({
          cohortId,
          part: "text",
          reportRevision: 0,
          rootSessionId: "session-1",
          workspaceId: "workspace-1",
        }),
        {
          id: "text-prior-attempt",
          leaseExpiresAt: new Date(Date.now() + 60_000),
          leaseOwner: "an-owner-that-crashed",
          providerHandle: "provider-handle-1",
          state: "accepted",
          version: 3,
        }
      );
      const { context, post } = handlerContext();

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );

      // Not sent again: one report, one physical message.
      expect(post).not.toHaveBeenCalled();
      // And recorded as what it is. `unconfirmed` would leave the user's
      // delivered summary looking like one that may never have arrived.
      expect(cohortFor(cohortId)?.phase).toBe("delivered");
    });

    it("CS-15: a report already settled is not reopened by a later denial", async () => {
      // The two fixes above meet here. A step delivers the report and settles the
      // cohort, then reruns and is refused by the budget. Abandoning on that
      // refusal must not reach a cohort that is already done: the user would be
      // told about the same finished work a second time, with nothing to say it
      // was a repeat.
      const cohortId = bindReportObligation("turn-1", "call-send-message");
      const { context, post } = handlerContext();
      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );
      expect(post).toHaveBeenCalledTimes(1);
      expect(cohortFor(cohortId)?.phase).toBe("delivered");

      budget.check.mockRejectedValueOnce(
        new BudgetExceededError("provider_message", 10)
      );
      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        handlerContext().context,
        sessionContext()
      );

      expect(cohortFor(cohortId)?.phase).toBe("delivered");
      expect(reportableCohorts()).toEqual([]);
    });

    it("CS-12: a scheduled report is never bound to the durable claim", async () => {
      // Plan 007 step 4. A scheduled report has its own idempotency key, lease
      // and sequence; this record is for the interactive obligation only.
      bindReportObligation("turn-1", "call-send-message");
      const { context } = handlerContext();

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "Scheduled summary." }),
        context,
        sessionContext("scheduled-result")
      );

      // A scheduled report goes out through the channel's own idempotent path,
      // which is why it must not also take a durable report claim.
      expect(linqChannelCapture.postMessage).toHaveBeenCalledTimes(1);
      expect(reportAttempts.durable.size).toBe(0);
    });

    it("CS-04: a known pre-dispatch rejection leaves no attempted part and no provider call", async () => {
      bindReportObligation("turn-1", "call-send-message");
      const { context, post } = handlerContext(undefined, false);

      await expect(
        handleActionResult(
          sendMessageResult({ kind: "message", text: "All done." }),
          context,
          sessionContext()
        )
      ).rejects.toThrow(/active Linq conversation thread/iu);

      expect(reportAttempts.durable.size).toBe(0);
      expect(post).not.toHaveBeenCalled();
      expect(linqChannelCapture.postMessage).not.toHaveBeenCalled();
    });

    it("CS-05: a send that never confirms is left attempted and unconfirmed, with no retry", async () => {
      bindReportObligation("turn-1", "call-send-message");
      const { context, post } = handlerContext();
      post.mockRejectedValueOnce(new Error("timed out"));

      await expect(
        handleActionResult(
          sendMessageResult({ kind: "message", text: "All done." }),
          context,
          sessionContext()
        )
      ).rejects.toThrow("timed out");

      const [claim] = [...reportAttempts.durable.values()];
      expect(claim?.state).toBe("unconfirmed");
      expect(post).toHaveBeenCalledTimes(1);

      // A second delivery of the same event -- a replayed callback -- must not
      // call the provider again: the part is already terminal.
      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("CS-06: a replayed callback for an already-accepted report does not dispatch again", async () => {
      bindReportObligation("turn-1", "call-send-message");
      const { context, post } = handlerContext();

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );
      expect(post).toHaveBeenCalledTimes(1);

      await handleActionResult(
        sendMessageResult({ kind: "message", text: "All done." }),
        context,
        sessionContext()
      );
      expect(post).toHaveBeenCalledTimes(1);
    });
  });
});

function sendMessageResult(
  output: ActionHandlerParameters[0]["result"] extends { output: infer Output }
    ? Output
    : never
): ActionHandlerParameters[0] {
  return {
    result: {
      callId: "call-send-message",
      kind: "tool-result",
      output,
      toolName: "send_message",
    },
    sequence: 0,
    status: "completed",
    stepIndex: 0,
    turnId: "turn-1",
  };
}

function reactToMessageResult(
  output: ActionHandlerParameters[0]["result"] extends { output: infer Output }
    ? Output
    : never
): ActionHandlerParameters[0] {
  return {
    result: {
      callId: "call-react-to-message",
      kind: "tool-result",
      output,
      toolName: "react_to_message",
    },
    sequence: 0,
    status: "completed",
    stepIndex: 0,
    turnId: "turn-1",
  };
}

type InputRequestEvent = Parameters<NonNullable<typeof deliverInputRequest>>[0];

function inputRequestEvent(requests: InputRequestEvent["requests"]) {
  return { requests, sequence: 0, stepIndex: 0, turnId: "turn-1" };
}

function handlerContext(
  currentMessageId: string | undefined = "message-1",
  includeThread = true
) {
  const post =
    vi.fn<(message: LinqTestMessage) => Promise<{ readonly id: string }>>();
  post.mockResolvedValue({ id: "posted-message" });
  const addReaction = vi
    .fn<(threadId: string, messageId: string, emoji: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const removeReaction = vi
    .fn<(threadId: string, messageId: string, emoji: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const context = handlerEventContext({
    bot: {
      getAdapter: () => ({
        addReaction,
        decodeThreadId: () => ({ chatId: "chat-1", isGroup: false }),
        postMessage: linqChannelCapture.postMessage,
        removeReaction,
      }),
    },
    state: {},
    streaming: false,
    streamingEditIntervalMs: 1000,
    thread: includeThread
      ? {
          id: "linq:dm:chat-1",
          post,
          toJSON: () => ({
            _type: "chat:Thread",
            adapterName: "linq",
            channelId: "linq:dm:chat-1",
            currentMessage: currentMessageId
              ? { id: currentMessageId }
              : undefined,
            id: "linq:dm:chat-1",
            isDM: true,
          }),
        }
      : undefined,
  });

  return {
    addReaction,
    context,
    post,
    removeReaction,
  };
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This test adapter deliberately accepts a focused structural fixture.
function handlerEventContext(value: unknown): ActionHandlerParameters[1] {
  // SAFETY: Callers provide every Linq context field exercised by these focused handlers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A complete Chat SDK bot mock would add 97 unrelated methods.
  return value as ActionHandlerParameters[1];
}

function sessionContext(authenticator = "test") {
  const attributes: Record<string, string | readonly string[]> =
    authenticator === "scheduled-result"
      ? {
          scheduledReportLeaseToken: "00000000-0000-4000-8000-000000000004",
          scheduledReportSequence: "1",
          scheduledRunId: "00000000-0000-4000-8000-000000000002",
          scheduledRunSessionId: "scheduled-run-session",
          workspaceId: "workspace-1",
        }
      : { workspaceId: "workspace-1" };
  return {
    async getSandbox() {
      throw new Error("Sandbox access is outside this focused test.");
    },
    getSkill() {
      throw new Error("Skill access is outside this focused test.");
    },
    session: {
      auth: {
        current: {
          attributes,
          authenticator,
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
      turn: { id: "turn-1", sequence: 0 },
    },
  } satisfies ActionHandlerParameters[2];
}
