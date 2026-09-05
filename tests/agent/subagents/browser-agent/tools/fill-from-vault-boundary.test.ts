/* oxlint-disable vitest/require-mock-type-parameters -- Hoisted module mocks are configured per test with the exact external values consumed by the tool. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentKernelPageOrigin: vi.fn(),
  retrieveBrowser: vi.fn(),
  markVaultFilledBrowserSession: vi.fn(),
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
vi.mock("@/lib/kernel", () => ({
  kernel: { browsers: { retrieve: mocks.retrieveBrowser } },
}));
vi.mock("@/db/services/vault", () => ({ readVaultItem: mocks.readVaultItem }));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/native", () => ({
  currentKernelPageOrigin: mocks.currentKernelPageOrigin,
  fillWithKernelNativeAutofill: mocks.fillWithKernelNativeAutofill,
  nativeAutofillTokens: {
    payment: ["cc-number"],
    login: ["username", "current-password"],
  },
}));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/provider", () => ({
  vaultAutofillProvider: {},
}));
vi.mock("@/agent/subagents/browser-agent/lib/autofill/service", () => ({
  materializeAutofillClaims: mocks.materializeAutofillClaims,
}));
vi.mock("@/agent/subagents/browser-agent/lib/vault-browser-guard", () => ({
  markVaultFilledBrowserSession: mocks.markVaultFilledBrowserSession,
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
  mocks.retrieveBrowser.mockResolvedValue({ profile_save_changes: true });
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
  it("passes explicit signup purpose only through the origin-bound writable login path", async () => {
    mocks.readVaultItem.mockResolvedValue({ id: "login-1", kind: "login" });
    mocks.materializeAutofillClaims.mockResolvedValue([
      { token: "username", value: "synthetic-user" },
      { token: "current-password", value: "synthetic-secret" },
    ]);
    const result = await fillFromVault.execute(
      {
        browserSessionId: "browser-1",
        candidateId: "login-1",
        purpose: "signup",
      },
      toolContextFor({ sessionId: "worker-session-1" })
    );
    expect(mocks.requireOwnedBrowserSession).toHaveBeenCalled();
    expect(mocks.retrieveBrowser).toHaveBeenCalled();
    expect(mocks.materializeAutofillClaims).toHaveBeenCalledWith(
      expect.anything(),
      "login-1",
      expect.objectContaining({ origin: "https://merchant.example" }),
      expect.anything()
    );
    expect(mocks.fillWithKernelNativeAutofill).toHaveBeenCalledWith(
      expect.objectContaining({
        loginPurpose: "signup",
        kind: "login",
        expectedOrigin: "https://merchant.example",
      })
    );
    expect(mocks.markVaultFilledBrowserSession).toHaveBeenCalledWith(
      "browser-1"
    );
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  it("keeps partial signup writes guarded and omits secret-bearing failure details", async () => {
    mocks.readVaultItem.mockResolvedValue({ id: "login-1", kind: "login" });
    mocks.materializeAutofillClaims.mockResolvedValue([
      { token: "current-password", value: "synthetic-partial-secret" },
    ]);
    const writes: string[] = [];
    let guardedAtWrite = false;
    mocks.fillWithKernelNativeAutofill.mockImplementationOnce(async () => {
      guardedAtWrite =
        mocks.markVaultFilledBrowserSession.mock.calls.length > 0;
      writes.push("password");
      throw new Error("Confirmation rejected synthetic-partial-secret");
    });
    const failure = await Promise.resolve()
      .then(() =>
        fillFromVault.execute(
          {
            browserSessionId: "browser-1",
            candidateId: "login-1",
            purpose: "signup",
          },
          toolContextFor({ sessionId: "worker-session-1" })
        )
      )
      .then(
        () => "unexpected success",
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Narrow the thrown transport boundary value before checking secret redaction.
        (error: unknown) =>
          error instanceof Error ? error.message : "Unexpected rejection"
      );
    expect(writes).toEqual(["password"]);
    expect(guardedAtWrite).toBe(true);
    expect(mocks.markVaultFilledBrowserSession).toHaveBeenCalledWith(
      "browser-1"
    );
    expect(failure).not.toContain("synthetic-partial-secret");
    expect(failure).toMatch(/partially filled/iu);
  });

  it("forwards explicit login compatibility while retaining the saved origin boundary", async () => {
    mocks.readVaultItem.mockResolvedValue({ id: "login-1", kind: "login" });
    mocks.materializeAutofillClaims.mockResolvedValue([]);
    await fillFromVault.execute(
      {
        browserSessionId: "browser-1",
        candidateId: "login-1",
        purpose: "login",
        allowNewPasswordField: true,
      },
      toolContextFor({ sessionId: "worker-session-1" })
    );
    expect(mocks.fillWithKernelNativeAutofill).toHaveBeenCalledWith(
      expect.objectContaining({
        loginPurpose: "login",
        allowNewPasswordField: true,
        expectedOrigin: "https://merchant.example",
      })
    );
  });
  it.each(["signup", undefined] as const)(
    "rejects compatibility without explicit login purpose: %s",
    async (purpose) => {
      mocks.readVaultItem.mockResolvedValue({ id: "login-1", kind: "login" });
      await expect(
        fillFromVault.execute(
          {
            browserSessionId: "browser-1",
            candidateId: "login-1",
            purpose,
            allowNewPasswordField: true,
          },
          toolContextFor({ sessionId: "worker-session-1" })
        )
      ).rejects.toThrow(/explicit login/iu);
      expect(mocks.materializeAutofillClaims).not.toHaveBeenCalled();
      expect(mocks.fillWithKernelNativeAutofill).not.toHaveBeenCalled();
    }
  );
  it("rejects login compatibility on a non-login item", async () => {
    mocks.readVaultItem.mockResolvedValue({ id: "contact-1", kind: "contact" });
    await expect(
      fillFromVault.execute(
        {
          browserSessionId: "browser-1",
          candidateId: "contact-1",
          purpose: "login",
          allowNewPasswordField: true,
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/saved login/iu);
    expect(mocks.materializeAutofillClaims).not.toHaveBeenCalled();
    expect(mocks.fillWithKernelNativeAutofill).not.toHaveBeenCalled();
  });

  it("rejects signup purpose on a non-login item before materializing or filling", async () => {
    mocks.readVaultItem.mockResolvedValue({ id: "contact-1", kind: "contact" });
    await expect(
      fillFromVault.execute(
        {
          browserSessionId: "browser-1",
          candidateId: "contact-1",
          purpose: "signup",
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/saved login/iu);
    expect(mocks.materializeAutofillClaims).not.toHaveBeenCalled();
    expect(mocks.fillWithKernelNativeAutofill).not.toHaveBeenCalled();
  });
  it("still rejects a read-only profile for signup", async () => {
    mocks.readVaultItem.mockResolvedValue({ id: "login-1", kind: "login" });
    mocks.retrieveBrowser.mockResolvedValue({ profile_save_changes: false });
    await expect(
      fillFromVault.execute(
        {
          browserSessionId: "browser-1",
          candidateId: "login-1",
          purpose: "signup",
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/save_changes/iu);
    expect(mocks.materializeAutofillClaims).not.toHaveBeenCalled();
    expect(mocks.fillWithKernelNativeAutofill).not.toHaveBeenCalled();
  });

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
