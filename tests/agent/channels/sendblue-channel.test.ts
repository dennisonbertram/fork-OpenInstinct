import type { Thread } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  extendLock: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  findIdentity: vi.fn(),
  findOne: vi.fn(),
  getState: vi.fn(),
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
  checkBudget: vi.fn(),
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
  env: {
    DATABASE_URL: "postgres://synthetic",
    SENDBLUE_ACCOUNT_ID: "account@example.test",
    SENDBLUE_API_KEY_ID: "key",
    SENDBLUE_API_SECRET_KEY: "secret",
    SENDBLUE_CONVERSATIONS: "on",
    SENDBLUE_FROM_NUMBER: "+12025550123",
    SENDBLUE_WEBHOOK_SECRET: "webhook-secret",
  },
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
vi.mock("eve/channels/chat-sdk", () => ({
  chatSdkChannel: (config: unknown) => {
    capture.events = config;
    return {
      bot: { onDirectMessage: vi.fn() },
      channel: {},
      send: capture.send,
    };
  },
  messageToUserContent: (message: { readonly text: string }) => message.text,
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
    reset: () => {
      durable.clear();
    },
  };
});
vi.mock("@/db/services/completion-report-attempts", () => ({
  claimCompletionReportPart: reportAttempts.claimCompletionReportPart,
  markAccepted: reportAttempts.markAccepted,
  markProviderAttempted: reportAttempts.markProviderAttempted,
  markUnconfirmed: reportAttempts.markUnconfirmed,
}));

const { admitTask, beginCohortReport, recordTerminal } =
  await import("@/agent/lib/completion-obligations");

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

const { dispatchSendblueMessage } = await import("@/agent/channels/sendblue");
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
  capture.send.mockResolvedValue(undefined);
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
  it("admits a verified bound sender and sends the user turn", async () => {
    await dispatchSendblueMessage(thread, inbound());
    expect(capture.markRead).toHaveBeenCalledWith(thread.id);
    expect(capture.send).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ thread })
    );
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
      dispatchSendblueMessage(thread, inbound({ text: "cancel" }))
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

  it.each(["no", "cancel"])(
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
      () =>
        capture.findOne.mockResolvedValue({
          id: "alice",
          phoneNumberVerified: false,
        }),
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
      { data: { turnId: "turn-1" } },
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
        { data: { turnId: "turn-1" } },
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
  overrides: Partial<{ readonly text: string }> = {}
): Parameters<typeof dispatchSendblueMessage>[1] {
  return {
    author: { isBot: false, userName: "+12025550199" },
    id: "message-1",
    raw: {
      accountEmail: "account@example.test",
      content: "hello",
      from_number: "+12025550199",
      group_id: "",
      is_outbound: false,
      message_handle: "message-1",
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
