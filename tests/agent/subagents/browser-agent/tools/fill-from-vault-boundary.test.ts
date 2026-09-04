/* oxlint-disable vitest/require-mock-type-parameters -- Hoisted module mocks are configured per test with the exact external values consumed by the tool. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentKernelPageOrigin: vi.fn(),
  fillWithKernelNativeAutofill: vi.fn(),
  materializeAutofillClaims: vi.fn(),
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
vi.mock("@/agent/subagents/browser-agent/lib/vault-browser-guard", () => ({
  markVaultFilledBrowserSession: vi.fn(),
}));

import fillFromVault from "@/agent/subagents/browser-agent/tools/fill_from_vault";
import { toolContextFor } from "@/tests/helpers/tool-context";

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
  mocks.readVaultItem.mockResolvedValue({
    id: "card-1",
    kind: "payment",
  });
  mocks.currentKernelPageOrigin.mockResolvedValue("https://merchant.example");
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
});

describe("vault payment commit boundary", () => {
  it("does not inject a payment vault handle through standalone fill_from_vault", async () => {
    await expect(
      fillFromVault.execute(
        { browserSessionId: "browser-1", candidateId: "card-1" },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/commit|place_order|approval/i);
    expect(mocks.fillWithKernelNativeAutofill).not.toHaveBeenCalled();
  });
});
