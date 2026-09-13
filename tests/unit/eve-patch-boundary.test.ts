import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const patchUrl = new URL("../../patches/eve@0.54.3.patch", import.meta.url);

describe("Eve patch boundary", () => {
  it("contains only the registered compatibility, opaque-context, final-delivery completion, and task-terminal projection hunks", async () => {
    const patch = await readFile(patchUrl, "utf8");
    const paths = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)];

    expect(paths.map((match) => [match[1], match[2]])).toEqual([
      [
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.d.ts",
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.d.ts",
      ],
      [
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.js",
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.js",
      ],
      [
        "dist/src/compiled/chat/index.d.ts",
        "dist/src/compiled/chat/index.d.ts",
      ],
      ["dist/src/context/container.js", "dist/src/context/container.js"],
      [
        "dist/src/context/dynamic-resolve-context.js",
        "dist/src/context/dynamic-resolve-context.js",
      ],
      [
        "dist/src/context/dynamic-tool-lifecycle.js",
        "dist/src/context/dynamic-tool-lifecycle.js",
      ],
      ["dist/src/context/serialize.js", "dist/src/context/serialize.js"],
      [
        "dist/src/context/turn-completion.d.ts",
        "dist/src/context/turn-completion.d.ts",
      ],
      [
        "dist/src/context/turn-completion.js",
        "dist/src/context/turn-completion.js",
      ],
      ["dist/src/dynamic/definition.d.ts", "dist/src/dynamic/definition.d.ts"],
      ["dist/src/eve-channel/index.js", "dist/src/eve-channel/index.js"],
      [
        "dist/src/execution/route-child-delivery.js",
        "dist/src/execution/route-child-delivery.js",
      ],
      [
        "dist/src/execution/tasks/parent/hitl-proxy-steps.js",
        "dist/src/execution/tasks/parent/hitl-proxy-steps.js",
      ],
      [
        "dist/src/execution/workflow-steps.js",
        "dist/src/execution/workflow-steps.js",
      ],
      [
        "dist/src/execution/wire/session-inbox-wire.v4.migration.js",
        "dist/src/execution/wire/session-inbox-wire.v4.migration.js",
      ],
      ["dist/src/harness/tool-loop.js", "dist/src/harness/tool-loop.js"],
      [
        "dist/src/public/context/index.d.ts",
        "dist/src/public/context/index.d.ts",
      ],
      ["dist/src/public/context/index.js", "dist/src/public/context/index.js"],
      ["dist/src/public/index.d.ts", "dist/src/public/index.d.ts"],
      ["dist/src/public/tools/index.d.ts", "dist/src/public/tools/index.d.ts"],
      ["dist/src/tasks/session-index.js", "dist/src/tasks/session-index.js"],
      [
        "dist/src/tasks/session-task-cohorts.js",
        "dist/src/tasks/session-task-cohorts.js",
      ],
      [
        "dist/src/tasks/terminal-projection.d.ts",
        "dist/src/tasks/terminal-projection.d.ts",
      ],
      [
        "dist/src/tasks/terminal-projection.js",
        "dist/src/tasks/terminal-projection.js",
      ],
    ]);
    expect(patch).toContain(
      'export { createLinqAdapter } from "@linqapp/chat-sdk-adapter"'
    );
    expect(patch).toContain("withRouteAuth(handleConnectionCallbackRequest)");
    expect(patch).toContain(
      "withRouteAuth(handleLegacyConnectionCallbackRequest)"
    );
    expect(patch).toContain("withRouteAuth(handleSessionCallbackRequest)");
    expect(patch).toContain("withRouteAuth(handleTaskInputResponseRequest)");
    expect(patch).toContain('export * from "chat"');
    expect(patch).toContain("u.has(t.resolverSlug)");
    expect(patch).toContain("requestTurnCompletion");
    expect(patch).toContain("consumeTurnCompletionRequest");
    expect(patch).toContain("readBackgroundTaskTerminals");
    expect(patch).toContain("readBackgroundTaskMembers");
    expect(patch).toContain("setSessionTaskTerminals(i,r.state)");
    expect(patch).toContain("isCompatibleTaskIndexVersion");
    expect(patch).toContain("n.childSessionId=t.childSessionId");
    expect(patch).toContain("DynamicTurnOrigin");
    expect(patch).toContain("TurnTaskDeliveryKey");
    expect(patch).not.toContain("diff --git a/package.json");
    expect(patch).not.toContain("wait-until-BtySPYD0.js");
  });

  it("publishes only a typed turn origin, never private task routing data", async () => {
    const patch = await readFile(patchUrl, "utf8");
    const origin = patch.slice(
      patch.indexOf("b/dist/src/context/dynamic-resolve-context.js"),
      patch.indexOf("b/dist/src/context/dynamic-tool-lifecycle.js")
    );

    expect(origin).toContain("origin:u");
    expect(origin).toContain("c===`pending`||c===`settled`");
    expect(origin).not.toContain("taskDeliveryId");
    expect(origin).not.toContain("taskInboxToken");
  });

  it("keeps the task-terminal projection read-only", async () => {
    const patch = await readFile(patchUrl, "utf8");
    const projection = patch.slice(
      patch.indexOf("b/dist/src/tasks/terminal-projection.js")
    );

    // The projection must never publish the private task inbox routing
    // credential, and it must not rewrite the runtime's cohort instructions.
    expect(projection).not.toContain("taskInboxToken");
    // A member record says only that a task exists and whether it settled; it
    // must never carry a result or a child identity.
    expect(projection).toContain("settled:e.terminalView!==void 0");
    expect(patch).not.toContain("TASK_DELIVERY_SETTLED_INSTRUCTION");
    expect(patch).not.toContain("TASK_DELIVERY_PENDING_INSTRUCTION");
  });
});
