import type { Thread } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";

// oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, vitest/require-mock-type-parameters -- adapter and Eve are owning boundaries; this suite uses only synthetic fixtures.

const capture = vi.hoisted(() => ({
  addReaction: vi.fn(),
  acquireLock: vi.fn(),
  claim: vi.fn(),
  createBinding: vi.fn(),
  decodeThreadId: vi.fn(),
  deleteState: vi.fn(),
  extendLock: vi.fn(),
  findIdentity: vi.fn(),
  findOne: vi.fn(),
  getState: vi.fn(),
  markRead: vi.fn(),
  mediaSend: vi.fn(),
  post: vi.fn(),
  resolveBinding: vi.fn(),
  resolveVerifiedBinding: vi.fn(),
  releaseLock: vi.fn(),
  send: vi.fn(),
  events: undefined as unknown,
  setState: vi.fn(),
  stateConnect: vi.fn(),
  verifier: vi.fn(),
}));

vi.mock("eve/context", () => ({
  defineState: <T>(_name: string, initial: () => T) => {
    let value = initial();
    return {
      get: () => value,
      update: (updater: (current: T) => T) => {
        value = updater(value);
      },
    };
  },
  requestTurnCompletion: vi.fn(),
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
vi.mock("@/db/services/scope", () => ({ verifyScopeAccess: capture.verifier }));
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

beforeEach(() => {
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

  it("maps cancellation to the same pending Eve request", async () => {
    capture.getState.mockResolvedValue(pending());
    await dispatchSendblueMessage(thread, inbound({ text: "cancel" }));
    expect(capture.send).toHaveBeenCalledWith(
      { inputResponses: [{ optionId: "cancel", requestId: "request-1" }] },
      expect.any(Object)
    );
  });

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
      raw: expect.stringContaining("cancel"),
    });
    expect(capture.post.mock.calls[0]?.[0].raw).not.toContain(
      "provider-internal-write"
    );
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

  it("retains every collected response when Eve rejects the final acknowledgement", async () => {
    let stored: unknown;
    capture.getState.mockResolvedValue({
      ...pending(),
      responses: [{ optionId: "approve", requestId: "request-1" }],
      requests: [
        pending().requests[0],
        {
          allowFreeform: true,
          kind: "question",
          prompt: "What is the second answer?",
          requestId: "request-2",
        },
      ],
    });
    capture.setState.mockImplementation(async (_key, value) => {
      stored = value;
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
      { thread }
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
      getSendblueEvent("action.result")(action(), { thread })
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
      getSendblueEvent("action.result")(action(), { thread })
    ).rejects.toThrow("provider timeout");
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });
    expect(capture.post).toHaveBeenCalledTimes(1);
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
        { thread }
      )
    ).rejects.toThrow(/did not accept/iu);
    await getSendblueEvent("turn.failed")({ turnId: "turn-1" }, { thread });
    expect(capture.post).not.toHaveBeenCalled();
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

function action(
  overrides: {
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
      callId: "call-1",
      kind: "tool-result",
      output: { kind: "message", text: "progress", ...overrides.output },
      toolName: "send_message",
    },
    status: "completed",
    stepIndex: 0,
    turnId: "turn-1",
  };
}
