import { Chat, type Lock, type QueueEntry, type StateAdapter } from "chat";
import { createSendblueAdapter } from "chat-adapter-sendblue";
import { describe, expect, it } from "vitest";

// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion, eslint/no-empty-function, typescript/no-unnecessary-type-parameters, typescript/no-unsafe-type-assertion -- Synthetic StateAdapter implements the published Chat interface while the real Chat and SendBlue adapter own the behavior under test.

const line = "+12025550123";
const contact = "+12025550199";

class SyntheticState implements StateAdapter {
  private readonly values = new Map<string, unknown>();
  private readonly subscribed = new Set<string>();

  async acquireLock(threadId: string, _ttlMs: number): Promise<Lock | null> {
    return { expiresAt: Date.now() + 30_000, threadId, token: "synthetic" };
  }

  async appendToList(_key: string, _value: unknown): Promise<void> {}

  async connect(): Promise<void> {}

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async dequeue(_threadId: string): Promise<QueueEntry | null> {
    return null;
  }

  async disconnect(): Promise<void> {}

  async enqueue(_threadId: string, _entry: QueueEntry): Promise<number> {
    return 0;
  }

  async extendLock(_lock: Lock, _ttlMs: number): Promise<boolean> {
    return true;
  }

  async forceReleaseLock(_threadId: string): Promise<void> {}

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async getList<T = unknown>(_key: string): Promise<T[]> {
    return [];
  }

  async isSubscribed(threadId: string): Promise<boolean> {
    return this.subscribed.has(threadId);
  }

  async queueDepth(_threadId: string): Promise<number> {
    return 0;
  }

  async releaseLock(_lock: Lock): Promise<void> {}

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExists(key: string, value: unknown): Promise<boolean> {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }

  async subscribe(threadId: string): Promise<void> {
    this.subscribed.add(threadId);
  }

  async unsubscribe(threadId: string): Promise<void> {
    this.subscribed.delete(threadId);
  }
}

function inboundPayload(groupId?: string) {
  return {
    accountEmail: "sendblue-account",
    content: "synthetic inbound",
    date_sent: new Date().toISOString(),
    from_number: contact,
    group_id: groupId,
    is_outbound: false,
    message_handle: `message-${groupId ?? "direct"}`,
    message_type: "message",
    sendblue_number: line,
    service: "iMessage",
    status: "RECEIVED",
    to_number: line,
  };
}

async function dispatchInbound(groupId?: string) {
  const adapter = createSendblueAdapter({
    apiKey: "synthetic-key",
    apiSecret: "synthetic-secret",
    allowedServices: ["iMessage"],
    defaultFromNumber: line,
    webhookSecret: "synthetic-webhook-secret",
  });
  const chat = new Chat({
    adapters: { sendblue: adapter },
    concurrency: "concurrent",
    logger: "error",
    state: new SyntheticState(),
    userName: "eve",
  });
  const received: string[] = [];
  chat.onDirectMessage(async (_thread, message) => {
    received.push(message.id);
  });
  await chat.initialize();

  const tasks: Promise<unknown>[] = [];
  const response = await adapter.handleWebhook(
    new Request("https://example.test/eve/v1/sendblue", {
      body: JSON.stringify(inboundPayload(groupId)),
      headers: {
        "content-type": "application/json",
        "sb-signing-secret": "synthetic-webhook-secret",
      },
      method: "POST",
    }),
    { waitUntil: (task) => tasks.push(task) }
  );
  await Promise.all(tasks);
  return { adapter, received, response };
}

describe("SendBlue native webhook dispatch", () => {
  it("routes a 1:1 native webhook to the real Chat direct-message handler", async () => {
    const { adapter, received, response } = await dispatchInbound();

    expect(response.status).toBe(200);
    expect(
      adapter.isDM(
        adapter.encodeThreadId({ contactNumber: contact, fromNumber: line })
      )
    ).toBe(true);
    expect(received).toEqual(["message-direct"]);
  });

  it("does not classify a group thread as a direct message", async () => {
    const { adapter, received, response } = await dispatchInbound("group-1");

    expect(response.status).toBe(200);
    expect(
      adapter.isDM(
        adapter.encodeThreadId({ fromNumber: line, groupId: "group-1" })
      )
    ).toBe(false);
    expect(received).toEqual([]);
  });
});
