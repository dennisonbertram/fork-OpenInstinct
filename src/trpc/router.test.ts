import type {
  ConnectAuthorizationOptions,
  ConnectAuthorizationResponse,
  ConnectTokenParams,
  ConnectTokenSubject,
} from "@vercel/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as BrowserTraces from "@/db/services/browser-traces";
import * as Chats from "@/db/services/chats";
import type { AccessScope } from "@/lib/access-scope";
import {
  googleWorkspaceScopes,
  googleWorkspaceSubject,
  googleWorkspaceTokenParams,
} from "@/lib/google-workspace";
import { squareSubject, squareTokenParams } from "@/lib/square";

interface ConnectionInstallationKey {
  readonly authorizationSubject: string;
  readonly connectorId: string;
  readonly provider: string;
}

const mocks = vi.hoisted(() => ({
  deleteRevokedConnectionInstallation:
    vi.fn<
      (scope: AccessScope, key: ConnectionInstallationKey) => Promise<boolean>
    >(),
  googleConnectorUid: "google/test-uid",
  // SAFETY: literal starting value for a mutable per-test override; each
  // test assigns a real connector id or leaves it unset before calling.
  squareConnectorUid: undefined as string | undefined,
  revokeConnectionInstallation:
    vi.fn<
      (scope: AccessScope, key: ConnectionInstallationKey) => Promise<boolean>
    >(),
  revokeToken:
    vi.fn<
      (
        connector: string,
        params: { subject: ConnectTokenSubject; installationId?: string }
      ) => Promise<void>
    >(),
  scopeEnabled: vi.fn<() => boolean>(),
  startAuthorization:
    vi.fn<
      (
        connector: string,
        params: ConnectTokenParams,
        options?: ConnectAuthorizationOptions
      ) => Promise<ConnectAuthorizationResponse>
    >(),
}));
vi.mock("@vercel/connect", () => ({
  revokeToken: mocks.revokeToken,
  startAuthorization: mocks.startAuthorization,
}));
vi.mock("@/db/services/connection-installations", () => ({
  deleteRevokedConnectionInstallation:
    mocks.deleteRevokedConnectionInstallation,
  revokeConnectionInstallation: mocks.revokeConnectionInstallation,
}));
vi.mock(import("@/env"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get env() {
      return {
        ...actual.env,
        GOOGLE_CONNECTOR_UID: mocks.googleConnectorUid,
        SQUARE_CONNECTOR_UID: mocks.squareConnectorUid,
      };
    },
    isWorkspaceScopeEnforcementEnabled: mocks.scopeEnabled,
  };
});

const { appRouter } = await import("./router");

const listBrowserTracesMock = vi.spyOn(BrowserTraces, "listBrowserTraces");
const saveChatMock = vi.spyOn(Chats, "saveChat");

const scope = {
  userId: "user-1",
  workspaceId: "workspace-1",
} satisfies AccessScope;

describe("appRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.googleConnectorUid = "google/test-uid";
    mocks.squareConnectorUid = undefined;
    mocks.scopeEnabled.mockReturnValue(false);
    mocks.revokeToken.mockResolvedValue(undefined);
    mocks.startAuthorization.mockResolvedValue({
      request: "request-token",
      url: "https://connect.example.com/authorize",
      verifier: "verifier-token",
    });
    mocks.deleteRevokedConnectionInstallation.mockResolvedValue(true);
    mocks.revokeConnectionInstallation.mockResolvedValue(true);
  });

  it("passes the authenticated scope and cursor to the trace history", async () => {
    listBrowserTracesMock.mockResolvedValue({ nextCursor: null, traces: [] });

    await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .traces.list({ cursor: "next-page" });

    expect(listBrowserTracesMock).toHaveBeenCalledWith(scope, "next-page");
  });

  it("rejects invalid chat writes before persistence", async () => {
    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .chats.save({ sessionId: "" })
    ).rejects.toThrow("Too small");
    expect(saveChatMock).not.toHaveBeenCalled();
  });

  it("rejects square.update when no connector is configured", async () => {
    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .square.update("connect")
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("revokes the Square token and connection installation on disconnect", async () => {
    mocks.squareConnectorUid = "square/test-uid";
    mocks.scopeEnabled.mockReturnValue(true);
    mocks.revokeToken.mockResolvedValue(undefined);
    mocks.revokeConnectionInstallation.mockResolvedValue(true);

    const result = await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .square.update("disconnect");

    expect(result).toEqual({ redirectTo: "/?square=disconnected" });
    expect(mocks.revokeToken).toHaveBeenCalledWith("square/test-uid", {
      subject: squareSubject(scope.userId),
    });
    expect(mocks.revokeConnectionInstallation).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ provider: "square" })
    );
  });

  it("resolves square.update disconnect even when connection installation revocation fails", async () => {
    mocks.squareConnectorUid = "square/test-uid";
    mocks.scopeEnabled.mockReturnValue(true);
    mocks.revokeToken.mockResolvedValue(undefined);
    mocks.revokeConnectionInstallation.mockRejectedValue(new Error("boom"));
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .square.update("disconnect")
    ).resolves.toEqual({ redirectTo: "/?square=disconnected" });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("clears the revoked installation before starting authorization on connect", async () => {
    mocks.squareConnectorUid = "square/test-uid";
    mocks.scopeEnabled.mockReturnValue(true);
    mocks.deleteRevokedConnectionInstallation.mockResolvedValue(true);
    mocks.startAuthorization.mockResolvedValue({
      request: "request-token",
      url: "https://connect.example.com/authorize",
      verifier: "verifier-token",
    });

    const result = await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .square.update("connect");

    expect(result).toEqual({
      redirectTo: "https://connect.example.com/authorize",
    });
    expect(mocks.deleteRevokedConnectionInstallation).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({ provider: "square" })
    );
    const call = mocks.startAuthorization.mock.calls.at(0);
    if (!call) throw new Error("startAuthorization was not called");
    const [connectorId, tokenParams, options] = call;
    expect(connectorId).toBe("square/test-uid");
    expect(tokenParams).toEqual(squareTokenParams(scope.userId));
    expect(options?.callbackUrl ?? "").toMatch(/\/\?square=connected$/);
    const deleteOrder =
      mocks.deleteRevokedConnectionInstallation.mock.invocationCallOrder[0];
    const startOrder = mocks.startAuthorization.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(startOrder ?? Number.POSITIVE_INFINITY);
  });

  it("revokes the Google token and connection installation on disconnect", async () => {
    mocks.scopeEnabled.mockReturnValue(true);

    const result = await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .googleWorkspace.update("disconnect");

    expect(result).toEqual({ redirectTo: "/?google=disconnected" });
    expect(mocks.revokeToken).toHaveBeenCalledWith("google/test-uid", {
      subject: googleWorkspaceSubject(scope.userId),
    });
    expect(mocks.revokeConnectionInstallation).toHaveBeenCalledWith(
      scope,
      googleWorkspaceInstallationKey()
    );
  });

  it("does not revoke a Google installation while enforcement is off", async () => {
    const result = await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .googleWorkspace.update("disconnect");

    expect(result).toEqual({ redirectTo: "/?google=disconnected" });
    expect(mocks.revokeToken).toHaveBeenCalledOnce();
    expect(mocks.revokeConnectionInstallation).not.toHaveBeenCalled();
  });

  it("resolves googleWorkspace.update disconnect even when installation revocation fails", async () => {
    mocks.scopeEnabled.mockReturnValue(true);
    mocks.revokeConnectionInstallation.mockRejectedValue(new Error("boom"));
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .googleWorkspace.update("disconnect")
    ).resolves.toEqual({ redirectTo: "/?google=disconnected" });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("rejects googleWorkspace.update disconnect when remote token revocation fails, before local revocation", async () => {
    mocks.scopeEnabled.mockReturnValue(true);
    const remote = new Error("revoke-failed");
    mocks.revokeToken.mockRejectedValue(remote);

    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .googleWorkspace.update("disconnect")
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      cause: remote,
    });
    expect(mocks.revokeConnectionInstallation).not.toHaveBeenCalled();
  });

  it("clears the revoked Google installation before starting authorization on connect", async () => {
    mocks.scopeEnabled.mockReturnValue(true);

    const result = await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .googleWorkspace.update("connect");

    expect(result).toEqual({
      redirectTo: "https://connect.example.com/authorize",
    });
    expect(mocks.deleteRevokedConnectionInstallation).toHaveBeenCalledWith(
      scope,
      googleWorkspaceInstallationKey()
    );
    const call = mocks.startAuthorization.mock.calls.at(0);
    if (!call) throw new Error("startAuthorization was not called");
    const [connectorId, tokenParams, options] = call;
    expect(connectorId).toBe("google/test-uid");
    expect(tokenParams).toEqual(googleWorkspaceTokenParams(scope.userId));
    expect(options).toEqual({
      callbackUrl: "https://example.com/?google=connected",
      expiresInMs: 600_000,
    });
    const deleteOrder =
      mocks.deleteRevokedConnectionInstallation.mock.invocationCallOrder[0];
    const startOrder = mocks.startAuthorization.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(startOrder ?? Number.POSITIVE_INFINITY);
  });

  it("does not delete a revoked Google installation while enforcement is off", async () => {
    await appRouter
      .createCaller({ origin: "https://example.com", scope })
      .googleWorkspace.update("connect");

    expect(mocks.deleteRevokedConnectionInstallation).not.toHaveBeenCalled();
    expect(mocks.startAuthorization).toHaveBeenCalledOnce();
  });

  it("rejects googleWorkspace.update connect after deleting the revoked row when authorization start fails", async () => {
    mocks.scopeEnabled.mockReturnValue(true);
    const startFailed = new Error("start-failed");
    mocks.startAuthorization.mockRejectedValue(startFailed);

    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .googleWorkspace.update("connect")
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      cause: startFailed,
    });
    expect(mocks.deleteRevokedConnectionInstallation).toHaveBeenCalledOnce();
  });

  it("does not start Google authorization when revoked-installation deletion rejects", async () => {
    mocks.scopeEnabled.mockReturnValue(true);
    mocks.deleteRevokedConnectionInstallation.mockRejectedValue(
      new Error("delete-failed")
    );

    await expect(
      appRouter
        .createCaller({ origin: "https://example.com", scope })
        .googleWorkspace.update("connect")
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.startAuthorization).not.toHaveBeenCalled();
  });
});

function googleWorkspaceInstallationKey() {
  return {
    authorizationSubject: JSON.stringify(googleWorkspaceSubject(scope.userId)),
    connectorId: "google/test-uid",
    provider: "google",
    scopes: googleWorkspaceScopes,
  };
}
