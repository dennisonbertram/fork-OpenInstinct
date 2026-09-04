import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRequireRequestScope,
  UnauthenticatedError,
} from "@/lib/request-scope";
import type { requestScopeDependencies } from "@/lib/request-scope";

const getAuthSession = vi.fn<typeof requestScopeDependencies.getAuthSession>();
const headers = vi.fn<typeof requestScopeDependencies.headers>();
const isWorkspaceScopeEnforcementEnabled =
  vi.fn<typeof requestScopeDependencies.isWorkspaceScopeEnforcementEnabled>();
const verifyScopeAccess =
  vi.fn<typeof requestScopeDependencies.verifyScopeAccess>();
const ensureScope = vi.fn<typeof requestScopeDependencies.ensureScope>();
const requireRequestScope = createRequireRequestScope({
  getAuthSession,
  headers,
  isWorkspaceScopeEnforcementEnabled,
  ensureScope,
  verifyScopeAccess,
});

beforeEach(() => {
  vi.clearAllMocks();
  headers.mockResolvedValue(new Headers());
  getAuthSession.mockResolvedValue({
    user: {
      id: "user-1",
      phoneNumber: "+12025550123",
      phoneNumberVerified: true,
    },
  });
  isWorkspaceScopeEnforcementEnabled.mockReturnValue(false);
  ensureScope.mockResolvedValue(undefined);
});

describe("request scope", () => {
  it("requires a verified membership for every authenticated request", async () => {
    verifyScopeAccess.mockResolvedValue({
      membershipStatus: "active",
      role: "owner",
      userId: "better-auth:user-1",
      workspaceId: "workspace-1",
    });

    await expect(requireRequestScope()).resolves.toMatchObject({
      membershipStatus: "active",
      role: "owner",
      userId: "better-auth:user-1",
    });
    expect(verifyScopeAccess).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "better-auth:user-1" })
    );
  });

  it("fails closed when membership or lifecycle admission is denied", async () => {
    verifyScopeAccess.mockResolvedValue(undefined);

    await expect(requireRequestScope()).rejects.toBeInstanceOf(
      UnauthenticatedError
    );
    expect(verifyScopeAccess).toHaveBeenCalled();
  });

  it("rejects denied scopes while enforcement is on", async () => {
    isWorkspaceScopeEnforcementEnabled.mockReturnValue(true);
    verifyScopeAccess.mockResolvedValue(undefined);

    await expect(requireRequestScope()).rejects.toBeInstanceOf(
      UnauthenticatedError
    );
  });
});
