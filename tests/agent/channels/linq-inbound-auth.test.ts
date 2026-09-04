import { Message } from "chat";
import { accessScopeForUser } from "@/lib/access-scope";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "@/env";

interface AuthUserRow {
  readonly id: string;
  readonly phoneNumberVerified: boolean;
}

const capture = vi.hoisted(() => ({
  findOne: vi.fn<() => Promise<AuthUserRow | null>>(),
  // The fork verifies the workspace scope and binds the conversation before it
  // mints a principal. Stub those stores so this suite stays a pure auth test.
  findIdentity:
    vi.fn<
      () => Promise<
        | { readonly phoneIdentityId: string; readonly userId: string }
        | undefined
      >
    >(),
  recordInstallation: vi.fn<() => Promise<void>>(),
  claimInboundMessage: vi.fn<() => Promise<boolean>>(),
  resolveBinding:
    vi.fn<
      () => Promise<
        { readonly id: string; readonly workspaceId: string } | undefined
      >
    >(),
  verifyScope:
    vi.fn<() => Promise<{ readonly workspaceId: string } | undefined>>(),
  getState: vi.fn<() => Promise<null>>(),
}));
vi.mock("@chat-adapter/state-pg", () => ({
  createPostgresState: () => ({
    delete: vi.fn<() => Promise<void>>(),
    get: capture.getState,
    set: vi.fn<() => Promise<void>>(),
  }),
}));
vi.mock("@/db/services/scope", () => ({
  verifyScopeAccess: capture.verifyScope,
}));
vi.mock("@/db/services/channel-conversations", () => ({
  claimConversationInboundMessage: capture.claimInboundMessage,
  createConversationBinding:
    vi.fn<() => Promise<{ readonly workspaceId: string } | undefined>>(),
  resolveConversationBinding: capture.resolveBinding,
}));
vi.mock("@/db/services/connection-installations", () => ({
  recordConnectionInstallation: capture.recordInstallation,
}));
vi.mock("@/db/services/phone-identities", () => ({
  findVerifiedUserByPhoneNumber: capture.findIdentity,
}));

vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof EnvModule>();
  return {
    ...original,
    env: {
      ...original.env,
      LINQ_CONNECTOR: "linq/test",
      LINQ_PHONE_NUMBER: "+12025550999",
    },
  };
});
vi.mock("@vercel/connect/eve", () => ({
  connectLinqCredentials: () => ({ apiKey: async () => "linq-test-api-key" }),
}));
vi.mock("@/auth", () => ({
  getAuth: async () => ({
    $context: Promise.resolve({ adapter: { findOne: capture.findOne } }),
  }),
}));

const { linqChannelConfig } = await import("@/agent/channels/linq");
const verifier = linqChannelConfig.credentials.webhookVerifier;
const onMessage = (...args: Parameters<typeof linqChannelConfig.onMessage>) =>
  linqChannelConfig.onMessage(...args);

describe("Linq inbound authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a webhook without a forwarder credential", async () => {
    const request = new Request("https://assistant.example/eve/v1/linq", {
      body: "{}",
      method: "POST",
    });
    await expect(verifier(request, new Uint8Array())).resolves.toBe(false);
  });

  it("rejects a webhook with a malformed bearer token", async () => {
    const request = new Request("https://assistant.example/eve/v1/linq", {
      body: "{}",
      headers: { authorization: "Bearer aaa.bbb.ccc" },
      method: "POST",
    });
    await expect(verifier(request, new Uint8Array())).resolves.toBe(false);
  });

  it("drops messages from handles that are not linked to a verified user", async () => {
    capture.findOne.mockResolvedValue(null);

    await expect(
      onMessage(threadContext(), linqMessage("+15550100011"))
    ).resolves.toBeNull();
    expect(capture.findOne).toHaveBeenCalledExactlyOnceWith({
      model: "user",
      where: [{ field: "phoneNumber", value: "+15550100011" }],
    });
  });

  it("drops messages from handles whose user has not verified the phone", async () => {
    capture.findOne.mockResolvedValue({
      id: "user-1",
      phoneNumberVerified: false,
    });

    await expect(
      onMessage(threadContext(), linqMessage("+15550100011"))
    ).resolves.toBeNull();
  });

  it("scopes a verified handle to that user's own workspace", async () => {
    capture.findOne.mockResolvedValue({
      id: "user-1",
      phoneNumberVerified: true,
    });
    const workspaceId = accessScopeForUser("better-auth:user-1").workspaceId;
    capture.verifyScope.mockResolvedValue({ workspaceId });
    capture.findIdentity.mockResolvedValue({
      phoneIdentityId: "phone-1",
      userId: "user-1",
    });
    capture.resolveBinding.mockResolvedValue({ id: "binding-1", workspaceId });
    capture.claimInboundMessage.mockResolvedValue(true);

    const result = await onMessage(
      threadContext(),
      linqMessage("+15550100011")
    );

    expect(result?.auth?.principalId).toBe("better-auth:user-1");
    expect(result?.auth?.attributes).toMatchObject({
      conversationChannel: "linq",
      conversationId: "linq:dm:chat-1",
      phoneNumber: "+15550100011",
    });
    expect(result?.auth?.attributes.workspaceId).toMatch(
      /^personal:[0-9a-f]{32}$/
    );
  });
});

type InboundContext = Parameters<typeof onMessage>[0];

interface ThreadIdentity {
  readonly thread: Pick<InboundContext["thread"], "id">;
}

function threadContext(): InboundContext {
  const identity: ThreadIdentity = { thread: { id: "linq:dm:chat-1" } };
  // SAFETY: The inbound policy reads only the thread id from this context.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A complete Chat SDK thread mock would add unrelated methods.
  return identity as InboundContext;
}

function linqMessage(handle: string) {
  return new Message({
    attachments: [],
    author: {
      fullName: handle,
      isBot: false,
      isMe: false,
      userId: handle,
      userName: handle,
    },
    formatted: { children: [], type: "root" },
    id: "message-1",
    metadata: {
      dateSent: new Date("2026-09-03T00:00:00.000Z"),
      edited: false,
    },
    raw: {},
    text: "list my vault items",
    threadId: "linq:dm:chat-1",
  });
}
