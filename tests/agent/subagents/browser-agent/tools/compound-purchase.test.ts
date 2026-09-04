/* oxlint-disable vitest/require-mock-type-parameters -- Hoisted vendor-boundary mocks are configured with the exact values consumed by each compound-flow test. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertKernelFrameOrigin: vi.fn(),
  browserRefStateForSession: vi.fn(),
  currentKernelPageOrigin: vi.fn(),
  executeBrowserLoopTool: vi.fn(),
  fillWithKernelNativeAutofill: vi.fn(),
  materializeAutofillClaims: vi.fn(),
  markVaultFilledBrowserSession: vi.fn(),
  readVaultItem: vi.fn(),
  requireOwnedBrowserSession: vi.fn(),
  requireWorkerScope: vi.fn(),
}));

vi.mock("@/agent/subagents/browser-agent/lib/access", () => ({
  requireWorkerScope: mocks.requireWorkerScope,
}));
vi.mock("@/agent/subagents/browser-agent/lib/owned-browser", () => ({
  requireOwnedBrowserSession: mocks.requireOwnedBrowserSession,
}));
vi.mock("@/db/services/vault", () => ({ readVaultItem: mocks.readVaultItem }));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/native", () => ({
  assertKernelFrameOrigin: mocks.assertKernelFrameOrigin,
  currentKernelPageOrigin: mocks.currentKernelPageOrigin,
  fillWithKernelNativeAutofill: mocks.fillWithKernelNativeAutofill,
  nativeAutofillTokens: { payment: ["cc-number"] },
}));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/provider", () => ({
  vaultAutofillProvider: {},
}));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/service", () => ({
  materializeAutofillClaims: mocks.materializeAutofillClaims,
}));
vi.mock("@/agent/subagents/browser-agent/lib/semantic-loop", () => ({
  browserRefStateForSession: mocks.browserRefStateForSession,
  executeBrowserLoopTool: mocks.executeBrowserLoopTool,
}));
vi.mock("@/agent/subagents/browser-agent/lib/vault-browser-guard", () => ({
  markVaultFilledBrowserSession: mocks.markVaultFilledBrowserSession,
}));
vi.mock("@onkernel/browser-loop", () => ({
  loop: { tools: { browser: { act: () => ({ name: "browser_act" }) } } },
}));

import commitBrowserAction, {
  commitBrowserActionApproval,
  commitBrowserActionInputSchema,
} from "@/agent/subagents/browser-agent/tools/commit_browser_action";
import { toolContextFor } from "@/tests/helpers/tool-context";

const input = {
  action: "place_order" as const,
  browser_session_id: "browser-1",
  frame_id: "order-frame",
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
  payment: {
    candidate_id: "card-1",
    frame_id: "payment-frame",
    origin: "https://payments.example",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkerScope.mockResolvedValue({
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  mocks.requireOwnedBrowserSession.mockResolvedValue({
    sessionId: "browser-1",
  });
  mocks.currentKernelPageOrigin.mockResolvedValue("https://merchant.example");
  mocks.browserRefStateForSession.mockReturnValue({
    refs: [
      ["e12", { frameId: "order-frame", role: "button", name: "Place order" }],
    ],
  });
  mocks.assertKernelFrameOrigin.mockResolvedValue(true);
  mocks.readVaultItem.mockResolvedValue({ id: "card-1", kind: "payment" });
  mocks.materializeAutofillClaims.mockResolvedValue([
    {
      id: "00000000-0000-4000-8000-000000000001",
      token: "cc-number",
      value: "4111111111111111",
    },
  ]);
  mocks.fillWithKernelNativeAutofill.mockResolvedValue({
    filledClaims: 1,
    origin: "https://merchant.example",
  });
  mocks.executeBrowserLoopTool.mockResolvedValue({
    content: [],
    details: { statusText: "ok" },
  });
});

describe("approved compound purchase", () => {
  it.each([
    ["same-origin", "https://merchant.example"],
    ["cross-origin", "https://payments.example"],
  ])(
    "fills an authorized %s payment frame once, then commits the order",
    async (_label, paymentOrigin) => {
      const result = await commitBrowserAction.execute(
        { ...input, payment: { ...input.payment, origin: paymentOrigin } },
        toolContextFor({ sessionId: "worker-session-1" })
      );

      expect(mocks.fillWithKernelNativeAutofill).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizedFrameId: "payment-frame",
          authorizedFrameOrigin: paymentOrigin,
        })
      );
      expect(mocks.executeBrowserLoopTool).toHaveBeenCalledTimes(1);
      expect(mocks.markVaultFilledBrowserSession).toHaveBeenCalledWith(
        "browser-1"
      );
      expect(
        mocks.markVaultFilledBrowserSession.mock.invocationCallOrder[0]
      ).toBeLessThan(
        mocks.executeBrowserLoopTool.mock.invocationCallOrder[0] ?? Infinity
      );
      expect(result).toMatchObject({
        action: "place_order",
        status: "dispatched",
      });
      expect(JSON.stringify(result)).not.toContain("4111111111111111");
    }
  );

  it("does not click when the authorized payment frame navigates or rejects", async () => {
    mocks.fillWithKernelNativeAutofill.mockRejectedValue(
      new Error("payment frame changed")
    );

    await expect(
      commitBrowserAction.execute(
        input,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/payment frame changed/i);
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
    expect(mocks.markVaultFilledBrowserSession).not.toHaveBeenCalled();
  });

  it("taints the session before a changed order target can abort the commit", async () => {
    mocks.browserRefStateForSession
      .mockReturnValueOnce({
        refs: [
          [
            "e12",
            { frameId: "order-frame", role: "button", name: "Place order" },
          ],
        ],
      })
      .mockReturnValueOnce({ refs: [] });

    await expect(
      commitBrowserAction.execute(
        input,
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/order target changed/i);
    expect(mocks.markVaultFilledBrowserSession).toHaveBeenCalledWith(
      "browser-1"
    );
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
  });

  it("returns uncertain without retrying when the final click outcome is uncertain", async () => {
    mocks.executeBrowserLoopTool.mockResolvedValue({
      content: [],
      details: { statusText: "uncertain", isError: true },
    });

    const result = await commitBrowserAction.execute(
      input,
      toolContextFor({ sessionId: "worker-session-1" })
    );
    expect(result).toMatchObject({ status: "uncertain" });
    expect(mocks.executeBrowserLoopTool).toHaveBeenCalledTimes(1);
  });

  it("keeps changed material terms behind the always-approval policy", () => {
    expect(commitBrowserAction.approval).toBe(commitBrowserActionApproval);
    expect(
      commitBrowserActionInputSchema.safeParse({
        ...input,
        terms: { ...input.terms, total: "USD 11.00" },
      }).success
    ).toBe(true);
  });

  it("rejects mismatched action terms before requesting approval", () => {
    expect(
      commitBrowserActionInputSchema.safeParse({
        ...input,
        action: "submit",
        payment: undefined,
      }).success
    ).toBe(false);
  });

  it("rejects a payment handle on non-order actions before injection", async () => {
    expect(
      commitBrowserActionInputSchema.safeParse({
        ...input,
        action: "send_message",
        terms: {
          kind: "send_message",
          recipient: "Ada",
          content: "The order is ready.",
        },
      }).success
    ).toBe(false);

    await expect(
      commitBrowserAction.execute(
        {
          ...input,
          action: "send_message",
          terms: {
            kind: "send_message",
            recipient: "Ada",
            content: "The order is ready.",
          },
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/place_order|payment/i);
    expect(mocks.fillWithKernelNativeAutofill).not.toHaveBeenCalled();
    expect(mocks.executeBrowserLoopTool).not.toHaveBeenCalled();
  });
});
