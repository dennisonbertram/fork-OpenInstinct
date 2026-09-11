import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const patchUrl = new URL("../../patches/eve@0.49.0.patch", import.meta.url);

describe("Eve patch boundary", () => {
  it("contains only the registered compatibility, final-delivery completion, and task-terminal projection hunks", async () => {
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
        "dist/src/compiled/_chunks/workflow/wait-until-BtySPYD0.js",
        "dist/src/compiled/_chunks/workflow/wait-until-BtySPYD0.js",
      ],
      [
        "dist/src/compiled/chat/index.d.ts",
        "dist/src/compiled/chat/index.d.ts",
      ],
      [
        "dist/src/context/dynamic-tool-lifecycle.js",
        "dist/src/context/dynamic-tool-lifecycle.js",
      ],
      [
        "dist/src/context/turn-completion.d.ts",
        "dist/src/context/turn-completion.d.ts",
      ],
      [
        "dist/src/context/turn-completion.js",
        "dist/src/context/turn-completion.js",
      ],
      ["dist/src/eve-channel/index.js", "dist/src/eve-channel/index.js"],
      [
        "dist/src/execution/workflow-steps.js",
        "dist/src/execution/workflow-steps.js",
      ],
      ["dist/src/harness/tool-loop.js", "dist/src/harness/tool-loop.js"],
      [
        "dist/src/public/context/index.d.ts",
        "dist/src/public/context/index.d.ts",
      ],
      ["dist/src/public/context/index.js", "dist/src/public/context/index.js"],
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
    expect(patch).toContain("u.has(e.resolverSlug)");
    expect(patch).toContain("requestTurnCompletion");
    expect(patch).toContain("consumeTurnCompletionRequest");
    expect(patch).toContain("readBackgroundTaskTerminals");
    expect(patch).toContain("readBackgroundTaskMembers");
    expect(patch).toContain("setSessionTaskTerminals(l,c.state)");
    expect(patch).not.toContain("diff --git a/package.json");
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
