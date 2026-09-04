import { Message } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessScopeForUser } from "@/lib/access-scope";

interface PendingInputStateFixture {
  readonly requests: readonly {
    readonly allowFreeform?: boolean;
    readonly options?: readonly {
      readonly id: string;
      readonly label: string;
    }[];
    readonly requestId: string;
  }[];
  readonly workspaceId: string;
}

const mocks = vi.hoisted(() => ({
  claimInboundMessage: vi.fn<() => Promise<boolean>>(),
  createBinding:
    vi.fn<() => Promise<{ readonly workspaceId: string } | undefined>>(),
  findOne:
    vi.fn<
      () => Promise<
        { readonly id: string; readonly phoneNumberVerified: true } | undefined
      >
    >(),
  findIdentity:
    vi.fn<
      () => Promise<
        | { readonly phoneIdentityId: string; readonly userId: string }
        | undefined
      >
    >(),
  enabled: vi.fn<() => boolean>(),
  recordInstallation: vi.fn<() => Promise<void>>(),
  resolveBinding:
    vi.fn<() => Promise<{ readonly workspaceId: string } | undefined>>(),
  verifyScope:
    vi.fn<() => Promise<{ readonly workspaceId: string } | undefined>>(),
  deleteState: vi.fn<(key: string) => Promise<void>>(),
  getState: vi.fn<(key: string) => Promise<PendingInputStateFixture | null>>(),
}));
vi.mock("@chat-adapter/state-pg", () => ({
  createPostgresState: () => ({
    delete: mocks.deleteState,
    get: mocks.getState,
    set: vi.fn<() => void>(),
  }),
}));
vi.mock("@/auth", () => ({
  getAuth: vi.fn<
    () => Promise<{
      readonly $context: Promise<{
        readonly adapter: { readonly findOne: typeof mocks.findOne };
      }>;
    }>
  >(async () => ({
    $context: Promise.resolve({ adapter: { findOne: mocks.findOne } }),
  })),
}));
vi.mock("@/env", () => ({
  env: { LINQ_CONNECTOR: "linq/test", LINQ_PHONE_NUMBER: "+12025550999" },
  isWorkspaceScopeEnforcementEnabled: mocks.enabled,
}));
vi.mock("@/db/services/scope", () => ({
  verifyScopeAccess: mocks.verifyScope,
}));
vi.mock("@/db/services/channel-conversations", () => ({
  claimConversationInboundMessage: mocks.claimInboundMessage,
  createConversationBinding: mocks.createBinding,
  resolveConversationBinding: mocks.resolveBinding,
}));
vi.mock("@/db/services/connection-installations", () => ({
  recordConnectionInstallation: mocks.recordInstallation,
}));
vi.mock("@/db/services/phone-identities", () => ({
  findVerifiedUserByPhoneNumber: mocks.findIdentity,
}));

const { linqChannelConfig } = await import("../../agent/channels/linq");
type OnMessage = typeof linqChannelConfig.onMessage;
type Context = Parameters<OnMessage>[0];
const workspaceId = accessScopeForUser("better-auth:alice").workspaceId;

interface ThreadIdentity {
  readonly thread: Pick<Context["thread"], "id">;
}

function context(threadId?: string): Context {
  const identity: ThreadIdentity = { thread: { id: threadId ?? "" } };
  // SAFETY: The inbound policy reads only the thread id from this context.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A complete Chat SDK thread mock would add unrelated methods.
  return identity as Context;
}

function message(id = "linq-message-1", text = "list my vault items") {
  return new Message({
    attachments: [],
    author: {
      fullName: "+12025550123",
      isBot: false,
      isMe: false,
      userId: "linq-user",
      userName: "+12025550123",
    },
    formatted: { children: [], type: "root" },
    id,
    metadata: {
      dateSent: new Date("2026-09-03T00:00:00.000Z"),
      edited: false,
    },
    raw: {},
    text,
    threadId: "linq:dm:chat-1",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(false);
  mocks.findOne.mockResolvedValue(undefined);
  mocks.findIdentity.mockResolvedValue(undefined);
  mocks.resolveBinding.mockResolvedValue(undefined);
  mocks.createBinding.mockResolvedValue(undefined);
  mocks.claimInboundMessage.mockResolvedValue(true);
  mocks.recordInstallation.mockResolvedValue(undefined);
  mocks.deleteState.mockResolvedValue(undefined);
  mocks.getState.mockResolvedValue(null);
});

describe("Linq channel scope", () => {
  it("requires membership verification before authorizing a channel message", async () => {
    // An unlinked handle is rejected earlier by the inbound guard, so a
    // verified user is needed to reach the workspace membership check.
    mocks.findOne.mockResolvedValue({ id: "alice", phoneNumberVerified: true });
    mocks.verifyScope.mockResolvedValue(undefined);
    expect(await linqChannelConfig.onMessage(context(), message())).toBeNull();
    expect(mocks.verifyScope).toHaveBeenCalled();
  });
  it("drops a denied scope while enforcement is on", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.verifyScope.mockResolvedValue(undefined);
    await expect(
      linqChannelConfig.onMessage(context(), message())
    ).resolves.toBeNull();
  });
  it("drops an existing binding owned by another workspace", async () => {
    allowAlice();
    mocks.resolveBinding.mockResolvedValue(binding("workspace:other"));
    await expect(
      linqChannelConfig.onMessage(context("linq:chat-1:dm"), message())
    ).resolves.toBeNull();
  });
  it("fails closed when no active agent can create a binding", async () => {
    allowAlice();
    expect(
      await linqChannelConfig.onMessage(context("linq:chat-1:dm"), message())
    ).toBeNull();
    expect(mocks.createBinding).toHaveBeenCalledOnce();
  });
  it("records the Linq installation for a newly bound workspace", async () => {
    allowAlice();
    mocks.createBinding.mockResolvedValue(binding(workspaceId));
    await linqChannelConfig.onMessage(context("linq:chat-1:dm"), message());
    expect(mocks.recordInstallation).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        authorizationSubject: "+12025550999",
        connectorId: "linq/test",
        provider: "linq",
      })
    );
  });
  it("keeps the message when installation recording fails", async () => {
    allowAlice();
    mocks.createBinding.mockResolvedValue(binding(workspaceId));
    mocks.recordInstallation.mockRejectedValue(
      new Error("database unavailable")
    );
    expect(
      await linqChannelConfig.onMessage(context("linq:chat-1:dm"), message())
    ).not.toBeNull();
  });
  it("does not re-record an installation for an existing binding", async () => {
    allowAlice();
    mocks.resolveBinding.mockResolvedValue(binding(workspaceId));
    await linqChannelConfig.onMessage(context("linq:chat-1:dm"), message());
    expect(mocks.recordInstallation).not.toHaveBeenCalled();
  });
  it("drops a duplicate inbound message before Eve starts another turn", async () => {
    allowAlice();
    mocks.resolveBinding.mockResolvedValue(binding(workspaceId));
    mocks.claimInboundMessage.mockResolvedValue(false);

    await expect(
      linqChannelConfig.onMessage(
        context("linq:chat-1:dm"),
        message("linq-message-retried")
      )
    ).resolves.toBeNull();
    expect(mocks.claimInboundMessage).toHaveBeenCalledWith({
      bindingId: "binding-1",
      messageId: "linq-message-retried",
      workspaceId,
    });
  });
  it("turns an exact approval reply into the pending Eve input response", async () => {
    allowAlice();
    mocks.resolveBinding.mockResolvedValue(binding(workspaceId));
    mocks.getState.mockResolvedValue({
      requests: [
        {
          allowFreeform: false,
          options: [
            { id: "approve", label: "Approve" },
            { id: "cancel", label: "Cancel" },
          ],
          requestId: "approval-1",
        },
      ],
      workspaceId,
    });

    await expect(
      linqChannelConfig.onMessage(
        context("linq:chat-1:dm"),
        message("linq-message-approval", "  approve  ")
      )
    ).resolves.toMatchObject({
      inputResponseStateKey: "pending-input:linq:chat-1:dm",
      inputResponses: [{ optionId: "approve", requestId: "approval-1" }],
    });
    expect(mocks.deleteState).not.toHaveBeenCalled();
  });
  it("does not consume pending input owned by another workspace", async () => {
    allowAlice();
    mocks.resolveBinding.mockResolvedValue(binding(workspaceId));
    mocks.getState.mockResolvedValue({
      requests: [
        {
          allowFreeform: false,
          options: [{ id: "approve", label: "Approve" }],
          requestId: "approval-other",
        },
      ],
      workspaceId: "workspace:other",
    });

    await expect(
      linqChannelConfig.onMessage(
        context("linq:chat-1:dm"),
        message("linq-message-approval", "approve")
      )
    ).resolves.not.toHaveProperty("inputResponses");
    expect(mocks.deleteState).not.toHaveBeenCalled();
  });
  it("does not attempt a binding when the phone identity belongs to another user", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.verifyScope.mockResolvedValue(scope());
    mocks.findOne.mockResolvedValue({ id: "alice", phoneNumberVerified: true });
    mocks.findIdentity.mockResolvedValue({
      phoneIdentityId: "identity-bob",
      userId: "bob",
    });
    await linqChannelConfig.onMessage(context("linq:chat-1:dm"), message());
    expect(mocks.resolveBinding).not.toHaveBeenCalled();
    expect(mocks.createBinding).not.toHaveBeenCalled();
  });
});
function allowAlice() {
  mocks.enabled.mockReturnValue(true);
  mocks.verifyScope.mockResolvedValue(scope());
  mocks.findOne.mockResolvedValue({ id: "alice", phoneNumberVerified: true });
  mocks.findIdentity.mockResolvedValue({
    phoneIdentityId: "identity-alice",
    userId: "alice",
  });
}
function scope() {
  return {
    membershipStatus: "active",
    role: "owner",
    userId: "alice",
    workspaceId,
  };
}
function binding(bindingWorkspaceId: string) {
  return {
    agentId: "agent-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    id: "binding-1",
    pinnedRevisionId: "revision-1",
    platformLine: {
      connectorId: "linq/test",
      createdAt: "2026-09-01T00:00:00.000Z",
      environment: null,
      id: "line-1",
      provider: "linq",
      providerLineId: "+12025550999",
      status: "active",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    platformLineId: "line-1",
    provider: "linq",
    providerAccountId: "linq",
    providerConversationId: "chat-1",
    status: "active",
    updatedAt: "2026-09-01T00:00:00.000Z",
    workspaceId: bindingWorkspaceId,
  };
}
