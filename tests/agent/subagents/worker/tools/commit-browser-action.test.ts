/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-assignment, typescript/restrict-template-expressions -- Hoisted vendor-boundary mocks intentionally model only the Browser Loop fields exercised by these contract tests. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertKernelFrameOrigin: vi.fn(),
  browserRefStateForSession: vi.fn(),
  currentKernelPageOrigin: vi.fn(),
  executeBrowserLoopTool: vi.fn(),
  requireOwnedBrowserSession: vi.fn(),
  requireWorkerScope: vi.fn(),
}));

vi.mock("@/agent/subagents/worker/lib/access", () => ({
  requireWorkerScope: mocks.requireWorkerScope,
}));
vi.mock("@/agent/subagents/worker/lib/owned-browser", () => ({
  requireOwnedBrowserSession: mocks.requireOwnedBrowserSession,
}));
vi.mock("@/agent/subagents/worker/lib/autofill/native", () => ({
  assertKernelFrameOrigin: mocks.assertKernelFrameOrigin,
  currentKernelPageOrigin: mocks.currentKernelPageOrigin,
}));
vi.mock("@/agent/subagents/worker/lib/semantic-loop", () => ({
  browserRefStateForSession: mocks.browserRefStateForSession,
  executeBrowserLoopTool: mocks.executeBrowserLoopTool,
}));
vi.mock("@onkernel/browser-loop", () => ({
  loop: { tools: { browser: { act: () => ({ name: "browser_act" }) } } },
}));

import commitBrowserAction from "@/agent/subagents/worker/tools/commit_browser_action";
import interactBrowserElement, {
  interactBrowserElementInputSchema,
} from "@/agent/subagents/worker/tools/interact_browser_element";
import { toolContextFor } from "@/tests/helpers/tool-context";

const input = {
  action: "place_order" as const,
  browser_session_id: "browser-1",
  frame_id: "checkout-frame",
  origin: "https://merchant.example",
  target_label: "button: Place order",
  target_ref: "e12",
  terms: {
    kind: "place_order" as const,
    item: "Example item",
    merchant: "Example merchant",
    option: "Standard",
    quantity: 1,
    total: "USD 10.00",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkerScope.mockResolvedValue({
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  mocks.requireOwnedBrowserSession.mockResolvedValue({
    createdAt: "2026-09-03T00:00:00.000Z",
    sessionId: "browser-1",
    workerSessionId: "worker-session-1",
  });
  mocks.currentKernelPageOrigin.mockResolvedValue("https://merchant.example");
  mocks.browserRefStateForSession.mockReturnValue({
    refs: [
      [
        "e12",
        { frameId: "checkout-frame", role: "button", name: "Place order" },
      ],
    ],
  });
  mocks.assertKernelFrameOrigin.mockResolvedValue(true);
  mocks.executeBrowserLoopTool.mockResolvedValue({
    content: [],
    details: { statusText: "ok" },
  });
});

describe("typed browser commit boundary", () => {
  it("rejects a ref bound to another frame before any browser execution", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      refs: [
        [
          "e12",
          { frameId: "different-frame", role: "button", name: "Place order" },
        ],
      ],
    });

    await expect(
      commitBrowserAction.execute(
        input,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/stale|another frame/i);
    expect(mocks.assertKernelFrameOrigin).not.toHaveBeenCalled();
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
  });

  it("revalidates the exact origin-bound frame before dispatch", async () => {
    await commitBrowserAction.execute(
      input,
      toolContextFor({ sessionId: "worker-session-1" })
    );

    expect(mocks.assertKernelFrameOrigin).toHaveBeenCalledWith({
      browserSessionId: "browser-1",
      expectedOrigin: "https://merchant.example",
      frameId: "checkout-frame",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.executeBrowserLoopTool).toHaveBeenCalledTimes(1);
    expect(mocks.executeBrowserLoopTool.mock.calls[0]?.[2]).toEqual({
      steps: [{ type: "click", ref: "e12" }],
      successor: { depth: 4, filter: "interactive" },
    });
  });

  it("rejects a model label that does not match the observed ref", async () => {
    await expect(
      commitBrowserAction.execute(
        { ...input, target_label: "button: Cancel" },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/stale|another frame/i);
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
  });

  it("keeps a structurally identified tab on the prompt-free interaction path", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      refs: [
        ["e13", { frameId: "checkout-frame", role: "tab", name: "Details" }],
      ],
    });

    await interactBrowserElement.execute(
      {
        action: { kind: "toggle_tab" },
        browser_session_id: "browser-1",
        frame_id: "checkout-frame",
        origin: "https://merchant.example",
        target_label: "tab: Details",
        target_ref: "e13",
      },
      toolContextFor({ sessionId: "worker-session-1" })
    );

    expect(mocks.executeBrowserLoopTool.mock.calls[0]?.[2]).toMatchObject({
      steps: [{ type: "click", ref: "e13" }],
    });
  });

  it("rejects ambiguous buttons, links, and menuitems from the prompt-free path", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      refs: [
        [
          "e14",
          { frameId: "checkout-frame", role: "button", name: "Place order" },
        ],
      ],
    });

    for (const [kind, role, name] of [
      ["open_dialog", "button", "Place order"],
      ["activate_link", "link", "Delete account"],
      ["open_menu", "menuitem", "Send message"],
    ]) {
      expect(
        interactBrowserElementInputSchema.safeParse({
          action: { kind },
          browser_session_id: "browser-1",
          frame_id: "checkout-frame",
          origin: "https://merchant.example",
          target_label: `${role}: ${name}`,
          target_ref: "e14",
        }).success
      ).toBe(false);
    }
  });
});
