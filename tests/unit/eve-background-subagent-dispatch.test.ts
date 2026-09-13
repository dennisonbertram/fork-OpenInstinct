import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createPreparedRuntimeSubagentTool } from "../../node_modules/eve/dist/src/runtime/subagents/registry.js";

describe("Eve 0.54.3 background subagent dispatch", () => {
  it("keeps browser-agent a durable background task after experimental.tasks is removed", async () => {
    const agentSource = await readFile(
      new URL("../../agent/agent.ts", import.meta.url),
      "utf8"
    );
    expect(agentSource).not.toMatch(/tasks:\s*true/);

    const tool = createPreparedRuntimeSubagentTool({
      description:
        "Execute one bounded browser assignment for the root coordinator",
      kind: "subagent",
      logicalPath: "agent/subagents/browser-agent/agent.ts",
      name: "browser-agent",
      nodeId: "browser-agent",
      sourceId: "browser-agent",
      sourceKind: "module",
    });

    expect(tool.execution).toBe("background");
    expect(tool.behavior.handling?.kind).toBe("dispatch");
    expect(tool.description).toContain("background task");
  });
});
