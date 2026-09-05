/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-assignment, typescript/restrict-template-expressions -- Hoisted vendor-boundary mocks intentionally model only the Browser Loop fields exercised by these contract tests. */
import type { BrowserRefState } from "@onkernel/browser-loop";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  vaultFilled: false,
  fillWithKernelNativeAutofill: vi.fn(),
  readVaultItem: vi.fn(),
  materializeAutofillClaims: vi.fn(),
  assertKernelFrameOrigin: vi.fn(),
  browserRefStateForSession: vi.fn(),
  currentKernelPageOrigin: vi.fn(),
  executeBrowserLoopTool: vi.fn(),
  requireOwnedBrowserSession: vi.fn(),
  requireWorkerScope: vi.fn(),
}));

vi.mock("@/agent/subagents/browser-agent/lib/access", () => ({
  requireWorkerScope: mocks.requireWorkerScope,
}));
vi.mock("@/agent/subagents/browser-agent/lib/owned-browser", () => ({
  requireOwnedBrowserSession: mocks.requireOwnedBrowserSession,
}));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/native", () => ({
  assertKernelFrameOrigin: mocks.assertKernelFrameOrigin,
  fillWithKernelNativeAutofill: mocks.fillWithKernelNativeAutofill,
  nativeAutofillTokens: { payment: [] },
  currentKernelPageOrigin: mocks.currentKernelPageOrigin,
}));
vi.mock("@/agent/subagents/browser-agent/lib/semantic-loop", () => ({
  browserRefStateForSession: mocks.browserRefStateForSession,
  executeBrowserLoopTool: mocks.executeBrowserLoopTool,
}));
vi.mock("@/agent/subagents/browser-agent/lib/vault-browser-guard", () => ({
  isVaultFilledBrowserSession: () => mocks.vaultFilled,
  markVaultFilledBrowserSession: () => {
    mocks.vaultFilled = true;
  },
}));
vi.mock("@/db/services/vault", () => ({ readVaultItem: mocks.readVaultItem }));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/service", () => ({
  materializeAutofillClaims: mocks.materializeAutofillClaims,
}));
vi.mock("@onkernel/browser-loop", () => ({
  loop: { tools: { browser: { act: () => ({ name: "browser_act" }) } } },
}));

import commitBrowserAction, {
  commitBrowserActionInputSchema,
} from "@/agent/subagents/browser-agent/tools/commit_browser_action";
import interactBrowserElement, {
  interactBrowserElementInputSchema,
} from "@/agent/subagents/browser-agent/tools/interact_browser_element";
import { browserActionTargets } from "@/agent/subagents/browser-agent/lib/browser-action-targets";
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
  mocks.vaultFilled = false;
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
    generations: [],
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
  it.each([
    "browser",
    "ref",
    "frame",
    "label",
    "node",
    "generation",
    "document",
    "malformed",
    "conflicting legacy",
  ])("rejects a token with changed %s before dispatch", async (change) => {
    const target = {
      frameId: "checkout-frame",
      targetId: "page-1",
      backendNodeId: 42,
      generation: 1,
      role: "button",
      name: "\uf090 Login",
      nth: 0,
      cohort: 1,
    };
    const state: BrowserRefState = {
      refCounter: 12,
      generations: [["checkout-frame", 1]],
      documents: [["checkout-frame", "loader-1"]],
      refs: [["e12", target]],
    };
    const descriptor = browserActionTargets("browser-1", "[e12]", state)[0];
    if (!descriptor) throw new Error("Missing target");
    const submitted = {
      ...input,
      frame_id: undefined,
      target_label: undefined,
      target_token: descriptor.target_token,
    };
    if (change === "browser") submitted.browser_session_id = "browser-2";
    if (change === "ref") submitted.target_ref = "e13";
    if (change === "frame") target.frameId = "other-frame";
    if (change === "label") target.name = "Cancel";
    if (change === "node") target.backendNodeId = 99;
    if (change === "generation") state.generations[0] = ["checkout-frame", 2];
    if (change === "document")
      state.documents = [["checkout-frame", "loader-2"]];
    if (change === "malformed") submitted.target_token = "not-a-token";
    mocks.browserRefStateForSession.mockReturnValue(state);
    await expect(
      commitBrowserAction.execute(
        change === "conflicting legacy"
          ? { ...submitted, target_label: "button: Login" }
          : submitted,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/stale|mislabeled/iu);
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
    expect(mocks.assertKernelFrameOrigin).not.toHaveBeenCalled();
  });

  it("rechecks the token after payment fill changes the observed document", async () => {
    const target = {
      frameId: "checkout-frame",
      targetId: "page-1",
      backendNodeId: 42,
      generation: 1,
      role: "button",
      name: "Place order",
      nth: 0,
      cohort: 1,
    };
    const state: BrowserRefState = {
      refCounter: 12,
      generations: [],
      documents: [["checkout-frame", "loader-1"]],
      refs: [["e12", target]],
    };
    const descriptor = browserActionTargets("browser-1", "[e12]", state)[0];
    if (!descriptor) throw new Error("Missing target");
    mocks.browserRefStateForSession.mockReturnValue(state);
    mocks.readVaultItem.mockResolvedValue({ kind: "payment" });
    mocks.materializeAutofillClaims.mockResolvedValue([]);
    mocks.fillWithKernelNativeAutofill.mockImplementationOnce(async () => {
      state.documents = [["checkout-frame", "loader-2"]];
    });
    await expect(
      commitBrowserAction.execute(
        {
          ...input,
          frame_id: undefined,
          target_label: undefined,
          target_token: descriptor.target_token,
          payment: {
            candidate_id: "payment-test",
            frame_id: "checkout-frame",
            origin: input.origin,
          },
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/order target changed while payment was being filled/iu);
    expect(mocks.fillWithKernelNativeAutofill).toHaveBeenCalledTimes(1);
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
  });

  it("uses an observed token for a reversible interaction while preserving structural checks", async () => {
    const target = {
      frameId: "checkout-frame",
      targetId: "page-1",
      backendNodeId: 42,
      generation: 1,
      role: "textbox",
      name: "Username",
      nth: 0,
      cohort: 1,
    };
    const state: BrowserRefState = {
      refCounter: 12,
      generations: [],
      refs: [["e12", target]],
    };
    const descriptor = browserActionTargets("browser-1", "[e12]", state)[0];
    mocks.browserRefStateForSession.mockReturnValue(state);
    const submitted = interactBrowserElementInputSchema.parse({
      browser_session_id: "browser-1",
      origin: input.origin,
      ...descriptor,
      action: { kind: "fill_field", value: "" },
    });
    await expect(
      interactBrowserElement.execute(
        submitted,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).resolves.toMatchObject({ status: "dispatched" });
    target.role = "button";
    await expect(
      interactBrowserElement.execute(
        submitted,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/stale/iu);
    expect(mocks.executeBrowserLoopTool).toHaveBeenCalledTimes(1);
  });

  it("reports navigation uncertainty without exposing post-vault content or claiming login", async () => {
    mocks.executeBrowserLoopTool.mockResolvedValue({
      content: [{ type: "text", text: "vault-sentinel" }],
      details: {
        isError: true,
        readResults: [
          {
            type: "browser_act",
            result: {
              outcome: "unknown",
              stop_reason: "navigation",
              stopped_at: 0,
              successor: {
                status: "observed",
                text: "vault-sentinel",
                url: "https://secret.example",
                title: "vault-sentinel",
              },
              steps: [{ diagnostics: ["vault-sentinel"] }],
            },
          },
        ],
      },
    });
    const result = await commitBrowserAction.execute(
      input,
      toolContextFor({ sessionId: "worker-session-1" })
    );
    expect(result).toMatchObject({
      status: "uncertain",
      observation: {
        outcome: "unknown",
        stop_reason: "navigation",
        stopped_at: 0,
        successor: { status: "observed" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("vault-sentinel");
    expect(JSON.stringify(result)).not.toContain("secret.example");
  });

  it("rejects a ref bound to another frame before any browser execution", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      generations: [],
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
      generations: [],
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

  it("returns current login targets after preparation for a later approved vault login", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      generations: [],
      refs: [
        [
          "e1",
          { frameId: "checkout-frame", role: "textbox", name: "Username" },
        ],
      ],
    });
    mocks.executeBrowserLoopTool.mockImplementationOnce(async () => {
      mocks.browserRefStateForSession.mockReturnValue({
        generations: [],
        refs: [
          ["e30", { frameId: "checkout-frame", role: "button", name: "Login" }],
        ],
      });
      return {
        content: [{ type: "text", text: 'button "Login" [e30]' }],
        details: {},
      };
    });
    const prepared = await interactBrowserElement.execute(
      {
        action: { kind: "fill_field", value: "" },
        browser_session_id: "browser-1",
        frame_id: "checkout-frame",
        origin: "https://merchant.example",
        target_label: "textbox: Username",
        target_ref: "e1",
      },
      toolContextFor({ sessionId: "worker-session-1" })
    );
    expect(prepared).toHaveProperty("action_targets", [
      {
        target_ref: "e30",
        target_token: expect.stringMatching(/^[a-f0-9]{64}$/u),
        display_label: "button: Login",
      },
    ]);
    if (!("action_targets" in prepared))
      throw new Error("Missing successor targets");
    const currentTarget = prepared.action_targets[0];
    if (!currentTarget) throw new Error("Missing login target");
    // Native autofill marks the session but does not replace Browser Loop refs.
    mocks.vaultFilled = true;
    await expect(
      commitBrowserAction.execute(
        {
          action: "submit",
          browser_session_id: "browser-1",
          origin: "https://merchant.example",
          ...currentTarget,
          terms: {
            kind: "submit",
            description: "Log in to the designated test account",
          },
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).resolves.toMatchObject({ status: "dispatched" });
  });
  it("commits the observed icon target using its opaque token without copying label or frame", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      generations: [],
      refs: [
        [
          "e1",
          { frameId: "checkout-frame", role: "textbox", name: "Username" },
        ],
      ],
    });
    mocks.executeBrowserLoopTool.mockImplementationOnce(async () => {
      mocks.browserRefStateForSession.mockReturnValue({
        generations: [],
        refs: [
          [
            "e30",
            { frameId: "checkout-frame", role: "button", name: "\uf090 Login" },
          ],
        ],
      });
      return {
        content: [{ type: "text", text: 'button "\uf090 Login" [e30]' }],
        details: {},
      };
    });
    const prepared = await interactBrowserElement.execute(
      {
        action: { kind: "fill_field", value: "" },
        browser_session_id: "browser-1",
        frame_id: "checkout-frame",
        origin: "https://merchant.example",
        target_label: "textbox: Username",
        target_ref: "e1",
      },
      toolContextFor({ sessionId: "worker-session-1" })
    );
    if (!("action_targets" in prepared))
      throw new Error("Missing successor targets");
    if (!interactBrowserElement.toModelOutput)
      throw new Error("Missing projection");
    const projected = JSON.stringify(
      interactBrowserElement.toModelOutput(prepared)
    );
    expect(projected).toContain("target_token");
    const descriptor = prepared.action_targets[0];
    if (!descriptor) throw new Error("Missing login target");
    const tokenInput = commitBrowserActionInputSchema.parse({
      ...input,
      frame_id: undefined,
      target_label: undefined,
      target_ref: descriptor.target_ref,
      target_token: descriptor.target_token,
    });
    mocks.vaultFilled = true;
    await expect(
      commitBrowserAction.execute(
        tokenInput,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).resolves.toMatchObject({ status: "dispatched" });
    expect(mocks.assertKernelFrameOrigin).toHaveBeenLastCalledWith(
      expect.objectContaining({ frameId: "checkout-frame" })
    );
  });

  it("does not expose refreshed target names after vault fill", async () => {
    mocks.vaultFilled = true;
    mocks.browserRefStateForSession.mockReturnValue({
      generations: [],
      refs: [
        [
          "e1",
          { frameId: "checkout-frame", role: "textbox", name: "Username" },
        ],
      ],
    });
    mocks.executeBrowserLoopTool.mockImplementationOnce(async () => {
      mocks.browserRefStateForSession.mockReturnValue({
        generations: [],
        refs: [
          [
            "e30",
            {
              frameId: "checkout-frame",
              role: "button",
              name: "vault-sentinel",
            },
          ],
        ],
      });
      return {
        content: [{ type: "text", text: 'button "vault-sentinel" [e30]' }],
        details: {},
      };
    });
    const prepared = await interactBrowserElement.execute(
      {
        action: { kind: "fill_field", value: "" },
        browser_session_id: "browser-1",
        frame_id: "checkout-frame",
        origin: "https://merchant.example",
        target_label: "textbox: Username",
        target_ref: "e1",
      },
      toolContextFor({ sessionId: "worker-session-1" })
    );
    expect(JSON.stringify(prepared)).not.toContain("vault-sentinel");
    expect(prepared).not.toHaveProperty("action_targets");
  });

  it("rejects ambiguous buttons, links, and menuitems from the prompt-free path", async () => {
    mocks.browserRefStateForSession.mockReturnValue({
      generations: [],
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
