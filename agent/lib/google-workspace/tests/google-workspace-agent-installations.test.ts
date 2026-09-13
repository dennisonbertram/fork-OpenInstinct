import { ConnectError } from "@vercel/connect";
import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessScopeForUser } from "@/lib/access-scope";

// The shared principal-scope parser rejects a workspace that a `better-auth:`
// user does not own, so this fixture must use that user's real workspace id.
const aliceWorkspaceId = accessScopeForUser("better-auth:alice").workspaceId;

const mocks = vi.hoisted(() => ({
  findInstallation:
    vi.fn<() => Promise<{ readonly status: string } | undefined>>(),
  recordInstallation: vi.fn<() => Promise<void>>(),
  setCredentials:
    vi.fn<(credentials: { readonly access_token: string }) => void>(),
  scopeEnabled: vi.fn<() => boolean>(),
  verifyScope: vi.fn<
    () => Promise<
      | {
          readonly membershipStatus: string;
          readonly role: string;
          readonly userId: string;
          readonly workspaceId: string;
        }
      | undefined
    >
  >(),
}));
vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: class {
      setCredentials = mocks.setCredentials;
    },
  },
}));
vi.mock("@vercel/connect/eve", () => ({
  connect: vi.fn<() => { readonly connector: string }>(() => ({
    connector: "google/test",
  })),
}));
vi.mock("@/env", () => ({
  env: { GOOGLE_CONNECTOR_UID: "google/test" },
  isWorkspaceScopeEnforcementEnabled: mocks.scopeEnabled,
}));
vi.mock("@/db/services/connection-installations", () => ({
  findConnectionInstallation: mocks.findInstallation,
  recordConnectionInstallation: mocks.recordInstallation,
}));
vi.mock("@/db/services/scope", () => ({
  verifyScopeAccess: mocks.verifyScope,
}));

const { withGoogleAuth } = await import("@/agent/lib/google-workspace/client");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scopeEnabled.mockReturnValue(true);
  mocks.verifyScope.mockResolvedValue({
    membershipStatus: "active",
    role: "owner",
    userId: "better-auth:alice",
    workspaceId: aliceWorkspaceId,
  });
  mocks.findInstallation.mockResolvedValue(undefined);
  mocks.recordInstallation.mockResolvedValue(undefined);
});

describe("agent Google Workspace installation authorization", () => {
  it("denies a revoked installation before requesting a token", async () => {
    const ctx = toolContext();
    mocks.findInstallation.mockResolvedValue(installation("revoked"));
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toThrow(
      "revoked"
    );
    expect(ctx.getToken).not.toHaveBeenCalled();
  });
  it("bootstraps an absent installation after obtaining a token", async () => {
    const ctx = toolContext();
    await expect(withGoogleAuth(ctx, async () => "ok")).resolves.toBe("ok");
    expect(mocks.recordInstallation).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ provider: "google" })
    );
    expect(mocks.setCredentials).toHaveBeenCalledWith({
      access_token: "google-access-token",
    });
  });
  it("does not query installation state while enforcement is off", async () => {
    const ctx = toolContext();
    mocks.scopeEnabled.mockReturnValue(false);
    await withGoogleAuth(ctx, async () => "ok");
    expect(mocks.verifyScope).not.toHaveBeenCalled();
    expect(mocks.findInstallation).not.toHaveBeenCalled();
    expect(mocks.recordInstallation).not.toHaveBeenCalled();
  });

  it("replaces a missing-connector 404 with operator configuration guidance", async () => {
    const ctx = toolContext();
    const original = new ConnectError("secret-token-must-not-leak", {
      code: "not_found",
      status: 404,
    });
    ctx.getToken.mockRejectedValue(original);
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toThrow(
      missingConnectorMessage
    );
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.not.toThrow(
      "secret-token-must-not-leak"
    );
    expect(mocks.recordInstallation).not.toHaveBeenCalled();
    expect(mocks.setCredentials).not.toHaveBeenCalled();
  });

  it("replaces an unlinked-connector 403 with the same operator guidance", async () => {
    const ctx = toolContext();
    ctx.getToken.mockRejectedValue(
      new ConnectError("The connector is not linked to this project", {
        code: "forbidden",
        status: 403,
      })
    );
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toThrow(
      missingConnectorMessage
    );
    expect(mocks.recordInstallation).not.toHaveBeenCalled();
  });

  it("passes through a 403 forbidden that is not an unlinked connector", async () => {
    const ctx = toolContext();
    const original = new ConnectError("rate limited", {
      code: "forbidden",
      status: 403,
    });
    ctx.getToken.mockRejectedValue(original);
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toBe(
      original
    );
  });

  it("passes through a 404 that is not not_found", async () => {
    const ctx = toolContext();
    const original = new ConnectError("gone", {
      code: "gone",
      status: 404,
    });
    ctx.getToken.mockRejectedValue(original);
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toBe(
      original
    );
  });

  it("passes through a non-ConnectError that looks like a missing connector", async () => {
    const ctx = toolContext();
    const original = Object.assign(new Error("not_found"), {
      code: "not_found",
      status: 404,
    });
    ctx.getToken.mockRejectedValue(original);
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toBe(
      original
    );
  });

  it("passes through Eve's tool authorization signal unchanged", async () => {
    const ctx = toolContext();
    const original = Object.assign(new Error("Google authorization required"), {
      name: "ToolAuthorizationRequiredError",
      requests: [{ displayName: "Google" }],
    });
    ctx.getToken.mockRejectedValue(original);
    await expect(withGoogleAuth(ctx, async () => "unused")).rejects.toBe(
      original
    );
  });

  it("does not rewrite a matching ConnectError thrown by the Google call", async () => {
    const ctx = toolContext();
    const original = new ConnectError(
      "The connector is not linked to this project",
      {
        code: "forbidden",
        status: 403,
      }
    );
    await expect(
      withGoogleAuth(ctx, async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });

  it("propagates a sentinel thrown by requireAuth on Google 401", async () => {
    const ctx = toolContext();
    const sentinel = new Error("require-auth-sentinel");
    ctx.requireAuth.mockImplementation(() => {
      throw sentinel;
    });
    const google401 = Object.assign(new Error("google 401"), {
      response: { status: 401 },
    });
    await expect(
      withGoogleAuth(ctx, async () => {
        throw google401;
      })
    ).rejects.toBe(sentinel);
  });
});
const missingConnectorMessage =
  'Google Workspace is not configured for this project. GOOGLE_CONNECTOR_UID resolves to "google/test". Ask an operator to verify that this connector exists and is linked to this project in the current environment. See docs/operations/VERCEL.md, section "Google Workspace connector".';
function toolContext() {
  const getToken = vi
    .fn<ToolContext["getToken"]>()
    .mockResolvedValue({ token: "google-access-token" });
  const requireAuth = vi.fn<ToolContext["requireAuth"]>();
  return {
    async getSandbox() {
      throw new Error("Sandbox access is outside this focused test.");
    },
    getSkill() {
      throw new Error("Skill access is outside this focused test.");
    },
    abortSignal: new AbortController().signal,
    callId: "call-1",
    getToken,
    requireAuth,
    session: {
      auth: {
        current: {
          attributes: { workspaceId: aliceWorkspaceId },
          authenticator: "test",
          principalId: "better-auth:alice",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
      turn: { id: "turn-1", sequence: 0 },
    },
    toolName: "google-workspace-test",
  } satisfies ToolContext;
}
function installation(status = "active") {
  return {
    authorizationSubject: "google:alice",
    connectorId: "google/test",
    createdAt: "2026-08-31T00:00:00.000Z",
    id: "installation-1",
    provider: "google",
    revokedAt: null,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    status,
    updatedAt: "2026-08-31T00:00:00.000Z",
    workspaceId: aliceWorkspaceId,
  };
}
