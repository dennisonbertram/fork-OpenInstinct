import { createRequire } from "node:module";
import type { Thread } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as ChannelOnboardingService from "@/db/services/channel-onboarding";
import { sendMessageOutputSchema } from "@/agent/lib/send-message";
import {
  beginFinalDelivery,
  finalDeliveryStatus,
  hasUnconfirmedProviderAttempt,
} from "@/agent/lib/message-delivery";
import messaging from "@/agent/tools/messaging";
import { toolContextFor } from "@/tests/helpers/tool-context";

// oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, vitest/require-mock-type-parameters -- adapter and Eve are owning boundaries; this suite uses only synthetic fixtures.

const capture = vi.hoisted(() => ({
  addReaction: vi.fn(),
  acquireLock: vi.fn(),
  claim: vi.fn(),
  createBinding: vi.fn(),
  decodeThreadId: vi.fn(),
  deleteState: vi.fn(),
  drainOnboarding: vi.fn(),
  enqueueOnboardingReply: vi.fn(),
  getOnboardingReplyDelivery: vi.fn(),
  extendLock: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  findIdentity: vi.fn(),
  findOne: vi.fn(),
  getState: vi.fn(),
  isChannelCommunicationStopped: vi.fn(),
  isTextOnboardingEnabled: vi.fn(),
  markRead: vi.fn(),
  mediaSend:
    vi.fn<
      (message: {
        readonly content?: string;
        readonly from_number: string;
        readonly media_url?: string;
        readonly number: string;
      }) => Promise<{ readonly message_handle?: string }>
    >(),
  post: vi.fn(),
  parseCommunicationCommand: vi.fn(),
  provisionChannelEnrollment: vi.fn(),
  recordChannelCommunicationStop: vi.fn(),
  recordChannelCommunicationStart: vi.fn(),
  resolveChannelEnrollment: vi.fn(),
  replayChannelOnboardingWelcome: vi.fn(),
  checkBudget: vi.fn(),
  convertHeicToJpeg: vi.fn<(bytes: Uint8Array) => Promise<Uint8Array | null>>(),
  recordUsageEvent: vi.fn(),
  prepareBrowserImageArtifactDelivery: vi.fn(),
  requestTurnCompletion: vi.fn(),
  BudgetExceededError: class BudgetExceededError extends Error {},
  resolveBinding: vi.fn(),
  resolveVerifiedBinding: vi.fn(),
  releaseLock: vi.fn(),
  send: vi.fn(),
  events: undefined as unknown,
  setState: vi.fn(),
  stateConnect: vi.fn(),
  verifier: vi.fn(),
}));

type DeliveryState =
  | { readonly callId: string; readonly turnId: string }
  | {
      readonly callId: string;
      readonly status: "pending" | "completed" | "unconfirmed";
      readonly turnId: string;
    }
  | null;

const deliveryState = vi.hoisted(() => {
  const initializers = new Map<string, () => DeliveryState>();
  const values = new Map<string, DeliveryState>();
  return {
    defineState: (name: string, initial: () => DeliveryState) => {
      initializers.set(name, initial);
      values.set(name, initial());
      return {
        get: () => values.get(name) ?? null,
        update: (updater: (current: DeliveryState) => DeliveryState) => {
          values.set(name, updater(values.get(name) ?? null));
        },
      };
    },
    reset: () => {
      for (const [name, initial] of initializers) {
        values.set(name, initial());
      }
    },
  };
});

vi.mock("eve/context", () => ({
  defineState: deliveryState.defineState,
  requestTurnCompletion: capture.requestTurnCompletion,
}));

vi.mock("@/env", () => ({
  betterAuthSecretSchema: z.string(),
  env: {
    BETTER_AUTH_URL: "https://app.example.test",
    DATABASE_URL: "postgres://synthetic",
    SENDBLUE_ACCOUNT_ID: "account@example.test",
    SENDBLUE_API_KEY_ID: "key",
    SENDBLUE_API_SECRET_KEY: "secret",
    SENDBLUE_CONVERSATIONS: "on",
    SENDBLUE_FROM_NUMBER: "+12025550123",
    SENDBLUE_TEXT_ONBOARDING_CARD_DELIVERY: "single_media",
    SENDBLUE_WEBHOOK_SECRET: "webhook-secret",
  },
  isSendblueTextOnboardingEnabled: capture.isTextOnboardingEnabled,
  secretEncryptionKeySchema: z.string(),
}));
vi.mock("@chat-adapter/state-pg", () => ({
  createPostgresState: () => ({
    connect: capture.stateConnect,
    acquireLock: capture.acquireLock,
    delete: capture.deleteState,
    extendLock: capture.extendLock,
    get: capture.getState,
    releaseLock: capture.releaseLock,
    set: capture.setState,
    setIfNotExists: capture.claim,
  }),
}));
vi.mock("chat-adapter-sendblue", () => ({
  createSendblueAdapter: () => ({
    addReaction: capture.addReaction,
    decodeThreadId: capture.decodeThreadId,
    getSdk: () => ({ messages: { send: capture.mediaSend } }),
    handleWebhook: capture.verifier,
    markRead: capture.markRead,
  }),
}));
vi.mock("eve/channels/chat-sdk", async (importOriginal) => ({
  ...(await importOriginal()),
  chatSdkChannel: (config: unknown) => {
    capture.events = config;
    return {
      bot: { onDirectMessage: vi.fn() },
      channel: {},
      send: capture.send,
    };
  },
}));
vi.mock("@/agent/lib/linq/heic-to-jpeg", () => ({
  convertHeicToJpeg: capture.convertHeicToJpeg,
}));
vi.mock("@/auth", () => ({
  getAuth: async () => ({
    $context: { adapter: { findOne: capture.findOne } },
  }),
}));
vi.mock("@/db/services/scope", () => ({
  WorkspaceNotOperableError: class WorkspaceNotOperableError extends Error {},
  verifyScopeAccess: capture.verifier,
}));
vi.mock("@/db/services/phone-identities", () => ({
  findVerifiedUserByPhoneNumber: capture.findIdentity,
}));
vi.mock("@/db/services/channel-conversations", () => ({
  createConversationBinding: capture.createBinding,
  resolveConversationBinding: capture.resolveBinding,
  resolveVerifiedConversationBinding: capture.resolveVerifiedBinding,
}));
vi.mock("@/db/services/channel-onboarding", () => ({
  isChannelCommunicationStopped: capture.isChannelCommunicationStopped,
  parseChannelCommunicationCommand: capture.parseCommunicationCommand,
  provisionChannelEnrollment: capture.provisionChannelEnrollment,
  recordChannelCommunicationStart: capture.recordChannelCommunicationStart,
  recordChannelCommunicationStop: capture.recordChannelCommunicationStop,
  resolveChannelEnrollment: capture.resolveChannelEnrollment,
  replayChannelOnboardingWelcome: capture.replayChannelOnboardingWelcome,
}));
vi.mock("@/agent/lib/principal-scope", () => ({
  scopeFromPrincipal: () => ({ workspaceId }),
}));
vi.mock("@/db/services/usage", () => ({
  BudgetExceededError: capture.BudgetExceededError,
  checkBudget: capture.checkBudget,
  recordUsageEvent: capture.recordUsageEvent,
}));
vi.mock("@/agent/lib/browser-image-artifact/delivery", () => ({
  prepareBrowserImageArtifactDelivery:
    capture.prepareBrowserImageArtifactDelivery,
}));
vi.mock("@/agent/lib/onboarding/delivery", () => ({
  drainSendblueChannelOnboarding: capture.drainOnboarding,
}));
vi.mock("@/db/services/channel-onboarding-delivery", () => ({
  enqueueChannelOnboardingOutboundReply: capture.enqueueOnboardingReply,
  getChannelOnboardingOutboundReplyDelivery: capture.getOnboardingReplyDelivery,
}));

/**
 * A faithful in-memory replica of `db/services/completion-report-attempts.ts`,
 * standing in for Postgres so this suite can observe real claim/attempt/accept
 * transitions without a database. Real contention and restart behaviour is
 * covered in `tests/integration/real-postgres.test.ts`; what this proves is
 * that the channel calls the real seam correctly -- once per part, claimed
 * before dispatched -- against actual SendBlue provider-call counts.
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

const { admitTask, beginCohortReport, cohortFor, recordTerminal } =
  await import("@/agent/lib/completion-obligations");

/**
 * Binds the completion-report obligation for one turn/call, the way the
 * `send_message` tool does in production, without going through the tool: an
 * admitted, terminal, must-report cohort is what makes `reportPartIdentityFor`
 * resolve an identity for this exact turn and call.
 */
function bindReportObligation(turnId: string, callId: string) {
  const cohortId = admitTerminalReport(turnId, callId);
  beginCohortReport(cohortId, { callId, turnId });
  return cohortId;
}

function admitTerminalReport(
  turnId: string,
  callId: string,
  claim = "The worker finished."
) {
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
    [{ claim, evidence: "observed" }]
  );
  return cohortId;
}

const {
  parseChannelCommunicationCommand: actualParseChannelCommunicationCommand,
} = await vi.importActual<typeof ChannelOnboardingService>(
  "@/db/services/channel-onboarding"
);
const { dispatchSendblueMessage, sendblueChannelConfig } =
  await import("@/agent/channels/sendblue");
const sendblueEvents = (
  capture.events as {
    readonly events: Record<string, (...args: unknown[]) => Promise<void>>;
  }
).events;

function getSendblueEvent(name: string) {
  const event = sendblueEvents[name];
  if (!event) throw new Error(`Missing SendBlue event: ${name}`);
  return event;
}

const workspaceId = "personal:0123456789abcdef0123456789abcdef";
const thread = {
  id: "sendblue:KzEyMDI1NTUwMTIz:KzEyMDI1NTUwMTk5",
  post: capture.post,
  toJSON: () => ({ currentMessage: { id: "inbound-message" } }),
} as unknown as Thread;

interface StoredPendingInput {
  readonly generation?: string;
  readonly requests: readonly {
    readonly allowFreeform?: boolean;
    readonly kind?: string;
    readonly options?: readonly {
      readonly id: string;
      readonly label: string;
    }[];
    readonly prompt: string;
    readonly requestId: string;
  }[];
  readonly responses?: readonly {
    readonly optionId?: string;
    readonly requestId: string;
    readonly text?: string;
  }[];
  readonly workspaceId: string;
}

beforeEach(() => {
  deliveryState.reset();
  reportAttempts.reset();
  vi.clearAllMocks();
  capture.findOne.mockResolvedValue({ id: "alice", phoneNumberVerified: true });
  capture.findIdentity.mockResolvedValue({
    phoneIdentityId: "phone-1",
    userId: "alice",
  });
  capture.resolveBinding.mockResolvedValue({ id: "binding-1", workspaceId });
  capture.resolveVerifiedBinding.mockResolvedValue({
    id: "binding-1",
    workspaceId,
  });
  capture.verifier.mockResolvedValue({ workspaceId });
  capture.mediaSend.mockResolvedValue({ message_handle: "accepted-media" });
  capture.decodeThreadId.mockReturnValue({
    contactNumber: "+12025550199",
    fromNumber: "+12025550123",
  });
  capture.post.mockResolvedValue({ id: "posted" });
  capture.convertHeicToJpeg.mockResolvedValue(onePixelJpeg());
  capture.send.mockResolvedValue(undefined);
  capture.isTextOnboardingEnabled.mockReturnValue(true);
  capture.resolveChannelEnrollment.mockResolvedValue(undefined);
  capture.recordChannelCommunicationStop.mockResolvedValue(undefined);
  capture.recordChannelCommunicationStart.mockResolvedValue(undefined);
  capture.parseCommunicationCommand.mockImplementation(
    actualParseChannelCommunicationCommand
  );
  capture.isChannelCommunicationStopped.mockResolvedValue(false);
  capture.drainOnboarding.mockResolvedValue({ attempted: 0, claimed: 0 });
  capture.enqueueOnboardingReply.mockResolvedValue({
    id: "reply-1",
    inserted: true,
  });
  capture.getOnboardingReplyDelivery.mockResolvedValue({
    kind: "provider_accepted",
    providerHandle: "provider-1",
  });
  capture.stateConnect.mockResolvedValue(undefined);
  capture.claim.mockResolvedValue(true);
  capture.acquireLock.mockResolvedValue({
    expiresAt: Date.now() + 30_000,
    threadId: thread.id,
    token: "lock-1",
  });
  capture.extendLock.mockResolvedValue(true);
  capture.releaseLock.mockResolvedValue(undefined);
  capture.setState.mockResolvedValue(undefined);
  capture.deleteState.mockResolvedValue(undefined);
  capture.getState.mockResolvedValue(null);
  capture.checkBudget.mockResolvedValue(undefined);
  capture.recordUsageEvent.mockResolvedValue(undefined);
  capture.requestTurnCompletion.mockReset();
  capture.prepareBrowserImageArtifactDelivery.mockResolvedValue({
    failedArtifactIds: [],
    files: [],
    text: "",
  });
  capture.fetch.mockReset();
  vi.stubGlobal("fetch", capture.fetch);
});

describe("SendBlue channel", () => {
  it("records an unknown STOP as minimal communication suppression without enrollment", async () => {
    capture.findOne.mockResolvedValue(null);

    await dispatchSendblueMessage(thread, inbound({ text: " STOP " }));

    expect(capture.recordChannelCommunicationStop).toHaveBeenCalledWith({
      phoneNumber: "+12025550199",
      provider: "sendblue",
      providerAccountId: "account@example.test",
      providerLineId: "+12025550123",
      messageHandle: "message-1",
    });
    expect(capture.resolveChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("records authenticated START as opt-in without creating an account", async () => {
    capture.findOne.mockResolvedValue(null);

    await dispatchSendblueMessage(thread, inbound({ text: "START" }));

    expect(capture.recordChannelCommunicationStart).toHaveBeenCalledWith({
      phoneNumber: "+12025550199",
      provider: "sendblue",
      providerAccountId: "account@example.test",
      providerLineId: "+12025550123",
      messageHandle: "message-1",
    });
    expect(capture.recordChannelCommunicationStop).not.toHaveBeenCalled();
    expect(capture.resolveChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("treats provider-reserved CANCEL as STOP even while an approval is parked", async () => {
    capture.getState.mockResolvedValue(pending());

    await dispatchSendblueMessage(thread, inbound({ text: "cancel" }));

    expect(capture.parseCommunicationCommand).toHaveBeenCalledWith("cancel");
    expect(capture.recordChannelCommunicationStop).toHaveBeenCalledWith({
      phoneNumber: "+12025550199",
      provider: "sendblue",
      providerAccountId: "account@example.test",
      providerLineId: "+12025550123",
      messageHandle: "message-1",
    });
    expect(capture.send).not.toHaveBeenCalled();
    expect(capture.deleteState).not.toHaveBeenCalled();
  });

  it("maps an approval decline expressed as no without using the reserved CANCEL keyword", async () => {
    capture.getState.mockResolvedValue(pending());

    await dispatchSendblueMessage(thread, inbound({ text: "no" }));

    expect(capture.recordChannelCommunicationStop).not.toHaveBeenCalled();
    expect(capture.send).toHaveBeenCalledWith(
      { inputResponses: [{ optionId: "cancel", requestId: "request-1" }] },
      expect.objectContaining({ thread })
    );
  });

  it("does not admit a suppressed legacy verified sender after enrollment resolution returns undefined", async () => {
    capture.isChannelCommunicationStopped.mockResolvedValue(true);

    await dispatchSendblueMessage(thread, inbound({ text: "hello" }));

    expect(capture.isChannelCommunicationStopped).toHaveBeenCalledWith({
      phoneNumber: "+12025550199",
      provider: "sendblue",
      providerAccountId: "account@example.test",
      providerLineId: "+12025550123",
    });
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("does not admit a suppressed OTP-upgraded enrollment through the legacy fallback", async () => {
    capture.findOne.mockResolvedValue({
      id: "existing-user",
      phoneNumberVerified: true,
    });
    capture.findIdentity.mockResolvedValue({
      phoneIdentityId: "phone-enrolled",
      userId: "existing-user",
    });
    capture.isChannelCommunicationStopped.mockResolvedValue(true);

    await dispatchSendblueMessage(thread, inbound({ text: "hello" }));

    expect(capture.isChannelCommunicationStopped).toHaveBeenCalledOnce();
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("does not send an unsent legacy text, media, or budget notice after STOP", async () => {
    capture.isChannelCommunicationStopped.mockResolvedValue(true);
    capture.checkBudget.mockRejectedValue(
      new capture.BudgetExceededError("Workspace usage limit reached.")
    );

    await getSendblueEvent("action.result")(
      action({
        output: {
          attachments: [
            { kind: "image", url: "https://media.example/stopped.png" },
          ],
          kind: "message",
          text: "Here is the report.",
        },
      }),
      { thread },
      sessionContext()
    );

    expect(capture.checkBudget).not.toHaveBeenCalled();
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).not.toHaveBeenCalled();
  });

  it("checks STOP again after budget admission and before a legacy text post", async () => {
    capture.isChannelCommunicationStopped
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    capture.checkBudget.mockImplementationOnce(async () => {
      capture.isChannelCommunicationStopped.mockResolvedValue(true);
    });

    await expect(
      getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "Here is the report." } }),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow("SendBlue communication is stopped.");

    expect(capture.checkBudget).toHaveBeenCalledOnce();
    expect(capture.post).not.toHaveBeenCalled();
  });

  it("does not post a budget denial if STOP arrives during budget admission", async () => {
    capture.isChannelCommunicationStopped
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    capture.checkBudget.mockImplementationOnce(async () => {
      capture.isChannelCommunicationStopped.mockResolvedValue(true);
      throw new capture.BudgetExceededError("Workspace usage limit reached.");
    });

    await getSendblueEvent("action.result")(
      action({ output: { kind: "message", text: "Here is the report." } }),
      { thread },
      sessionContext()
    );

    expect(capture.checkBudget).toHaveBeenCalledOnce();
    expect(capture.post).not.toHaveBeenCalled();
  });

  it.each([
    { contactNumber: undefined, fromNumber: "+12025550123" },
    { contactNumber: "+12025550199", fromNumber: "+12025550124" },
  ])(
    "fails closed before a legacy text send when the direct recipient or line is not exact",
    async (decoded) => {
      capture.decodeThreadId.mockReturnValue(decoded);

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "Here is the report." } }),
        { thread },
        sessionContext()
      );

      expect(capture.isChannelCommunicationStopped).not.toHaveBeenCalled();
      expect(capture.checkBudget).not.toHaveBeenCalled();
      expect(capture.post).not.toHaveBeenCalled();
    }
  );

  it("provisions one eligible unknown direct sender from the authenticated provider identity", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.provisionChannelEnrollment.mockResolvedValue({
      agentId: "agent-new",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-new",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-new",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-new",
      principalId: "new-user",
      receiptId: "receipt-new",
      status: "ready",
      userId: "new-user",
      workspaceId,
    });

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "What can you do?" })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith({
      messageId: "message-1",
      openingDispatch: "after_welcome",
      openingRequest: { text: "What can you do?" },
      phoneNumber: "+12025550199",
      provider: "sendblue",
      providerAccountId: "account@example.test",
      providerConversationId: thread.id,
      providerLineId: "+12025550123",
      welcomeParts: expect.any(Array),
    });
    expect(capture.drainOnboarding).toHaveBeenCalledOnce();
  });

  it.each(["hi", "hello", "Hey Jory, what can you do?"])(
    "holds the illustrated welcome sequence before a known greeting: %s",
    async (text) => {
      capture.findOne.mockResolvedValue(null);
      capture.provisionChannelEnrollment.mockResolvedValue({
        agentId: "agent-new",
        assurance: "channel_observed",
        authAssurance: "channel_observed",
        bindingId: "binding-new",
        capabilities: ["assistant_basic", "photo_input"],
        capabilityProfile: "channel-basic",
        enrollmentId: "enrollment-new",
        identityProvenance: "sendblue_direct",
        phoneIdentityId: "phone-new",
        principalId: "new-user",
        receiptId: "receipt-new",
        status: "ready",
        userId: "new-user",
        workspaceId,
      });

      await dispatchSendblueMessage(thread, inbound({ text }));

      expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({ openingDispatch: "after_welcome" })
      );
    }
  );

  it("persists a normalized first-contact HEIC photo before draining onboarding", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.provisionChannelEnrollment.mockResolvedValue({
      agentId: "agent-new",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-new",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-new",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-new",
      principalId: "new-user",
      receiptId: "receipt-new",
      status: "ready",
      userId: "new-user",
      workspaceId,
    });
    capture.fetch.mockResolvedValue(
      new Response(Uint8Array.from(heicBytes()), {
        headers: { "content-type": "application/octet-stream" },
      })
    );

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "image/heic",
            name: "shop.HEIC",
            type: "image",
            url: "https://media.example.test/first-photo",
          },
        ],
        text: "What is in this photo?",
      })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        openingRequest: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              contentType: "image/jpeg",
              privateData: onePixelJpeg().toString("base64"),
            }),
          ],
          text: "What is in this photo?",
        }),
      })
    );
    expect(capture.drainOnboarding).toHaveBeenCalledOnce();
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("keeps first-contact text and records that an unavailable original attachment needs resend", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.provisionChannelEnrollment.mockResolvedValue(readyEnrollment());

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "image/jpeg",
            name: "unavailable.jpg",
            type: "image",
            url: "https://media.example.test/unavailable",
          },
        ],
        text: "What is in this photo?",
      })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        openingRequest: {
          text: "What is in this photo?\n\nOne original attachment was unavailable. Ask the sender to resend it as a JPEG or PNG.",
        },
      })
    );
  });

  it("keeps first-contact text when a non-data PDF cannot be preserved", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.provisionChannelEnrollment.mockResolvedValue(readyEnrollment());

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "application/pdf",
            name: "sales.pdf",
            type: "file",
            url: "https://media.example.test/sales.pdf",
          },
        ],
        text: "Please summarize this.",
      })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        openingRequest: {
          text: "Please summarize this.\n\nOne original attachment was unavailable. Ask the sender to resend it as a JPEG or PNG.",
        },
      })
    );
  });

  it("keeps usable first-contact attachments while disclosing other unavailable originals", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.provisionChannelEnrollment.mockResolvedValue(readyEnrollment());

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "image/jpeg",
            name: "kept.jpg",
            type: "image",
            url: `data:image/jpeg;base64,${onePixelJpeg().toString("base64")}`,
          },
          {
            mimeType: "image/jpeg",
            name: "unavailable.jpg",
            type: "image",
            url: "https://media.example.test/unavailable",
          },
        ],
        text: "Compare these photos.",
      })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        openingRequest: {
          attachments: [expect.objectContaining({ contentType: "image/jpeg" })],
          text: "Compare these photos.\n\nOne original attachment was unavailable. Ask the sender to resend it as a JPEG or PNG.",
        },
      })
    );
  });

  it("continues an enrolled channel-observed sender after new enrollment is turned off", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.isTextOnboardingEnabled.mockReturnValue(false);
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });
    capture.provisionChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "existing-user",
      receiptId: "receipt-next",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });

    await dispatchSendblueMessage(thread, inbound());

    expect(capture.resolveChannelEnrollment).toHaveBeenCalledWith({
      phoneNumber: "+12025550199",
      provider: "sendblue",
      providerAccountId: "account@example.test",
      providerConversationId: thread.id,
      providerLineId: "+12025550123",
    });
    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        providerConversationId: thread.id,
      })
    );
    expect(capture.drainOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: "binding-enrolled" })
    );
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("replays the durable welcome only for an exact enrolled reset command", async () => {
    capture.isTextOnboardingEnabled.mockReturnValue(false);
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });
    capture.replayChannelOnboardingWelcome.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "existing-user",
      receiptId: "receipt-reset",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "  RESET ONBOARDING  " })
    );

    expect(capture.replayChannelOnboardingWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        phoneNumber: "+12025550199",
        providerAccountId: "account@example.test",
        providerConversationId: thread.id,
        providerLineId: "+12025550123",
        welcomeParts: expect.any(Array),
      })
    );
    expect(
      capture.replayChannelOnboardingWelcome.mock.calls[0]?.[0]?.welcomeParts
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          media: [
            expect.objectContaining({
              contentType: "image/png",
              url: "https://app.example.test/onboarding/example-1.png",
            }),
          ],
          presentation: { kind: "single_media" },
        }),
      ])
    );
    expect(
      capture.replayChannelOnboardingWelcome.mock.calls[0]?.[0]?.welcomeParts
    ).toHaveLength(7);
    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.drainOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: "binding-enrolled",
        kinds: ["welcome"],
      })
    );
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("replays welcome for a verified bound owner without admitting reset text to Eve", async () => {
    capture.replayChannelOnboardingWelcome.mockResolvedValue({
      agentId: "agent-verified",
      assurance: "otp_verified",
      authAssurance: "otp_verified",
      bindingId: "binding-1",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "full",
      enrollmentId: "enrollment-verified",
      identityProvenance: "phone_otp",
      phoneIdentityId: "phone-1",
      principalId: "alice",
      receiptId: "receipt-reset",
      status: "ready",
      userId: "alice",
      workspaceId,
    });

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "reset onboarding" })
    );

    expect(capture.replayChannelOnboardingWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        providerConversationId: thread.id,
      })
    );
    expect(capture.send).not.toHaveBeenCalled();
    expect(capture.drainOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: "binding-1", kinds: ["welcome"] })
    );
  });

  it("does not replay onboarding after STOP or from a foreign direct line", async () => {
    capture.isChannelCommunicationStopped.mockResolvedValue(true);

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "reset onboarding" })
    );

    expect(capture.replayChannelOnboardingWelcome).not.toHaveBeenCalled();
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("resumes a parked observed-channel input reply instead of appending a new opening request", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });
    capture.getState.mockResolvedValue(pending());

    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));

    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.drainOnboarding).not.toHaveBeenCalled();
    expect(capture.send).toHaveBeenCalledWith(
      { inputResponses: [{ optionId: "approve", requestId: "request-1" }] },
      expect.objectContaining({ thread })
    );
  });

  it("appends a later ordinary observed-channel message as durable ordered work", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });
    capture.provisionChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-later",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "Can you check yesterday's Square sales?" })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "message-1",
        openingDispatch: "after_intro",
        openingRequest: { text: "Can you check yesterday's Square sales?" },
      })
    );
    expect(capture.drainOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: "binding-enrolled" })
    );
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("preserves the resend context on the existing durable continuation path", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.resolveChannelEnrollment.mockResolvedValue(readyEnrollment());
    capture.provisionChannelEnrollment.mockResolvedValue(readyEnrollment());

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "image/jpeg",
            name: "unavailable.jpg",
            type: "image",
            url: "https://media.example.test/unavailable",
          },
        ],
        text: "Can you use this for yesterday's sales?",
      })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        openingRequest: {
          text: "Can you use this for yesterday's sales?\n\nOne original attachment was unavailable. Ask the sender to resend it as a JPEG or PNG.",
        },
      })
    );
  });

  it("keeps an attachment-only first contact actionable when its original cannot be read", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.provisionChannelEnrollment.mockResolvedValue(readyEnrollment());

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "image/jpeg",
            name: "unavailable.jpg",
            type: "image",
            url: "https://media.example.test/unavailable",
          },
        ],
        text: "",
      })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        openingRequest: {
          text: "One original attachment was unavailable. Ask the sender to resend it as a JPEG or PNG.",
        },
      })
    );
  });

  it("keeps a same-binding OTP-upgraded enrollment on the durable continuation path with full auth", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "otp_verified",
      authAssurance: "otp_verified",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "full",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "phone_otp",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });
    capture.provisionChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "otp_verified",
      authAssurance: "otp_verified",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "full",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "phone_otp",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-later",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });

    const result = await sendblueChannelConfig.onMessage(
      { thread },
      inbound({ text: "Please connect Square." })
    );

    expect(capture.provisionChannelEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "message-1" })
    );
    expect(result).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({
          attributes: expect.objectContaining({
            authAssurance: "otp_verified",
            capabilityProfile: "full",
            identityProvenance: "phone_otp",
          }),
        }),
        drainOnboarding: true,
      })
    );
  });

  it("does not enroll or dispatch a genuinely new sender while enrollment is off", async () => {
    capture.findOne.mockResolvedValue(null);
    capture.isTextOnboardingEnabled.mockReturnValue(false);

    await dispatchSendblueMessage(thread, inbound());

    expect(capture.resolveChannelEnrollment).toHaveBeenCalledOnce();
    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.send).not.toHaveBeenCalled();
  });

  it("keeps the verified SendBlue path available while new enrollment is off", async () => {
    capture.isTextOnboardingEnabled.mockReturnValue(false);

    await dispatchSendblueMessage(thread, inbound());

    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.send).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({
        auth: expect.objectContaining({
          attributes: expect.objectContaining({
            authAssurance: "otp_verified",
            capabilityProfile: "full",
            identityProvenance: "phone_otp",
          }),
        }),
        thread,
      })
    );
  });

  it("admits a verified bound sender and sends the user turn", async () => {
    await dispatchSendblueMessage(thread, inbound());
    expect(capture.markRead).toHaveBeenCalledWith(thread.id);
    expect(capture.send).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ thread })
    );
  });

  it.each([
    {
      mimeType: "application/octet-stream",
      name: "attachment.heic",
      type: "file",
      variant: "a signed opaque HEIC URL",
    },
    {
      mimeType: "image/heic",
      name: "IMG_0001.HEIC",
      type: "image",
      variant: "a natively labeled HEIC image",
    },
  ])(
    "converts $variant before Eve receives the SendBlue turn",
    async (input) => {
      const mediaUrl =
        "https://media.example.test/download?id=opaque-signature";
      capture.fetch.mockResolvedValue(
        new Response(Uint8Array.from(heicBytes()), {
          headers: { "content-type": "application/octet-stream" },
        })
      );

      await dispatchSendblueMessage(
        thread,
        inbound({
          attachments: [
            {
              fetchData: vi.fn(async () => Buffer.from([0x00])),
              mimeType: input.mimeType,
              name: input.name,
              type: input.type,
              url: mediaUrl,
            },
          ],
        })
      );

      const sent: unknown = capture.send.mock.calls[0]?.[0];
      expect(sent).toEqual([
        { text: "hello", type: "text" },
        expect.objectContaining({
          filename: input.name.replace(/\.heic$/iu, ".jpg"),
          mediaType: "image/jpeg",
          type: "file",
        }),
      ]);
      const file = eveFilePartSchema.parse(
        Array.isArray(sent) ? sent[1] : undefined
      );
      expect(file.data.protocol).toBe("data:");
      const jpeg = Buffer.from(
        file.data.pathname.split(",")[1] ?? "",
        "base64"
      );
      expect(decodeJpeg(jpeg)).toMatchObject({ height: 1, width: 1 });
      expect(capture.fetch).toHaveBeenCalledWith(
        new URL(mediaUrl),
        expect.objectContaining({ redirect: "error" })
      );
      expect(capture.convertHeicToJpeg.mock.calls[0]?.[0]).toEqual(
        new Uint8Array(heicBytes())
      );
    }
  );

  it("keeps the text request when an opaque attachment cannot be fetched", async () => {
    capture.fetch.mockRejectedValue(new Error("synthetic media unavailable"));

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "application/octet-stream",
            name: "attachment.heic",
            type: "file",
            url: "https://media.example.test/download?id=unavailable",
          },
        ],
      })
    );

    expect(capture.send).toHaveBeenCalledWith("hello", expect.any(Object));
  });

  it("replies once instead of sending an empty image-only request when fetching fails", async () => {
    capture.fetch.mockRejectedValue(new Error("synthetic media unavailable"));

    await dispatchSendblueMessage(
      thread,
      inbound({
        attachments: [
          {
            mimeType: "application/octet-stream",
            name: "attachment.heic",
            type: "file",
            url: "https://media.example.test/download?id=unavailable",
          },
        ],
        text: "",
      })
    );

    expect(capture.send).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledExactlyOnceWith({
      raw: expect.stringContaining("Please resend photos as JPEG or PNG"),
    });
  });

  it("reports a lost conversation lock after an image-only fallback posts", async () => {
    vi.useFakeTimers();
    try {
      capture.fetch.mockRejectedValue(new Error("synthetic media unavailable"));
      capture.extendLock.mockResolvedValue(false);
      capture.post.mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
        return { id: "posted" };
      });

      await expect(
        dispatchSendblueMessage(
          thread,
          inbound({
            attachments: [
              {
                mimeType: "application/octet-stream",
                name: "attachment.heic",
                type: "file",
                url: "https://media.example.test/download?id=unavailable",
              },
            ],
            text: "",
          })
        )
      ).rejects.toThrow(
        "Lost the SendBlue conversation lock after attachment fallback."
      );

      expect(capture.post).toHaveBeenCalledExactlyOnceWith({
        raw: expect.stringContaining("Please resend photos as JPEG or PNG"),
      });
      expect(capture.releaseLock).toHaveBeenCalledWith(
        expect.objectContaining({ token: "lock-1" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows bridge.send to await input.requested while dispatch holds the inbound lease", async () => {
    let held = false;
    capture.acquireLock.mockImplementation(async () => {
      if (held) return null;
      held = true;
      return {
        expiresAt: Date.now() + 30_000,
        threadId: thread.id,
        token: "lock-1",
      };
    });
    capture.releaseLock.mockImplementation(async () => {
      held = false;
    });
    capture.send.mockImplementationOnce(async () => {
      await getSendblueEvent("input.requested")(
        inputRequest(),
        { thread },
        sessionContext()
      );
    });

    await expect(
      dispatchSendblueMessage(thread, inbound())
    ).resolves.toBeUndefined();
    expect(capture.setState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`,
      expect.any(Object),
      expect.any(Number)
    );
  });

  it("maps yes to exactly the workspace-owned pending request and clears only after Eve accepts", async () => {
    capture.getState.mockResolvedValue(pending());
    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));
    expect(capture.send).toHaveBeenCalledWith(
      { inputResponses: [{ optionId: "approve", requestId: "request-1" }] },
      expect.objectContaining({ thread })
    );
    expect(capture.deleteState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`
    );
  });

  it("keeps pending input after Eve rejects its durable acknowledgement", async () => {
    capture.getState.mockResolvedValue(pending());
    capture.send.mockRejectedValueOnce(new Error("Eve unavailable"));
    await expect(
      dispatchSendblueMessage(thread, inbound({ text: "no" }))
    ).rejects.toThrow("Eve unavailable");
    expect(capture.deleteState).not.toHaveBeenCalled();
  });

  it("does not delete a fresh prompt emitted before Eve acknowledges the prior response", async () => {
    let stored: StoredPendingInput | null = pending();
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    capture.send.mockImplementation(async () => {
      await getSendblueEvent("input.requested")(
        inputRequest({ requestId: "request-2" }),
        { thread },
        sessionContext()
      );
    });

    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));

    expect(capture.deleteState).not.toHaveBeenCalled();
    expect(stored).toEqual(
      expect.objectContaining({
        requests: [expect.objectContaining({ requestId: "request-2" })],
      })
    );

    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));
    expect(capture.send).toHaveBeenLastCalledWith(
      { inputResponses: [{ optionId: "approve", requestId: "request-2" }] },
      expect.any(Object)
    );
  });

  it.each(["no", "never mind"])(
    "maps %s to the same pending Eve request",
    async (reply) => {
      capture.getState.mockResolvedValue(pending());
      await dispatchSendblueMessage(thread, inbound({ text: reply }));
      expect(capture.send).toHaveBeenCalledWith(
        { inputResponses: [{ optionId: "cancel", requestId: "request-1" }] },
        expect.any(Object)
      );
    }
  );

  it("does not map a pending request from another workspace", async () => {
    capture.getState.mockResolvedValue({
      ...pending(),
      workspaceId: "workspace:other",
    });
    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));
    expect(capture.send).toHaveBeenCalledWith("yes", expect.any(Object));
    expect(capture.deleteState).not.toHaveBeenCalled();
  });

  it("renders approval choices without internal tool names", async () => {
    await getSendblueEvent("input.requested")(
      {
        requests: [
          {
            allowFreeform: false,
            kind: "tool-approval",
            options: [
              { id: "approve", label: "Approve" },
              { id: "cancel", label: "Cancel" },
            ],
            prompt: "Approve provider-internal-write",
            requestId: "request-1",
          },
        ],
      },
      { thread },
      {
        session: {
          auth: {
            current: {
              attributes: { workspaceId },
              principalId: "better-auth:alice",
              principalType: "user",
            },
          },
        },
      }
    );
    expect(capture.post).toHaveBeenCalledWith({
      raw: expect.stringContaining("“no.”"),
    });
    expect(capture.post.mock.calls[0]?.[0].raw).not.toContain(
      "provider-internal-write"
    );
    expect(capture.post.mock.calls[0]?.[0].raw).not.toContain("cancel");
  });

  it("does not make an approval eligible when its first prompt lacks a provider handle", async () => {
    let stored: StoredPendingInput | null = null;
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    capture.getState.mockImplementation(async () => stored);
    capture.post.mockResolvedValueOnce({ id: "" });

    await expect(
      getSendblueEvent("input.requested")(
        inputRequest(),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow(/did not accept/iu);
    expect(stored).toBeNull();

    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));
    expect(capture.send).toHaveBeenCalledWith("yes", expect.any(Object));
    expect(capture.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ inputResponses: expect.anything() }),
      expect.anything()
    );
  });

  it("does not make an approval eligible when its first prompt is rejected", async () => {
    let stored: StoredPendingInput | null = null;
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    capture.getState.mockImplementation(async () => stored);
    capture.post.mockRejectedValueOnce(new Error("provider rejected"));

    await expect(
      getSendblueEvent("input.requested")(
        inputRequest(),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow("provider rejected");
    expect(stored).toBeNull();
  });

  it("collects simultaneous requests in order before resuming Eve", async () => {
    let stored: { readonly responses?: readonly unknown[] } | null = null;
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    await getSendblueEvent("input.requested")(
      {
        requests: [
          {
            allowFreeform: false,
            kind: "tool-approval",
            options: [
              { id: "approve", label: "Approve" },
              { id: "cancel", label: "Cancel" },
            ],
            prompt: "Approve the first operation",
            requestId: "request-1",
          },
          {
            allowFreeform: true,
            kind: "question",
            prompt: "What is your second answer?",
            requestId: "request-2",
          },
        ],
      },
      { thread },
      {
        session: {
          auth: {
            current: {
              attributes: { workspaceId },
              principalId: "better-auth:alice",
              principalType: "user",
            },
          },
        },
      }
    );
    expect(capture.setState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`,
      expect.objectContaining({
        requests: [
          expect.objectContaining({ requestId: "request-1" }),
          expect.objectContaining({ requestId: "request-2" }),
        ],
      }),
      expect.any(Number)
    );
    expect(capture.post.mock.calls[0]?.[0].raw).not.toContain("second");

    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));
    expect(capture.send).not.toHaveBeenCalled();
    expect(capture.post.mock.calls[1]?.[0].raw).toContain("second answer");

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "the answer is 42" })
    );
    expect(capture.send).toHaveBeenCalledWith(
      {
        inputResponses: [
          { optionId: "approve", requestId: "request-1" },
          { requestId: "request-2", text: "the answer is 42" },
        ],
      },
      expect.objectContaining({ thread })
    );
    expect(capture.deleteState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`
    );
  });

  it("does not advance to a follow-up request when its prompt lacks a provider handle", async () => {
    const initial: StoredPendingInput = {
      responses: [],
      requests: [
        firstPendingRequest(),
        {
          allowFreeform: true,
          kind: "question",
          prompt: "What is the second answer?",
          requestId: "request-2",
        },
      ],
      workspaceId,
    };
    let stored: StoredPendingInput = initial;
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    capture.post.mockResolvedValueOnce({ id: "" });

    await expect(
      dispatchSendblueMessage(thread, inbound({ text: "yes" }))
    ).rejects.toThrow(/did not accept/iu);
    expect(stored).toEqual(initial);

    await dispatchSendblueMessage(
      thread,
      inbound({ text: "the second answer" })
    );
    expect(capture.send).toHaveBeenCalledWith(
      "the second answer",
      expect.any(Object)
    );
    expect(capture.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ inputResponses: expect.anything() }),
      expect.anything()
    );
  });

  it("does not advance to a follow-up request when its prompt is rejected", async () => {
    const initial: StoredPendingInput = {
      responses: [],
      requests: [
        firstPendingRequest(),
        {
          allowFreeform: true,
          kind: "question",
          prompt: "What is the second answer?",
          requestId: "request-2",
        },
      ],
      workspaceId,
    };
    let stored: StoredPendingInput = initial;
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    capture.post.mockRejectedValueOnce(new Error("provider rejected"));

    await expect(
      dispatchSendblueMessage(thread, inbound({ text: "yes" }))
    ).rejects.toThrow("provider rejected");
    expect(stored).toEqual(initial);
  });

  it("retains every collected response when Eve rejects the final acknowledgement", async () => {
    const initial: StoredPendingInput = {
      ...pending(),
      responses: [{ optionId: "approve", requestId: "request-1" }],
      requests: [
        firstPendingRequest(),
        {
          allowFreeform: true,
          kind: "question",
          prompt: "What is the second answer?",
          requestId: "request-2",
        },
      ],
    };
    let stored: StoredPendingInput | null = initial;
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    capture.deleteState.mockImplementation(async () => {
      stored = null;
    });
    capture.send.mockRejectedValueOnce(new Error("Eve unavailable"));
    await expect(
      dispatchSendblueMessage(thread, inbound({ text: "second response" }))
    ).rejects.toThrow("Eve unavailable");
    expect(capture.deleteState).not.toHaveBeenCalled();
    expect(stored).toEqual(
      expect.objectContaining({
        responses: [
          { optionId: "approve", requestId: "request-1" },
          { requestId: "request-2", text: "second response" },
        ],
      })
    );

    await dispatchSendblueMessage(thread, inbound({ text: "retry" }));
    expect(capture.deleteState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`
    );
    await dispatchSendblueMessage(thread, inbound({ text: "normal message" }));
    expect(capture.send).toHaveBeenLastCalledWith(
      "normal message",
      expect.any(Object)
    );
  });

  it("serializes concurrent replies without overwriting an answer or duplicating the next prompt", async () => {
    const initialStored = {
      responses: [],
      requests: [
        {
          allowFreeform: false,
          kind: "tool-approval",
          options: [
            { id: "approve", label: "Approve" },
            { id: "cancel", label: "Cancel" },
          ],
          prompt: "Approve the operation",
          requestId: "request-1",
        },
        {
          allowFreeform: true,
          kind: "question",
          prompt: "What is the second answer?",
          requestId: "request-2",
        },
      ],
      workspaceId,
    };
    let stored: typeof initialStored = initialStored;
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
    });
    let held = false;
    let observeSecondLockAttempt: () => void;
    const secondLockAttempt = new Promise<void>((resolve) => {
      observeSecondLockAttempt = resolve;
    });
    capture.acquireLock.mockImplementation(async () => {
      if (held) {
        observeSecondLockAttempt();
        return null;
      }
      held = true;
      return {
        expiresAt: Date.now() + 30_000,
        threadId: thread.id,
        token: "lock",
      };
    });
    capture.releaseLock.mockImplementation(async () => {
      held = false;
    });
    let releaseFirstPrompt: (() => void) | undefined;
    const firstPromptReleased = new Promise<void>((resolve) => {
      releaseFirstPrompt = resolve;
    });
    let firstPromptStarted: () => void;
    const firstPromptPosted = new Promise<void>((resolve) => {
      firstPromptStarted = resolve;
    });
    capture.post.mockImplementationOnce(async () => {
      firstPromptStarted();
      await firstPromptReleased;
      return { id: "posted" };
    });

    const firstReply = dispatchSendblueMessage(
      thread,
      inbound({ text: "yes" })
    );
    await firstPromptPosted;
    const secondReply = dispatchSendblueMessage(
      thread,
      inbound({ text: "the second answer" })
    );
    await secondLockAttempt;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1_100);
    });
    expect(capture.claim).toHaveBeenCalledTimes(1);
    if (!releaseFirstPrompt) throw new Error("First prompt did not start");
    releaseFirstPrompt();
    await Promise.all([firstReply, secondReply]);

    expect(capture.post).toHaveBeenCalledTimes(1);
    expect(capture.claim).toHaveBeenCalledTimes(2);
    expect(capture.send).toHaveBeenCalledWith(
      {
        inputResponses: [
          { optionId: "approve", requestId: "request-1" },
          { requestId: "request-2", text: "the second answer" },
        ],
      },
      expect.objectContaining({ thread })
    );
  });

  it.each([
    [
      "unverified Better Auth phone",
      () => {
        capture.isTextOnboardingEnabled.mockReturnValue(false);
        capture.findOne.mockResolvedValue({
          id: "alice",
          phoneNumberVerified: false,
        });
      },
    ],
    [
      "unavailable workspace scope",
      () => capture.verifier.mockResolvedValue(null),
    ],
    [
      "recycled phone identity",
      () =>
        capture.findIdentity.mockResolvedValue({
          phoneIdentityId: "phone-1",
          userId: "other-user",
        }),
    ],
    [
      "stale verified binding",
      () => capture.resolveVerifiedBinding.mockResolvedValue(null),
    ],
    [
      "binding in another workspace",
      () =>
        capture.resolveBinding.mockResolvedValue({
          id: "binding-1",
          workspaceId: "workspace:other",
        }),
    ],
  ])(
    "stops %s before any durable or provider side effect",
    async (_name, arrange) => {
      arrange();
      await dispatchSendblueMessage(thread, inbound());
      expect(capture.claim).not.toHaveBeenCalled();
      expect(capture.markRead).not.toHaveBeenCalled();
      expect(capture.send).not.toHaveBeenCalled();
      expect(capture.createBinding).not.toHaveBeenCalled();
    }
  );

  it("uses the configured sender for a native media action", async () => {
    await getSendblueEvent("action.result")(
      action({
        output: {
          attachments: [
            { kind: "image", url: "https://media.example/image.png" },
          ],
          kind: "message",
        },
      }),
      { thread },
      sessionContext()
    );
    expect(capture.mediaSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from_number: "+12025550123",
        media_url: "https://media.example/image.png",
        number: "+12025550199",
      })
    );
    expect(capture.post).not.toHaveBeenCalled();
  });

  it("uploads an owned private screenshot then sends it once with clean text", async () => {
    const artifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "demo.png",
          mimeType: "image/png",
        },
      ],
      text: "Here is the demo form.",
    });
    capture.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          media_url: "https://sendblue.example/media/demo.png",
          status: "OK",
        }),
        { headers: { "content-type": "application/json" }, status: 201 }
      )
    );

    await getSendblueEvent("action.result")(
      action({
        output: {
          kind: "message",
          text: `Here is the demo form.\n\n![Demo](/artifacts/${artifactId})`,
        },
      }),
      { thread },
      sessionContext()
    );

    expect(capture.prepareBrowserImageArtifactDelivery).toHaveBeenCalledWith(
      `Here is the demo form.\n\n![Demo](/artifacts/${artifactId})`,
      {
        rootSessionId: "root-session-1",
        scope: { workspaceId },
      }
    );
    expect(capture.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = capture.fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.sendblue.com/api/upload-file");
    expect(request).toMatchObject({ method: "POST", redirect: "error" });
    expect(request?.body).toBeInstanceOf(FormData);
    expect(new Headers(request?.headers).get("sb-api-key-id")).toBe("key");
    expect(new Headers(request?.headers).get("sb-api-secret-key")).toBe(
      "secret"
    );
    expect(capture.mediaSend).toHaveBeenCalledTimes(1);
    expect(capture.mediaSend).toHaveBeenCalledWith({
      content: "Here is the demo form.",
      from_number: "+12025550123",
      media_url: "https://sendblue.example/media/demo.png",
      number: "+12025550199",
    });
    expect(capture.post).not.toHaveBeenCalled();
    expect(capture.checkBudget).toHaveBeenCalledTimes(1);
    expect(capture.recordUsageEvent).toHaveBeenCalledTimes(1);
  });

  it("does not read or send a screenshot when the root session is absent", async () => {
    const artifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";

    await getSendblueEvent("action.result")(
      action({
        output: {
          kind: "message",
          text: `Here is the demo form.\n\n![Demo](/artifacts/${artifactId})`,
        },
      }),
      { thread },
      {
        session: {
          auth: {
            current: {
              attributes: { workspaceId },
              principalId: "better-auth:alice",
              principalType: "user",
            },
          },
        },
      }
    );

    expect(capture.prepareBrowserImageArtifactDelivery).not.toHaveBeenCalled();
    expect(capture.fetch).not.toHaveBeenCalled();
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Here is the demo form.\n\nI couldn't attach one image.",
    });
  });

  it("does not upload or send an unavailable private screenshot", async () => {
    const artifactId = "0d01e667-d128-4bb7-a248-1ae21db72f4f";
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [artifactId],
      files: [],
      text: "Here is the demo form.",
    });

    await getSendblueEvent("action.result")(
      action({
        output: {
          kind: "message",
          text: `Here is the demo form.\n\n![Demo](/artifacts/${artifactId})`,
        },
      }),
      { thread },
      sessionContext()
    );

    expect(capture.fetch).not.toHaveBeenCalled();
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Here is the demo form.\n\nI couldn't attach one image.",
    });
  });

  it("does not upload or send a private screenshot when its budget is denied", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "demo.png",
          mimeType: "image/png",
        },
      ],
      text: "Here is the demo form.",
    });
    capture.checkBudget.mockRejectedValueOnce(
      new capture.BudgetExceededError("Workspace usage limit reached.")
    );

    await getSendblueEvent("action.result")(
      action({ output: { kind: "message", text: "Here is the demo form." } }),
      { thread },
      sessionContext()
    );

    expect(capture.fetch).not.toHaveBeenCalled();
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Workspace usage limit reached.",
    });
  });

  it("reports a known first-image upload failure with a clean caption", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "demo.png",
          mimeType: "image/png",
        },
      ],
      text: "Here is the demo form.",
    });
    capture.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ERROR" }), { status: 500 })
    );
    beginFinalMessageDelivery();

    await getSendblueEvent("action.result")(
      action({ output: { kind: "message", text: "Here is the demo form." } }),
      { thread },
      sessionContext()
    );

    expect(capture.fetch).toHaveBeenCalledTimes(1);
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Here is the demo form.\n\nI couldn't attach one image.",
    });
    expect(capture.checkBudget).toHaveBeenCalledTimes(2);
    expect(capture.recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(finalDeliveryStatus("turn-1")).toBe("completed");
    expect(capture.requestTurnCompletion).toHaveBeenCalledWith({
      callId: "call-1",
      stepIndex: 0,
    });
  });

  it("does not send when SendBlue returns an oversized upload response", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "demo.png",
          mimeType: "image/png",
        },
      ],
      text: "Here is the demo form.",
    });
    capture.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "OK" }), {
        headers: { "content-length": "16385" },
        status: 201,
      })
    );
    beginFinalMessageDelivery();

    await getSendblueEvent("action.result")(
      action({ output: { kind: "message", text: "Here is the demo form." } }),
      { thread },
      sessionContext()
    );

    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Here is the demo form.\n\nI couldn't attach one image.",
    });
    expect(finalDeliveryStatus("turn-1")).toBe("completed");
    expect(capture.requestTurnCompletion).toHaveBeenCalledWith({
      callId: "call-1",
      stepIndex: 0,
    });
  });

  it("reports a later known upload failure without repeating accepted images", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "one.png",
          mimeType: "image/png",
        },
        {
          data: Buffer.from([4, 5, 6]),
          filename: "two.png",
          mimeType: "image/png",
        },
      ],
      text: "Here are the images.",
    });
    capture.fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            media_url: "https://sendblue.example/media/one.png",
            status: "OK",
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ERROR" }), { status: 500 })
      );
    beginFinalMessageDelivery();

    await getSendblueEvent("action.result")(
      action({ output: { kind: "message", text: "Here are the images." } }),
      { thread },
      sessionContext()
    );

    expect(capture.fetch).toHaveBeenCalledTimes(2);
    expect(capture.mediaSend).toHaveBeenCalledTimes(1);
    expect(capture.post).toHaveBeenCalledWith({
      raw: "I couldn't attach one image.",
    });
    expect(capture.checkBudget).toHaveBeenCalledTimes(3);
    expect(capture.recordUsageEvent).toHaveBeenCalledTimes(2);
    expect(finalDeliveryStatus("turn-1")).toBe("completed");
    expect(capture.requestTurnCompletion).toHaveBeenCalledWith({
      callId: "call-1",
      stepIndex: 0,
    });
  });

  it("marks delivery unconfirmed if the known-upload failure status cannot post", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "demo.png",
          mimeType: "image/png",
        },
      ],
      text: "Here is the demo form.",
    });
    capture.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ERROR" }), { status: 500 })
    );
    capture.post.mockRejectedValueOnce(new Error("provider timeout"));
    beginFinalMessageDelivery();

    await expect(
      getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "Here is the demo form." } }),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow("provider timeout");
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });

    expect(capture.fetch).toHaveBeenCalledTimes(1);
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).toHaveBeenCalledTimes(1);
    expect(finalDeliveryStatus("turn-1")).toBe("unconfirmed");
  });

  it("does not retry a private image after SendBlue accepts no message handle", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "demo.png",
          mimeType: "image/png",
        },
      ],
      text: "Here is the demo form.",
    });
    capture.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          media_url: "https://sendblue.example/media/demo.png",
          status: "OK",
        }),
        { status: 201 }
      )
    );
    capture.mediaSend.mockResolvedValueOnce({});

    await expect(
      getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "Here is the demo form." } }),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow("SendBlue did not accept the media message.");
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });

    expect(capture.fetch).toHaveBeenCalledTimes(1);
    expect(capture.mediaSend).toHaveBeenCalledTimes(1);
    expect(capture.post).not.toHaveBeenCalled();
    expect(finalDeliveryStatus("turn-1")).toBeUndefined();
    expect(hasUnconfirmedProviderAttempt("turn-1")).toBe(true);
  });

  it("bounds mixed public and private images to four distinct sends", async () => {
    capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
      failedArtifactIds: [],
      files: [
        {
          data: Buffer.from([1, 2, 3]),
          filename: "one.png",
          mimeType: "image/png",
        },
        {
          data: Buffer.from([4, 5, 6]),
          filename: "two.png",
          mimeType: "image/png",
        },
      ],
      text: "Here are the images.",
    });
    capture.fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            media_url: "https://sendblue.example/media/one.png",
            status: "OK",
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            media_url: "https://sendblue.example/media/two.png",
            status: "OK",
          }),
          { status: 201 }
        )
      );

    await getSendblueEvent("action.result")(
      action({
        output: {
          attachments: [
            { kind: "image", url: "https://media.example/three.png" },
            { kind: "image", url: "https://media.example/four.png" },
            { kind: "image", url: "https://media.example/five.png" },
          ],
          kind: "message",
          text: "Here are the images.",
        },
      }),
      { thread },
      sessionContext()
    );

    expect(capture.fetch).toHaveBeenCalledTimes(2);
    expect(capture.mediaSend).toHaveBeenCalledTimes(4);
    expect(
      capture.mediaSend.mock.calls.map(([message]) => message.media_url)
    ).toEqual([
      "https://sendblue.example/media/one.png",
      "https://sendblue.example/media/two.png",
      "https://media.example/three.png",
      "https://media.example/four.png",
    ]);
    expect(capture.mediaSend.mock.calls[0]?.[0]).toMatchObject({
      content: "Here are the images.\n\nI couldn't attach one image.",
    });
  });

  it("checks before sending and records after acceptance for a SendBlue text action", async () => {
    await getSendblueEvent("action.result")(
      action(),
      { thread },
      sessionContext()
    );
    expect(capture.checkBudget).toHaveBeenCalledWith(
      { workspaceId },
      "provider_message"
    );
    expect(capture.recordUsageEvent).toHaveBeenCalledWith(
      { workspaceId },
      { kind: "provider_message", quantity: 1, unit: "messages" }
    );
  });

  it("checks before sending and records after acceptance for each SendBlue media message", async () => {
    let releaseFirstLedger: (() => void) | undefined;
    const firstLedgerReleased = new Promise<void>((resolve) => {
      releaseFirstLedger = resolve;
    });
    let firstLedgerStarted: () => void;
    const firstLedgerStartedPromise = new Promise<void>((resolve) => {
      firstLedgerStarted = resolve;
    });
    capture.recordUsageEvent.mockImplementationOnce(async () => {
      firstLedgerStarted();
      await firstLedgerReleased;
    });
    capture.checkBudget
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new capture.BudgetExceededError("Workspace usage limit reached.")
      );

    const delivery = getSendblueEvent("action.result")(
      action({
        output: {
          attachments: [
            { kind: "image", url: "https://media.example/first.png" },
            { kind: "image", url: "https://media.example/second.png" },
          ],
          kind: "message",
        },
      }),
      { thread },
      sessionContext()
    );
    await firstLedgerStartedPromise;
    expect(capture.checkBudget).toHaveBeenCalledTimes(1);
    expect(capture.mediaSend).toHaveBeenCalledTimes(1);
    if (!releaseFirstLedger)
      throw new Error("First ledger write did not start.");
    releaseFirstLedger();
    await delivery;

    expect(capture.checkBudget).toHaveBeenCalledTimes(2);
    expect(capture.recordUsageEvent).toHaveBeenCalledTimes(2);
    expect(capture.mediaSend).toHaveBeenCalledTimes(1);
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Workspace usage limit reached.",
    });
    expect(capture.recordUsageEvent).toHaveBeenCalledWith(
      { workspaceId },
      { kind: "provider_message", quantity: 1, unit: "messages" }
    );
  });

  it("budgets and records SendBlue prompts and failure messages", async () => {
    await getSendblueEvent("input.requested")(
      inputRequest(),
      { thread },
      sessionContext()
    );
    await getSendblueEvent("turn.failed")(
      { turnId: "turn-2" },
      { thread },
      sessionContext()
    );
    expect(capture.checkBudget).toHaveBeenCalledTimes(2);
    expect(capture.recordUsageEvent).toHaveBeenCalledTimes(2);
  });

  it("sends and records the budget denial instead of the requested provider message", async () => {
    capture.checkBudget.mockRejectedValueOnce(
      new capture.BudgetExceededError("Workspace usage limit reached.")
    );
    await getSendblueEvent("action.result")(
      action(),
      { thread },
      sessionContext()
    );
    expect(capture.post).toHaveBeenCalledWith({
      raw: "Workspace usage limit reached.",
    });
    expect(capture.recordUsageEvent).toHaveBeenCalledWith(
      { workspaceId },
      { kind: "provider_message", quantity: 1, unit: "messages" }
    );
  });

  it("accepts a native reaction without creating a text message", async () => {
    await getSendblueEvent("action.result")(
      {
        result: {
          callId: "call-reaction",
          kind: "tool-result",
          output: { operation: "add", type: "heart" },
          toolName: "react_to_message",
        },
        status: "completed",
        stepIndex: 0,
        turnId: "turn-1",
      },
      { thread }
    );
    expect(capture.addReaction).toHaveBeenCalledWith(
      thread.id,
      "inbound-message",
      "heart"
    );
    expect(capture.post).not.toHaveBeenCalled();
  });

  it("treats a HTTP-success text post without a provider handle as unconfirmed", async () => {
    capture.post.mockResolvedValueOnce({ id: "" });
    await expect(
      getSendblueEvent("action.result")(action(), { thread }, sessionContext())
    ).rejects.toThrow(/did not accept/iu);
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });
    expect(capture.post).toHaveBeenCalledTimes(1);
  });

  it("does not let a completed model message bypass send_message delivery", async () => {
    await getSendblueEvent("message.completed")(
      { finishReason: "stop", message: "DELIVERY_COMPLETE" },
      { thread }
    );
    expect(capture.post).not.toHaveBeenCalled();
  });

  it("queues a channel-observed text reply and settles only after a provider handle is recorded", async () => {
    beginFinalMessageDelivery();

    await getSendblueEvent("action.result")(
      action({
        output: { kind: "message", text: "Your sales summary is ready." },
      }),
      { thread },
      channelObservedSessionContext()
    );

    expect(capture.enqueueOnboardingReply).toHaveBeenCalledWith({
      bindingId: "binding-enrolled",
      payload: {
        from: "+12025550123",
        presentation: { kind: "text" },
        text: "Your sales summary is ready.",
        to: "+12025550199",
        version: 1,
      },
      replyKey: "turn-1:call-1:text:0",
    });
    expect(capture.drainOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: "binding-enrolled",
        kinds: ["outbound_reply"],
      })
    );
    expect(capture.getOnboardingReplyDelivery).toHaveBeenCalledWith({
      bindingId: "binding-enrolled",
      replyKey: "turn-1:call-1:text:0",
    });
    expect(capture.post).not.toHaveBeenCalled();
    expect(finalDeliveryStatus("turn-1")).toBe("completed");
  });

  it("allows a later same-binding OTP upgrade to use the normal authorized media path", async () => {
    const upgradedSession = {
      session: {
        auth: {
          current: {
            attributes: {
              authAssurance: "otp_verified",
              capabilityProfile: "full",
              channelBindingId: "binding-enrolled",
              conversationChannel: "sendblue",
              conversationId: thread.id,
              identityProvenance: "phone_otp",
              workspaceId,
            },
            authenticator: "sendblue-message",
            principalId: "better-auth:existing-user",
            principalType: "user",
          },
          initiator: channelObservedSessionContext().session.auth.initiator,
        },
        id: "root-session-1",
      },
    };

    await getSendblueEvent("action.result")(
      action({
        output: {
          attachments: [
            { kind: "image", url: "https://media.example/upgraded.png" },
          ],
          kind: "message",
          text: "Here is the report.",
        },
      }),
      { thread },
      upgradedSession
    );

    expect(capture.enqueueOnboardingReply).not.toHaveBeenCalled();
    expect(capture.mediaSend).toHaveBeenCalledWith(
      expect.objectContaining({
        media_url: "https://media.example/upgraded.png",
      })
    );
    expect(capture.checkBudget).toHaveBeenCalledOnce();
  });

  it("does not let a different current principal lift observed-channel media restrictions", async () => {
    const mismatchedCurrent = {
      session: {
        auth: {
          current: {
            attributes: {
              authAssurance: "otp_verified",
              capabilityProfile: "full",
              channelBindingId: "binding-enrolled",
              conversationChannel: "sendblue",
              conversationId: thread.id,
              identityProvenance: "phone_otp",
              workspaceId,
            },
            authenticator: "sendblue-message",
            principalId: "better-auth:other-user",
            principalType: "user",
          },
          initiator: channelObservedSessionContext().session.auth.initiator,
        },
        id: "root-session-1",
      },
    };

    await getSendblueEvent("action.result")(
      action({
        output: {
          attachments: [
            { kind: "image", url: "https://media.example/blocked.png" },
          ],
          kind: "message",
          text: "Here is the report.",
        },
      }),
      { thread },
      mismatchedCurrent
    );

    expect(capture.enqueueOnboardingReply).not.toHaveBeenCalled();
    expect(capture.mediaSend).not.toHaveBeenCalled();
    expect(capture.post).not.toHaveBeenCalled();
  });

  it.each([
    {
      current: {
        attributes: {
          authAssurance: "otp_verified",
          capabilityProfile: "full",
          channelBindingId: "binding-enrolled",
          conversationChannel: "sendblue",
          conversationId: thread.id,
          identityProvenance: "phone_otp",
          workspaceId: "workspace:other",
        },
        authenticator: "sendblue-message",
        principalId: "better-auth:existing-user",
        principalType: "user",
      },
      name: "workspace",
    },
    {
      current: {
        attributes: {
          authAssurance: "otp_verified",
          capabilityProfile: "full",
          channelBindingId: "binding-enrolled",
          conversationChannel: "sendblue",
          conversationId: thread.id,
          identityProvenance: "phone_otp",
          workspaceId,
        },
        authenticator: "other-authenticator",
        principalId: "better-auth:existing-user",
        principalType: "user",
      },
      name: "authenticator",
    },
  ])(
    "keeps an observed channel restricted on a mismatched OTP $name",
    async ({ current }) => {
      await getSendblueEvent("action.result")(
        action({
          output: {
            attachments: [
              { kind: "image", url: "https://media.example/blocked.png" },
            ],
            kind: "message",
            text: "Here is the report.",
          },
        }),
        { thread },
        {
          session: {
            auth: {
              current,
              initiator: channelObservedSessionContext().session.auth.initiator,
            },
            id: "root-session-1",
          },
        }
      );

      expect(capture.enqueueOnboardingReply).not.toHaveBeenCalled();
      expect(capture.mediaSend).not.toHaveBeenCalled();
      expect(capture.post).not.toHaveBeenCalled();
    }
  );

  it("splits an observed-channel reply at SendBlue's documented limit with stable part keys", async () => {
    beginFinalMessageDelivery();
    const text = "a".repeat(18_996 + 3);

    await getSendblueEvent("action.result")(
      action({ output: { kind: "message", text } }),
      { thread },
      channelObservedSessionContext()
    );

    expect(capture.enqueueOnboardingReply).toHaveBeenCalledTimes(2);
    expect(capture.enqueueOnboardingReply).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        payload: expect.objectContaining({ text: "a".repeat(18_996) }),
        replyKey: "turn-1:call-1:text:0",
      })
    );
    expect(capture.enqueueOnboardingReply).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        payload: expect.objectContaining({ text: "aaa" }),
        replyKey: "turn-1:call-1:text:1",
      })
    );
    expect(capture.getOnboardingReplyDelivery).toHaveBeenCalledWith({
      bindingId: "binding-enrolled",
      replyKey: "turn-1:call-1:text:1",
    });
    expect(capture.post).not.toHaveBeenCalled();
    expect(finalDeliveryStatus("turn-1")).toBe("completed");
  });

  it("queues an observed-channel input prompt before making its answer eligible", async () => {
    await getSendblueEvent("input.requested")(
      { ...inputRequest(), turnId: "turn-input" },
      { thread },
      channelObservedSessionContext()
    );

    expect(capture.enqueueOnboardingReply).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: "binding-enrolled",
        replyKey:
          "input:root-session-1:binding-enrolled:turn-input:request-1:0",
      })
    );
    expect(capture.drainOnboarding).toHaveBeenCalledWith({
      bindingId: "binding-enrolled",
      kinds: ["outbound_reply"],
    });
    expect(capture.post).not.toHaveBeenCalled();
    expect(capture.setState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`,
      expect.any(Object),
      expect.any(Number)
    );
  });

  it("keeps an observed-channel input prompt recoverable while its durable reply is pending", async () => {
    capture.getOnboardingReplyDelivery.mockResolvedValueOnce({
      kind: "pending",
    });

    await getSendblueEvent("input.requested")(
      { ...inputRequest(), turnId: "turn-input" },
      { thread },
      channelObservedSessionContext()
    );

    expect(capture.post).not.toHaveBeenCalled();
    expect(capture.setState).toHaveBeenCalledWith(
      `pending-input:${thread.id}`,
      expect.objectContaining({
        generation:
          "observed:root-session-1:binding-enrolled:turn-input:request-1",
      }),
      expect.any(Number)
    );
  });

  it("retains an observed input request while its first provider attempt is pending, then resumes it after recovery", async () => {
    let stored: StoredPendingInput | null = null;
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value as StoredPendingInput;
    });
    capture.getState.mockImplementation(async () => stored);
    capture.getOnboardingReplyDelivery.mockResolvedValueOnce({
      kind: "pending",
    });
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });

    await getSendblueEvent("input.requested")(
      { ...inputRequest(), turnId: "turn-input" },
      { thread },
      channelObservedSessionContext()
    );

    expect(stored).toEqual(
      expect.objectContaining({
        generation:
          "observed:root-session-1:binding-enrolled:turn-input:request-1",
        requests: [expect.objectContaining({ requestId: "request-1" })],
      })
    );

    // The schedule can accept the already-persisted prompt later. The next
    // actual inbound answer must still resume Eve, not become an opening task.
    capture.getOnboardingReplyDelivery.mockResolvedValue({
      kind: "provider_accepted",
      providerHandle: "recovered-provider-handle",
    });
    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));

    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.send).toHaveBeenCalledWith(
      { inputResponses: [{ optionId: "approve", requestId: "request-1" }] },
      expect.objectContaining({ thread })
    );
  });

  it("does not erase answered observed input on a replayed same-generation prompt", async () => {
    let stored: StoredPendingInput | null = {
      generation:
        "observed:root-session-1:binding-enrolled:turn-input:request-1",
      requests: pending().requests,
      responses: [{ optionId: "approve", requestId: "request-1" }],
      workspaceId,
    };
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value as StoredPendingInput;
    });

    await getSendblueEvent("input.requested")(
      { ...inputRequest(), turnId: "turn-input" },
      { thread },
      channelObservedSessionContext()
    );

    expect(stored.responses).toEqual([
      { optionId: "approve", requestId: "request-1" },
    ]);
  });

  it("persists the prior observed answer before a delayed second prompt, then resumes both answers", async () => {
    let stored: StoredPendingInput | null = {
      generation: "generation-1",
      requests: [
        firstPendingRequest(),
        {
          allowFreeform: true,
          kind: "question",
          prompt: "What is the second answer?",
          requestId: "request-2",
        },
      ],
      responses: [],
      workspaceId,
    };
    capture.getState.mockImplementation(async () => stored);
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value as StoredPendingInput;
    });
    capture.getOnboardingReplyDelivery.mockResolvedValueOnce({
      kind: "pending",
    });
    capture.resolveChannelEnrollment.mockResolvedValue({
      agentId: "agent-enrolled",
      assurance: "channel_observed",
      authAssurance: "channel_observed",
      bindingId: "binding-enrolled",
      capabilities: ["assistant_basic", "photo_input"],
      capabilityProfile: "channel-basic",
      enrollmentId: "enrollment-enrolled",
      identityProvenance: "sendblue_direct",
      phoneIdentityId: "phone-enrolled",
      principalId: "better-auth:existing-user",
      receiptId: "receipt-enrolled",
      status: "ready",
      userId: "existing-user",
      workspaceId,
    });

    await dispatchSendblueMessage(thread, inbound({ text: "yes" }));

    expect(stored).toEqual(
      expect.objectContaining({
        responses: [{ optionId: "approve", requestId: "request-1" }],
      })
    );
    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();

    capture.getOnboardingReplyDelivery.mockResolvedValue({
      kind: "provider_accepted",
      providerHandle: "recovered-provider-handle",
    });
    await dispatchSendblueMessage(
      thread,
      inbound({ messageId: "message-2", text: "second answer" })
    );

    expect(capture.provisionChannelEnrollment).not.toHaveBeenCalled();
    expect(capture.send).toHaveBeenCalledWith(
      {
        inputResponses: [
          { optionId: "approve", requestId: "request-1" },
          { requestId: "request-2", text: "second answer" },
        ],
      },
      expect.objectContaining({ thread })
    );
  });

  it("queues an observed-channel failure response instead of bypassing its outbound ceiling", async () => {
    await getSendblueEvent("turn.failed")(
      { turnId: "turn-failure" },
      { thread },
      channelObservedSessionContext()
    );

    expect(capture.enqueueOnboardingReply).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: "binding-enrolled",
        replyKey: "turn-failed:root-session-1:turn-failure:0",
      })
    );
    expect(capture.post).not.toHaveBeenCalled();
  });

  it("suppresses the automatic fallback after an unconfirmed progress send", async () => {
    capture.post.mockRejectedValueOnce(new Error("provider timeout"));
    await expect(
      getSendblueEvent("action.result")(action(), { thread }, sessionContext())
    ).rejects.toThrow("provider timeout");
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });
    expect(capture.post).toHaveBeenCalledTimes(1);
  });

  it("allows a distinct final after an uncertain progress send, then blocks its failed final", async () => {
    capture.post.mockRejectedValueOnce(new Error("provider timeout"));
    await expect(
      getSendblueEvent("action.result")(
        action({ callId: "progress-call" }),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow("provider timeout");
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });
    expect(capture.post).toHaveBeenCalledTimes(1);
    expect(finalDeliveryStatus("turn-1")).toBeUndefined();

    const resolve = messaging.events["step.started"];
    if (!resolve) throw new Error("Missing messaging resolver");
    const tools = await resolve(
      { data: { stepIndex: 0, turnId: "turn-1" } },
      {
        channel: { kind: "channel:sendblue" },
        messages: [],
        session: { id: "root", auth: { current: null, initiator: null } },
      }
    );
    if (!tools) throw new Error("Missing same-turn messaging tools");
    const context = {
      ...toolContextFor({ callId: "final-call", sessionId: "root" }),
      session: {
        id: "root",
        auth: { current: null, initiator: null },
        turn: { id: "turn-1", sequence: 0 },
      },
    };
    await tools.send_message.execute(
      { final: true, kind: "message", text: "Final result" },
      context
    );

    capture.post.mockRejectedValueOnce(new Error("final provider timeout"));
    await expect(
      getSendblueEvent("action.result")(
        action({ callId: "final-call", output: { text: "Final result" } }),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow("final provider timeout");
    expect(finalDeliveryStatus("turn-1")).toBe("unconfirmed");
    expect(
      await resolve(
        { data: { stepIndex: 0, turnId: "turn-1" } },
        {
          channel: { kind: "channel:sendblue" },
          messages: [],
          session: { id: "root", auth: { current: null, initiator: null } },
        }
      )
    ).toBeNull();
    await expect(
      Promise.resolve().then(() =>
        tools.send_message.execute(
          { kind: "message", text: "Final result again" },
          context
        )
      )
    ).rejects.toThrow(/not confirmed|do not resend/iu);
    expect(capture.post).toHaveBeenCalledTimes(2);
  });

  it("treats an HTTP-success media response without a handle as unconfirmed", async () => {
    capture.mediaSend.mockResolvedValueOnce({});
    await expect(
      getSendblueEvent("action.result")(
        action({
          output: {
            attachments: [
              { kind: "image", url: "https://media.example/image.png" },
            ],
            kind: "message",
          },
        }),
        { thread },
        sessionContext()
      )
    ).rejects.toThrow(/did not accept/iu);
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });
    expect(capture.post).not.toHaveBeenCalled();
  });

  describe("completion report parts (#157)", () => {
    it("CS-01b: a typed task wake reports two older cohorts and settles both callback claims", async () => {
      const firstCohortId = admitTerminalReport(
        "turn-old-first",
        "call-old-first",
        "The first historical task finished."
      );
      const secondCohortId = admitTerminalReport(
        "turn-old-second",
        "call-old-second",
        "The second historical task finished."
      );
      capture.prepareBrowserImageArtifactDelivery.mockImplementationOnce(
        async (text: string) => ({
          failedArtifactIds: [],
          files: [],
          text,
        })
      );
      const turnStarted = messaging.events["turn.started"];
      const stepStarted = messaging.events["step.started"];
      if (!turnStarted || !stepStarted)
        throw new Error("Missing messaging lifecycle resolvers.");
      const wakeContext = {
        channel: { kind: "channel:sendblue" },
        messages: [
          {
            content:
              "Background task task_synthetic (worker) is completed. This is only test data.",
            role: "user" as const,
          },
        ],
        session: {
          id: "root-session-1",
          auth: { current: null, initiator: null },
        },
        turn: { origin: "background_task" as const },
      };
      await turnStarted({ data: { turnId: "turn-wake" } }, wakeContext);
      const tools = await stepStarted(
        { data: { stepIndex: 0, turnId: "turn-wake" } },
        wakeContext
      );
      if (!tools || !("send_message" in tools))
        throw new Error("Missing SendBlue message tool.");
      const toolContext = toolContextFor({
        callId: "call-wake",
        sessionId: "root-session-1",
      });
      const output = await tools.send_message.execute(
        { final: true, kind: "message", text: "A generic completion message." },
        {
          ...toolContext,
          session: {
            ...toolContext.session,
            turn: { id: "turn-wake", sequence: 1 },
          },
        }
      );

      await getSendblueEvent("action.result")(
        {
          result: {
            callId: "call-wake",
            kind: "tool-result",
            output,
            toolName: "send_message",
          },
          status: "completed",
          stepIndex: 0,
          turnId: "turn-wake",
        },
        { thread },
        sessionContext()
      );

      const message = sendMessageOutputSchema.parse(output);
      expect(message).toMatchObject({
        kind: "message",
        text: expect.stringContaining("The first historical task finished."),
      });
      if (message.kind !== "message") throw new Error("Expected a message.");
      expect(message.text).toContain("The second historical task finished.");
      expect(capture.post).toHaveBeenCalledExactlyOnceWith({
        raw: message.text,
      });
      expect(cohortFor(firstCohortId)).toMatchObject({ phase: "delivered" });
      expect(cohortFor(secondCohortId)).toMatchObject({ phase: "delivered" });
      const claims = [...reportAttempts.durable.values()];
      expect(claims).toHaveLength(2);
      for (const claim of claims) expect(claim.state).toBe("accepted");
    });

    it("CS-01: an accepted text report claims once and dispatches once", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [],
        text: "All done.",
      });

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "All done." } }),
        { thread },
        sessionContext()
      );

      expect(capture.post).toHaveBeenCalledTimes(1);
      const claims = [...reportAttempts.durable.values()];
      expect(claims).toHaveLength(1);
      expect(claims[0]?.state).toBe("accepted");
    });

    it("CS-02/CS-03: each media item's upload and send is its own claimed part, with the provider handle retained", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [
          {
            data: Buffer.from([1]),
            filename: "one.png",
            mimeType: "image/png",
          },
          {
            data: Buffer.from([2]),
            filename: "two.png",
            mimeType: "image/png",
          },
        ],
        text: "Two shots.",
      });
      capture.fetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              media_url: "https://sendblue.example/media/one.png",
              status: "OK",
            }),
            { headers: { "content-type": "application/json" }, status: 201 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              media_url: "https://sendblue.example/media/two.png",
              status: "OK",
            }),
            { headers: { "content-type": "application/json" }, status: 201 }
          )
        );
      capture.mediaSend
        .mockResolvedValueOnce({ message_handle: "handle-one" })
        .mockResolvedValueOnce({ message_handle: "handle-two" });

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "Two shots." } }),
        { thread },
        sessionContext()
      );

      expect(capture.fetch).toHaveBeenCalledTimes(2);
      expect(capture.mediaSend).toHaveBeenCalledTimes(2);
      const claims = [...reportAttempts.durable.entries()];
      const parts = claims.map(([key]) => (JSON.parse(key) as string[]).at(-1));
      expect(new Set(parts)).toEqual(
        new Set([
          "media-upload:0",
          "media-send:0",
          "media-upload:1",
          "media-send:1",
        ])
      );
      expect(claims.every(([, row]) => row.state === "accepted")).toBe(true);
      const sendClaims = new Map(
        claims
          .filter(
            ([key]) => (JSON.parse(key) as string[]).at(-1) === "media-send:0"
          )
          .map(([key, row]) => [key, row])
      );
      const [sendZero] = sendClaims.values();
      expect(sendZero?.providerHandle).toBe("handle-one");
    });

    it("blocks a media send whose owned upload part was not accepted", async () => {
      const cohortId = bindReportObligation("turn-1", "call-1");
      // Simulate a crashed prior attempt: the upload part is durably
      // `attempted`, so recovery must classify it uncertain and never
      // reupload -- and, per #157, the matching send must never begin either.
      reportAttempts.durable.set(
        JSON.stringify([
          workspaceId,
          "root-session-1",
          cohortId,
          0,
          "media-upload:0",
        ]),
        {
          id: "stuck-upload",
          leaseExpiresAt: new Date(Date.now() + 60_000),
          leaseOwner: "owner-that-died",
          providerHandle: null,
          state: "attempted",
          version: 2,
        }
      );
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [
          {
            data: Buffer.from([1]),
            filename: "one.png",
            mimeType: "image/png",
          },
        ],
        text: "One shot.",
      });

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "One shot." } }),
        { thread },
        sessionContext()
      );

      expect(capture.fetch).not.toHaveBeenCalled();
      expect(capture.mediaSend).not.toHaveBeenCalled();
    });

    /**
     * Seeds a part that a previous owner already attempted, so permission comes
     * back refused. That is the only way to reach the channel's refusal
     * branches, and without it a mutation removing them survives.
     */
    function seedUncertainPart(part: string, turnId = "turn-1") {
      reportAttempts.durable.set(
        reportPartKeyOf({
          cohortId: `cohort-${turnId}`,
          part,
          reportRevision: 0,
          rootSessionId: "root-session-1",
          workspaceId,
        }),
        {
          id: `${part}-prior-attempt`,
          leaseExpiresAt: new Date(Date.now() + 60_000),
          leaseOwner: "an-owner-that-crashed",
          providerHandle: null,
          state: "attempted",
          version: 2,
        }
      );
    }

    it("CS-05b: a refused media send is not treated as sent", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [],
        text: "Here it is.",
      });
      seedUncertainPart("media-send:0");

      await getSendblueEvent("action.result")(
        action({
          output: {
            attachments: [
              { kind: "image", url: "https://media.example/one.png" },
            ],
            kind: "message",
            text: "Here it is.",
          },
        }),
        { thread },
        sessionContext()
      );

      // The send may already have reached the provider under the prior owner,
      // so this call must not send and must not ledger usage as though it had.
      expect(capture.mediaSend).not.toHaveBeenCalled();
      expect(capture.recordUsageEvent).not.toHaveBeenCalled();
    });

    it("CS-11b: a refused upload stops before its media send", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [
          {
            data: Buffer.from([1]),
            filename: "one.png",
            mimeType: "image/png",
          },
        ],
        text: "Here it is.",
      });
      seedUncertainPart("media-upload:0");

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "Here it is." } }),
        { thread },
        sessionContext()
      );

      // An upload that may already have happened is never repeated, and with no
      // media URL in hand there is nothing to send.
      expect(capture.fetch).not.toHaveBeenCalled();
      expect(capture.mediaSend).not.toHaveBeenCalled();
    });

    it("CS-04: a known pre-dispatch rejection leaves no attempted part and no provider call", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.decodeThreadId.mockReturnValueOnce({
        contactNumber: undefined,
        fromNumber: "+12025550123",
      });
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [
          {
            data: Buffer.from([1]),
            filename: "one.png",
            mimeType: "image/png",
          },
        ],
        text: "One shot.",
      });

      await expect(
        getSendblueEvent("action.result")(
          action({ output: { kind: "message", text: "One shot." } }),
          { thread },
          sessionContext()
        )
      ).rejects.toThrow(/configured 1:1 sender line/iu);

      expect(reportAttempts.durable.size).toBe(0);
      expect(capture.fetch).not.toHaveBeenCalled();
      expect(capture.mediaSend).not.toHaveBeenCalled();
      expect(capture.post).not.toHaveBeenCalled();
    });

    it("CS-05: a send that never confirms is left attempted and unconfirmed, with no retry", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [],
        text: "All done.",
      });
      capture.post.mockRejectedValueOnce(new Error("timed out"));

      await expect(
        getSendblueEvent("action.result")(
          action({ output: { kind: "message", text: "All done." } }),
          { thread },
          sessionContext()
        )
      ).rejects.toThrow("timed out");

      const [claim] = [...reportAttempts.durable.values()];
      expect(claim?.state).toBe("unconfirmed");
      expect(capture.post).toHaveBeenCalledTimes(1);

      // A second delivery of the same event -- a replayed callback -- must not
      // call the provider again: the part is already terminal.
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValueOnce({
        failedArtifactIds: [],
        files: [],
        text: "All done.",
      });
      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "All done." } }),
        { thread },
        sessionContext()
      );
      expect(capture.post).toHaveBeenCalledTimes(1);
    });

    it("CS-06: a replayed callback for an already-accepted report does not dispatch again", async () => {
      bindReportObligation("turn-1", "call-1");
      capture.prepareBrowserImageArtifactDelivery.mockResolvedValue({
        failedArtifactIds: [],
        files: [],
        text: "All done.",
      });

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "All done." } }),
        { thread },
        sessionContext()
      );
      expect(capture.post).toHaveBeenCalledTimes(1);

      await getSendblueEvent("action.result")(
        action({ output: { kind: "message", text: "All done." } }),
        { thread },
        sessionContext()
      );
      expect(capture.post).toHaveBeenCalledTimes(1);
    });
  });
});

function inbound(
  overrides: Partial<{
    readonly attachments: readonly unknown[];
    readonly messageId: string;
    readonly text: string;
  }> = {}
): Parameters<typeof dispatchSendblueMessage>[1] {
  const messageId = overrides.messageId ?? "message-1";
  return {
    attachments: [],
    author: { isBot: false, userName: "+12025550199" },
    id: messageId,
    raw: {
      accountEmail: "account@example.test",
      content: "hello",
      from_number: "+12025550199",
      group_id: "",
      is_outbound: false,
      message_handle: messageId,
      message_type: "message",
      sendblue_number: "+12025550123",
      service: "iMessage",
      status: "RECEIVED",
      to_number: "+12025550123",
    },
    text: "hello",
    ...overrides,
  } as unknown as Parameters<typeof dispatchSendblueMessage>[1];
}

function readyEnrollment() {
  return {
    agentId: "agent-enrolled",
    assurance: "channel_observed" as const,
    authAssurance: "channel_observed" as const,
    bindingId: "binding-enrolled",
    capabilities: ["assistant_basic", "photo_input"] as const,
    capabilityProfile: "channel-basic" as const,
    enrollmentId: "enrollment-enrolled",
    identityProvenance: "sendblue_direct" as const,
    phoneIdentityId: "phone-enrolled",
    principalId: "existing-user",
    receiptId: "receipt-enrolled",
    status: "ready" as const,
    userId: "existing-user",
    workspaceId,
  };
}

function heicBytes(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  ]);
}

function onePixelJpeg(): Buffer {
  return Buffer.from(
    "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z",
    "base64"
  );
}

const eveFilePartSchema = z.object({
  data: z.instanceof(URL),
  filename: z.string(),
  mediaType: z.string(),
  type: z.literal("file"),
});

function decodeJpeg(bytes: Uint8Array): { height: number; width: number } {
  const requireFromHeicConvert = createRequire(require.resolve("heic-convert"));
  const jpeg = requireFromHeicConvert("jpeg-js") as {
    decode(input: Uint8Array): { height: number; width: number };
  };
  return jpeg.decode(bytes);
}

function pending() {
  return {
    requests: [
      {
        allowFreeform: false,
        kind: "tool-approval",
        options: [
          { id: "approve", label: "Approve" },
          { id: "cancel", label: "Cancel" },
        ],
        prompt: "Approve the operation",
        requestId: "request-1",
      },
    ],
    workspaceId,
  };
}

function firstPendingRequest() {
  const [request] = pending().requests;
  if (!request) throw new Error("Missing synthetic pending request.");
  return request;
}

function inputRequest(overrides: Partial<{ readonly requestId: string }> = {}) {
  return {
    requests: [
      {
        allowFreeform: false,
        kind: "tool-approval",
        options: [
          { id: "approve", label: "Approve" },
          { id: "cancel", label: "Cancel" },
        ],
        prompt: "Approve provider-internal-write",
        requestId: "request-1",
        ...overrides,
      },
    ],
  };
}

function sessionContext() {
  return {
    session: {
      auth: {
        current: {
          attributes: { workspaceId },
          principalId: "better-auth:alice",
          principalType: "user",
        },
      },
      id: "root-session-1",
    },
  };
}

function channelObservedSessionContext() {
  return {
    session: {
      auth: {
        initiator: {
          attributes: {
            authAssurance: "channel_observed",
            capabilityProfile: "channel-basic",
            channelBindingId: "binding-enrolled",
            conversationChannel: "sendblue",
            conversationId: thread.id,
            identityProvenance: "sendblue_direct",
            workspaceId,
          },
          authenticator: "sendblue-message",
          principalId: "better-auth:existing-user",
          principalType: "user",
        },
      },
      id: "root-session-1",
    },
  };
}

function action(
  overrides: {
    readonly callId?: string;
    readonly output?: Partial<{
      readonly attachments: readonly {
        readonly kind: string;
        readonly url: string;
      }[];
      readonly kind: string;
      readonly text: string;
    }>;
  } = {}
) {
  return {
    result: {
      callId: overrides.callId ?? "call-1",
      kind: "tool-result",
      output: { kind: "message", text: "progress", ...overrides.output },
      toolName: "send_message",
    },
    status: "completed",
    stepIndex: 0,
    turnId: "turn-1",
  };
}

function beginFinalMessageDelivery() {
  beginFinalDelivery("turn-1", "call-1", true);
}
