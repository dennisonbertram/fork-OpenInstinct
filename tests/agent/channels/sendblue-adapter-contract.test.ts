import { createSendblueAdapter } from "chat-adapter-sendblue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "@/env";
import {
  defineInboundProviderContract,
  defineMessagingProviderContract,
} from "./provider-contract";

// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- this focused package-boundary test inspects synthetic SDK request JSON.

const line = "+12025550123";
const contact = "+12025550199";
const fetchMock = vi.fn<typeof fetch>();
interface CapturedSendblueChannelConfig {
  readonly adapters: {
    readonly sendblue: { handleWebhook(request: Request): Promise<Response> };
  };
  readonly events: {
    readonly "input.requested"?: (
      event: {
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
      },
      context: {
        readonly thread: {
          readonly id: string;
          post(message: {
            readonly raw: string;
          }): Promise<{ readonly id: string }>;
        };
      },
      session: {
        readonly session: {
          readonly auth: {
            readonly current: unknown;
            readonly initiator: unknown;
          };
        };
      }
    ) => Promise<void>;
  };
}
const channelCapture = vi.hoisted(() => ({
  acquireLock: vi
    .fn<() => Promise<Record<string, never>>>()
    .mockResolvedValue({}),
  config: undefined as unknown,
  extendLock: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  releaseLock: vi.fn<() => Promise<void>>(),
  setState: vi.fn<() => Promise<void>>(),
}));
const usageCapture = vi.hoisted(() => ({
  checkBudget: vi.fn<() => Promise<void>>(),
  recordUsageEvent: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@chat-adapter/state-pg", () => ({
  createPostgresState: () => ({
    acquireLock: channelCapture.acquireLock,
    connect: vi.fn<() => Promise<void>>(),
    delete: vi.fn<() => Promise<void>>(),
    extendLock: channelCapture.extendLock,
    get: vi.fn<() => Promise<null>>(),
    releaseLock: channelCapture.releaseLock,
    set: channelCapture.setState,
    setIfNotExists: vi.fn<() => Promise<boolean>>(),
  }),
}));
vi.mock("eve/channels/chat-sdk", () => ({
  chatSdkChannel: (config: unknown) => {
    channelCapture.config = config;
    return {
      bot: { onDirectMessage: vi.fn<() => void>() },
      channel: {},
      send: vi.fn<() => Promise<void>>(),
    };
  },
  messageToUserContent: vi.fn<() => string>(),
}));
vi.mock("@/agent/lib/principal-scope", () => ({
  scopeFromPrincipal: () => ({ workspaceId: "workspace-provider-contract" }),
}));
vi.mock("@/db/services/usage", async (importOriginal) => ({
  ...(await importOriginal()),
  checkBudget: usageCapture.checkBudget,
  recordUsageEvent: usageCapture.recordUsageEvent,
}));
vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof EnvModule>();
  return {
    ...original,
    env: {
      ...original.env,
      SENDBLUE_ACCOUNT_ID: "sendblue-account",
      SENDBLUE_CONVERSATIONS: "on",
      SENDBLUE_FROM_NUMBER: line,
      SENDBLUE_WEBHOOK_SECRET: "sendblue-webhook-secret",
    },
  };
});

await import("@/agent/channels/sendblue");

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("patched SendBlue adapter outbound contract", () => {
  it("sends a Chat SDK raw message once with the configured sender", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      providerResponse({ message_handle: "sent-text" })
    );
    const adapter = createAdapter();

    await adapter.postMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      {
        raw: "one logical reply",
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchMock)).toMatchObject({
      content: "one logical reply",
      from_number: line,
      number: contact,
    });
  });

  it("sends a native URL image with no second text request", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      providerResponse({ message_handle: "sent-image" })
    );
    const adapter = createAdapter();

    await adapter.sendMediaMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      "https://media.example/reference.png",
      ""
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchMock)).toMatchObject({
      content: "",
      from_number: line,
      media_url: "https://media.example/reference.png",
      number: contact,
    });
  });

  it("refuses another SendBlue line before making a provider request", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createAdapter();

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({
          contactNumber: contact,
          fromNumber: "+12025550999",
        }),
        { raw: "wrong line" }
      )
    ).rejects.toThrow(/configured line/iu);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    new Error("timeout"),
    providerResponse({ error: "temporary" }, 500),
  ])("does not retry an uncertain provider result (%s)", async (result) => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    const adapter = createAdapter();

    await expect(
      adapter.postMessage(
        adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
        { raw: "do not retry" }
      )
    ).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty provider handle for a HTTP-success error body", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(providerResponse({ error: "not accepted" }));
    const adapter = createAdapter();

    const result = await adapter.postMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      { raw: "provider error" }
    );

    expect(result.id).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

defineMessagingProviderContract("SendBlue", () => ({
  async addReaction() {
    mockProviderResponse({});
    const adapter = createAdapter();
    await adapter.addReaction(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      "message-handle",
      "heart"
    );
    const paths = providerRequestPaths();
    return {
      messageCount: paths.filter((path) => path === "/api/send-message").length,
      reactionCount: paths.filter((path) => path === "/api/send-reaction")
        .length,
    };
  },
  async requestApproval(toolName) {
    const config = capturedChannelConfig();
    const inputRequested = config.events["input.requested"];
    if (!inputRequested)
      throw new Error("Missing SendBlue input request handler.");
    const post = vi
      .fn<
        (message: { readonly raw: string }) => Promise<{ readonly id: string }>
      >()
      .mockResolvedValue({ id: "approval-prompt" });
    await inputRequested(
      {
        requests: [
          {
            allowFreeform: false,
            kind: "tool-approval",
            options: [
              { id: "approve", label: "Approve" },
              { id: "cancel", label: "Cancel" },
            ],
            prompt: `Approve tool call: ${toolName}`,
            requestId: "provider-contract-approval",
          },
        ],
      },
      { thread: { id: "sendblue:provider-contract", post } },
      { session: { auth: { current: {}, initiator: null } } }
    );
    const raw = post.mock.calls[0]?.[0];
    return raw?.raw ?? "";
  },
  async sendImage(url) {
    mockProviderResponse({ message_handle: "sent-image" });
    const adapter = createAdapter();
    await adapter.sendMediaMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      url,
      ""
    );
    const mediaUrl = requestBody(fetchMock).media_url;
    if (typeof mediaUrl !== "string")
      throw new Error("Missing native SendBlue media URL.");
    return {
      attachmentUrls: [mediaUrl],
      messageCount: fetchMock.mock.calls.length,
    };
  },
  async sendText(text) {
    mockProviderResponse({ message_handle: "sent-text" });
    const adapter = createAdapter();
    await adapter.postMessage(
      adapter.encodeThreadId({ contactNumber: contact, fromNumber: line }),
      { raw: text }
    );
    const content = requestBody(fetchMock).content;
    if (typeof content !== "string")
      throw new Error("Missing SendBlue message content.");
    return { messageCount: fetchMock.mock.calls.length, text: content };
  },
}));

defineInboundProviderContract("SendBlue", async () => {
  const webhookResponse =
    await capturedChannelConfig().adapters.sendblue.handleWebhook(
      new Request("https://assistant.example/eve/v1/sendblue", {
        body: "{}",
        method: "POST",
      })
    );
  return webhookResponse.status === 401;
});

function createAdapter() {
  return createSendblueAdapter({
    apiKey: "test-key",
    apiSecret: "test-secret",
    defaultFromNumber: line,
  });
}

function capturedChannelConfig(): CapturedSendblueChannelConfig {
  if (!channelCapture.config)
    throw new Error("SendBlue channel configuration was not captured.");
  return channelCapture.config as CapturedSendblueChannelConfig;
}

function mockProviderResponse(body: unknown) {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(providerResponse(body));
}

function providerRequestPaths() {
  return fetchMock.mock.calls.map(
    ([input]) => new URL(input instanceof Request ? input.url : input).pathname
  );
}

function requestBody(requestSpy: ReturnType<typeof vi.fn<typeof fetch>>) {
  const options = requestSpy.mock.calls[0]?.[1];
  if (!options || typeof options.body !== "string")
    throw new Error("Missing request body");
  return JSON.parse(options.body) as Record<string, unknown>;
}

function providerResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
