/* oxlint-disable vitest/require-mock-type-parameters, unicorn/consistent-function-scoping, anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, typescript/no-unsafe-type-assertion -- These fixtures bridge Eve's dynamic hook/tool contract and intentionally implement only the vendor fields exercised by the boundary. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeBrowserLoopTool: vi.fn(),
  requireOwnedBrowserSession: vi.fn(),
  requireWorkerScope: vi.fn(),
}));

vi.mock("eve/context", () => ({
  defineState: <T>(_name: string, initial: () => T) => {
    let value = initial();
    return {
      get: () => value,
      update: (update: (current: T) => T) => {
        value = update(value);
      },
    };
  },
}));

vi.mock("@onkernel/browser-loop", () => {
  const spec = (name: string) => ({
    name,
    declaration: {
      description: name,
      parameters: { type: "object", properties: {}, required: [] },
    },
  });
  return {
    loop: {
      tools: {
        browser: {
          snapshot: () => spec("browser_snapshot"),
          text: () => spec("browser_text"),
          find: () => spec("browser_find"),
          navigate: () => spec("browser_navigate"),
          waitFor: () => spec("browser_wait_for"),
          act: () => spec("browser_act"),
        },
      },
    },
  };
});

vi.mock("@/agent/subagents/browser-agent/lib/access", () => ({
  requireWorkerScope: mocks.requireWorkerScope,
}));
vi.mock("@/agent/subagents/browser-agent/lib/owned-browser", () => ({
  requireOwnedBrowserSession: mocks.requireOwnedBrowserSession,
}));
vi.mock("@/agent/subagents/browser-agent/lib/semantic-loop", () => ({
  executeBrowserLoopTool: mocks.executeBrowserLoopTool,
  modelText: (output: { content: readonly { text?: string }[] }) =>
    output.content.map((part) => part.text ?? "").join("\n"),
}));

import semanticBrowser from "@/agent/subagents/browser-agent/tools/semantic_browser";
import {
  clearVaultFilledBrowserSession,
  isVaultFilledBrowserSession,
  markVaultFilledBrowserSession,
} from "@/agent/subagents/browser-agent/lib/vault-browser-guard";

describe("worker semantic browser boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVaultFilledBrowserSession("browser-1");
  });

  it("does not return a vault-filled secret extracted through page DOM", async () => {
    const vaultSecret = "vault-secret-card-number-4111111111111111";
    mocks.requireWorkerScope.mockResolvedValue({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    mocks.requireOwnedBrowserSession.mockResolvedValue({
      createdAt: "2026-09-03T00:00:00.000Z",
      sessionId: "browser-1",
      workerSessionId: "worker-session-1",
    });
    markVaultFilledBrowserSession("browser-1");
    mocks.executeBrowserLoopTool.mockResolvedValue({
      content: [{ type: "text", text: vaultSecret }],
      details: {},
    });

    const dynamic = semanticBrowser as unknown as {
      events: {
        "session.started": () => Record<
          string,
          {
            execute: (
              input: Record<string, unknown>,
              context: unknown
            ) => Promise<unknown>;
            toModelOutput: (output: unknown) => unknown;
          }
        >;
      };
    };
    const tools = dynamic.events["session.started"]();
    expect(tools.playwright_execute).toBeUndefined();
    const tool = tools.browser_text;
    if (!tool) throw new Error("browser_text tool was not registered");
    const result = await tool.execute(
      {
        session_id: "browser-1",
      },
      { toolName: "browser_text", abortSignal: undefined }
    );

    expect(JSON.stringify(tool.toModelOutput(result))).not.toContain(
      vaultSecret
    );
  });

  it("does not let browser_act click or press a consequential control", async () => {
    const dynamic = semanticBrowser as unknown as {
      events: {
        "session.started": () => Record<
          string,
          {
            execute: (
              input: Record<string, unknown>,
              context: unknown
            ) => Promise<unknown>;
          }
        >;
      };
    };
    const tools = dynamic.events["session.started"]();
    if (!tools.browser_act)
      throw new Error("browser_act tool was not registered");

    await expect(
      tools.browser_act.execute(
        {
          session_id: "browser-1",
          steps: [{ type: "click", ref: "e12" }],
        },
        { toolName: "browser_act", abortSignal: undefined }
      )
    ).rejects.toThrow(/commit_browser_action/i);
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
  });

  it("redacts DOM values even when a resumed process has no vault taint", async () => {
    const secret = "4111111111111111";
    mocks.executeBrowserLoopTool.mockResolvedValue({
      content: [
        { type: "text", text: `textbox Card number value="${secret}"` },
      ],
      details: {},
    });
    const dynamic = semanticBrowser as unknown as {
      events: {
        "session.started": () => Record<
          string,
          {
            execute: (
              input: Record<string, unknown>,
              context: unknown
            ) => Promise<unknown>;
            toModelOutput: (output: unknown) => unknown;
          }
        >;
      };
    };
    const tool = dynamic.events["session.started"]().browser_snapshot;
    if (!tool) throw new Error("browser_snapshot tool was not registered");
    const result = await tool.execute(
      { session_id: "browser-1" },
      { toolName: "browser_snapshot", abortSignal: undefined }
    );

    expect(JSON.stringify(tool.toModelOutput(result))).not.toContain(secret);
  });

  it("keeps vault taint in the exported session state until the browser is retired", () => {
    markVaultFilledBrowserSession("browser-1");
    expect(isVaultFilledBrowserSession("browser-1")).toBe(true);
    clearVaultFilledBrowserSession("browser-1");
    expect(isVaultFilledBrowserSession("browser-1")).toBe(false);
  });
});
