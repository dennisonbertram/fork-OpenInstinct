import { describe, expect, it, vi } from "vitest";
import {
  clearDurableDynamicCallbacks,
  registerDurableDynamicCallback,
} from "../../node_modules/eve/dist/src/tools/durable-callbacks.js";
import { replayDynamicTools } from "../../node_modules/eve/dist/src/context/build-dynamic-tools.js";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import { SessionKey } from "../../node_modules/eve/dist/src/context/keys.js";

describe("Eve dynamic tool replay", () => {
  it("refuses a stale executor after its resolver result is removed", async () => {
    const executor = vi.fn<() => void>();
    const owner = {
      entryKey: "calendar-list-events",
      name: "calendar-list-events",
      resolverSlug: "calendar",
      scope: "turn" as const,
      sessionId: "channel-observed-session",
    };
    registerDurableDynamicCallback({
      callback: executor,
      owner,
      phase: "execute",
    });
    clearDurableDynamicCallbacks(owner.sessionId, {
      resolverSlug: owner.resolverSlug,
      scope: owner.scope,
    });

    const [tool] = replayDynamicTools(
      [
        {
          callbacks: { execute: { closure: {} } },
          description: "Synthetic denied calendar executor.",
          entryKey: owner.entryKey,
          inputSchema: { additionalProperties: false, type: "object" },
          name: owner.name,
          resolverSlug: owner.resolverSlug,
        },
      ],
      owner
    );
    if (!tool) throw new Error("Expected replayed test tool");

    const context = new ContextContainer();
    context.set(SessionKey, {
      auth: { current: null, initiator: null },
      sessionId: owner.sessionId,
      turn: { id: "turn-1", sequence: 1 },
    });
    await contextStorage.run(context, async () => {
      await expect(
        tool.execute?.({}, { messages: [], toolCallId: "call-1" })
      ).rejects.toThrow(
        'Dynamic tool "calendar-list-events" cannot replay its execute callback'
      );
    });
    expect(executor).not.toHaveBeenCalled();
  });
});
