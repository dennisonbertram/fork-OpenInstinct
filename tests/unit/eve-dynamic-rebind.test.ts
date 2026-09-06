import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "eve/tools";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import type { CurrentDynamicToolMetadata } from "../../node_modules/eve/dist/src/context/dynamic-tool-metadata.js";
import { TurnDynamicToolMetadataKey } from "../../node_modules/eve/dist/src/context/keys.js";
import {
  dispatchDynamicToolEvent,
  rebindMissingCompiledDynamicToolCallbacks,
} from "../../node_modules/eve/dist/src/context/dynamic-tool-lifecycle.js";
import {
  createStepStartedEvent,
  createTurnStartedEvent,
} from "../../node_modules/eve/dist/src/protocol/message.js";
import type { ResolvedDynamicToolResolver } from "../../node_modules/eve/dist/src/runtime/types.js";
import {
  lookupDurableDynamicCallback,
  stampDurableDynamicToolCallbacks,
} from "../../node_modules/eve/dist/src/tools/durable-callbacks.js";

function persistedMetadata(
  name: string,
  resolverSlug: string
): CurrentDynamicToolMetadata {
  return {
    callbacks: { execute: { closure: {} } },
    description: name,
    entryKey: name,
    inputSchema: { type: "object" },
    name,
    resolverSlug,
  };
}

function dynamicTool(name: string) {
  const tool = defineTool({
    description: name,
    inputSchema: z.object({}),
    async execute() {
      return {};
    },
  });
  stampDurableDynamicToolCallbacks(tool, {
    execute: { callback: async () => ({}), closure: {} },
  });
  return tool;
}

function resolver(
  slug: string,
  toolName: string,
  rebindMissingCallbacks: boolean,
  returnsTool = true
): ResolvedDynamicToolResolver {
  return {
    eventNames: ["turn.started"],
    events: {
      "turn.started": async () =>
        returnsTool ? { [toolName]: dynamicTool(toolName) } : null,
    },
    logicalPath: `synthetic/${slug}.ts`,
    rebindMissingCallbacks,
    slug,
    sourceId: `synthetic:${slug}`,
    sourceKind: "module",
  };
}

function turnStarted() {
  return createTurnStartedEvent({ sequence: 1, turnId: "turn-next" });
}

describe("installed Eve dynamic callback rebind", () => {
  it("does not reject a new turn for ordinary callbacks that its normal boundary will register", async () => {
    const ctx = new ContextContainer();
    const memoryName = "synthetic_memory_rebind";
    const ordinaryName = "synthetic_ordinary_turn_tool";
    ctx.set(TurnDynamicToolMetadataKey, [
      persistedMetadata(memoryName, "memory"),
      persistedMetadata(ordinaryName, "ordinary"),
    ]);
    const resolvers = [
      resolver("memory", memoryName, true),
      resolver("ordinary", ordinaryName, false),
    ];

    await expect(
      rebindMissingCompiledDynamicToolCallbacks({
        ctx,
        event: turnStarted(),
        messages: [],
        resolvers,
      })
    ).resolves.toBeUndefined();

    await dispatchDynamicToolEvent({
      ctx,
      event: turnStarted(),
      messages: [],
      resolvers,
    });
    expect(lookupDurableDynamicCallback(ordinaryName, "execute")).toEqual(
      expect.any(Function)
    );
  });

  it("still fails closed when an opted-in resolver cannot restore its callback", async () => {
    const ctx = new ContextContainer();
    const memoryName = "synthetic_missing_memory_rebind";
    ctx.set(TurnDynamicToolMetadataKey, [
      persistedMetadata(memoryName, "memory"),
    ]);

    await expect(
      contextStorage.run(ctx, () =>
        rebindMissingCompiledDynamicToolCallbacks({
          ctx,
          event: turnStarted(),
          messages: [],
          resolvers: [resolver("memory", memoryName, true, false)],
        })
      )
    ).rejects.toThrow(
      `Dynamic tool callback rebind did not restore: ${memoryName}`
    );
  });

  it("replaces legacy turn-scoped metadata before registering the current step-scoped tool", async () => {
    const ctx = new ContextContainer();
    const messagingName = "synthetic_legacy_messaging_tool";
    ctx.set(TurnDynamicToolMetadataKey, [
      persistedMetadata(messagingName, "messaging"),
    ]);
    const messaging = {
      eventNames: ["turn.started", "step.started"],
      events: {
        "step.started": async () => ({
          [messagingName]: dynamicTool(messagingName),
        }),
        "turn.started": async () => null,
      },
      logicalPath: "synthetic/messaging.ts",
      slug: "messaging",
      sourceId: "synthetic:messaging",
      sourceKind: "module",
    } satisfies ResolvedDynamicToolResolver;

    await dispatchDynamicToolEvent({
      ctx,
      event: turnStarted(),
      messages: [],
      resolvers: [messaging],
    });
    expect(ctx.get(TurnDynamicToolMetadataKey)).toEqual([]);

    await dispatchDynamicToolEvent({
      ctx,
      event: createStepStartedEvent({
        modelId: "synthetic/model",
        sequence: 1,
        stepIndex: 0,
        turnId: "turn-next",
      }),
      messages: [],
      resolvers: [messaging],
    });
    expect(lookupDurableDynamicCallback(messagingName, "execute")).toEqual(
      expect.any(Function)
    );
  });
});
