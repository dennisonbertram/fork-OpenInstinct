/* oxlint-disable vitest/require-mock-type-parameters, unicorn/consistent-function-scoping, anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, typescript/no-unsafe-type-assertion -- These fixtures bridge Eve's dynamic hook/tool contract and intentionally implement only the vendor fields exercised by the boundary. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as browserLoop from "@onkernel/browser-loop";

const mocks = vi.hoisted(() => ({
  executeBrowserLoopTool: vi.fn(),
  browserRefStateForSession: vi.fn(),
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

vi.mock("@onkernel/browser-loop", async () => {
  const actual = await vi.importActual<typeof browserLoop>(
    "@onkernel/browser-loop"
  );
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
          waitFor: actual.loop.tools.browser.waitFor,
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
  browserRefStateForSession: mocks.browserRefStateForSession,
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
  it("keeps URL and title wait leaves atomic while preserving deliberate all conditions", () => {
    const dynamic = semanticBrowser as unknown as {
      events: {
        "session.started": () => Record<
          string,
          { inputSchema: Parameters<typeof z.fromJSONSchema>[0] }
        >;
      };
    };
    const schema =
      dynamic.events["session.started"]().browser_wait_for?.inputSchema;
    if (!schema) throw new Error("Missing wait schema");
    const validate = z.fromJSONSchema(schema);
    for (const type of ["url", "title"]) {
      expect(
        validate.safeParse({
          session_id: "browser-1",
          expect: { type, equals: "", contains: "/secure", changed: false },
        }).success
      ).toBe(false);
      expect(
        validate.safeParse({
          session_id: "browser-1",
          expect: { type, contains: "/secure" },
        }).success
      ).toBe(true);
      expect(
        validate.safeParse({
          session_id: "browser-1",
          expect: { type, changed: false },
        }).success
      ).toBe(true);
      expect(
        validate.safeParse({
          session_id: "browser-1",
          expect: {
            all: [
              { type, contains: "/secure" },
              { type, changed: false },
            ],
          },
        }).success
      ).toBe(true);
      expect(
        validate.safeParse({
          session_id: "browser-1",
          expect: { any: [{ type, equals: "", contains: "/secure" }] },
        }).success
      ).toBe(false);
    }
    expect(
      validate.safeParse({
        session_id: "browser-1",
        expect: { type: "text", text: "Secure Area", exists: true },
      }).success
    ).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.browserRefStateForSession.mockReset();
    clearVaultFilledBrowserSession("browser-1");
  });

  it("preserves legacy wait operators at execution instead of stripping empty or false values", async () => {
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
    mocks.executeBrowserLoopTool.mockResolvedValue({
      content: [],
      details: {},
    });
    const condition = {
      type: "url",
      equals: "",
      contains: "/secure",
      changed: false,
    };
    await dynamic.events["session.started"]().browser_wait_for?.execute(
      { session_id: "browser-1", expect: condition },
      { toolName: "browser_wait_for" }
    );
    expect(mocks.executeBrowserLoopTool).toHaveBeenCalledWith(
      "browser-1",
      expect.anything(),
      expect.objectContaining({ expect: condition }),
      undefined
    );
  });

  it.each([
    ["browser_snapshot", 'textbox "Username" [e24]'],
    ["browser_find", 'textbox "Username" [e24]'],
    [
      "browser_snapshot",
      "Page unchanged since the last snapshot; previous element refs are still valid.",
    ],
  ])(
    "exposes exact action metadata for %s observations",
    async (toolName, text) => {
      mocks.browserRefStateForSession.mockReturnValue({
        generations: [],
        activeTargetId: "page-1",
        refs: [
          [
            "e24",
            {
              targetId: "page-1",
              frameId: "frame-123",
              role: "textbox",
              name: "Username",
            },
          ],
          [
            "e25",
            {
              targetId: "other-page",
              frameId: "private-frame",
              role: "textbox",
              name: "Other tab",
            },
          ],
          [
            "e26",
            {
              targetId: "page-1",
              frameId: "secret-frame",
              role: "textbox",
              name: 'value="sensitive-label"',
            },
          ],
        ],
      });
      mocks.executeBrowserLoopTool.mockResolvedValue({
        content: [{ type: "text", text }],
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
      const tool = dynamic.events["session.started"]()[toolName];
      if (!tool) throw new Error("Tool unavailable");
      const result = await tool.execute(
        { session_id: "browser-1" },
        { toolName }
      );
      expect(JSON.stringify(tool.toModelOutput(result))).toContain(
        "target_token"
      );
      expect(JSON.stringify(tool.toModelOutput(result))).not.toContain(
        "frame-123"
      );
      expect(JSON.stringify(tool.toModelOutput(result))).toContain(
        "textbox: Username"
      );
      expect(JSON.stringify(result)).toContain("target_ref");
      expect(JSON.stringify(result)).not.toContain("private-frame");
      expect(JSON.stringify(result)).not.toContain("secret-frame");
      expect(JSON.stringify(result)).not.toContain("sensitive-label");
    }
  );

  it.each(["browser_text", "browser_snapshot", "browser_find"])(
    "does not return vault-filled secrets or target metadata through %s",
    async (toolName) => {
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
      mocks.browserRefStateForSession.mockReturnValue({
        generations: [],
        activeTargetId: "page-1",
        refs: [
          [
            "e24",
            {
              targetId: "page-1",
              frameId: "private-frame",
              role: "textbox",
              name: vaultSecret,
            },
          ],
        ],
      });
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
      const tool = tools[toolName];
      if (!tool) throw new Error("browser_text tool was not registered");
      const result = await tool.execute(
        {
          session_id: "browser-1",
        },
        { toolName, abortSignal: undefined }
      );

      expect(JSON.stringify(tool.toModelOutput(result))).not.toContain(
        vaultSecret
      );
      expect(mocks.browserRefStateForSession).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["satisfied", "newly_verified", "matched"],
    ["satisfied", "preexisting", "matched"],
    ["timed_out", "failed", "not_matched"],
    ["unverifiable", "unverifiable", "unknown"],
  ])(
    "preserves safe %s wait evidence after vault fill",
    async (status, evidence, after) => {
      markVaultFilledBrowserSession("browser-1");
      mocks.executeBrowserLoopTool.mockResolvedValue({
        content: [{ type: "text", text: "vault-sentinel" }],
        details: {
          statusText: "vault-sentinel",
          readResults: [
            {
              type: "browser_wait_for",
              result: {
                status,
                evidence,
                elapsed_ms: 20,
                final: {
                  truth:
                    after === "matched"
                      ? true
                      : after === "not_matched"
                        ? false
                        : undefined,
                  details: ["vault-sentinel"],
                },
                details: ["vault-sentinel"],
              },
            },
          ],
        },
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
      const tool = dynamic.events["session.started"]().browser_wait_for;
      if (!tool) throw new Error("Missing wait tool");
      const result = await tool.execute(
        { session_id: "browser-1" },
        { toolName: "browser_wait_for" }
      );
      const model = JSON.stringify(tool.toModelOutput(result));
      expect(model).toContain(status);
      expect(model).toContain(evidence);
      expect(model).not.toContain("vault-sentinel");
      expect(JSON.stringify(result)).not.toContain("vault-sentinel");
    }
  );

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
