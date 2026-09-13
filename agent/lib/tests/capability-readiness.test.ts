import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessScope } from "@/lib/access-scope";
import { accessScopeForUser } from "@/lib/access-scope";
import { BudgetExceededError } from "@/db/services/usage";

const aliceScope: AccessScope = accessScopeForUser("better-auth:alice");

interface MockEnv {
  KERNEL_API_KEY: string;
  SQUARE_BASE_URL?: string;
  SQUARE_CONNECTOR_UID: string;
  SQUARE_ENVIRONMENT: string;
  SQUARE_SANDBOX_ACCESS_TOKEN?: string;
  VERCEL_ENV: string;
}

const mocks = vi.hoisted(() => {
  const envState: MockEnv = {
    KERNEL_API_KEY: "test-kernel-key",
    SQUARE_CONNECTOR_UID: "square/test",
    SQUARE_ENVIRONMENT: "production",
    VERCEL_ENV: "production",
  };

  return {
    checkBudget: vi.fn<() => Promise<void>>(),
    env: envState,
    findInstallation: vi.fn<
      (
        scope: AccessScope,
        key: {
          authorizationSubject: string;
          connectorId: string;
          provider: string;
        }
      ) => Promise<{ readonly status: string } | undefined>
    >(),
    scopeEnabled: vi.fn<() => boolean>(),
  };
});

vi.mock("@/env", () => ({
  env: mocks.env,
  isWorkspaceScopeEnforcementEnabled: mocks.scopeEnabled,
}));

vi.mock("@/db/services/connection-installations", () => ({
  findConnectionInstallation: mocks.findInstallation,
}));

vi.mock("@/db/services/usage", () => ({
  BudgetExceededError: class MockBudgetExceededError extends Error {
    constructor(
      readonly kind: string,
      readonly limit: number
    ) {
      super("Workspace usage limit reached. Please try again later.");
      this.name = "BudgetExceededError";
    }
  },
  checkBudget: mocks.checkBudget,
}));

import {
  checkCapabilityReadiness,
  type CapabilityReadinessStatus,
} from "@/agent/lib/capability-readiness";

describe("checkCapabilityReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scopeEnabled.mockReturnValue(true);
    mocks.env.KERNEL_API_KEY = "test-kernel-key";
    mocks.env.SQUARE_CONNECTOR_UID = "square/test";
    mocks.env.SQUARE_ENVIRONMENT = "production";
    mocks.env.SQUARE_SANDBOX_ACCESS_TOKEN = undefined;
    mocks.env.VERCEL_ENV = "production";
    mocks.findInstallation.mockResolvedValue(undefined);
    mocks.checkBudget.mockResolvedValue(undefined);
  });

  describe("browser route", () => {
    it("reports ready with legal next action when KERNEL_API_KEY and budget are valid", async () => {
      const result = await checkCapabilityReadiness({
        objectiveRevision: "rev_1",
        route: "browser",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        legalNextAction: "start worker",
        objectiveRevision: "rev_1",
        reason: "Browser execution prerequisites satisfied.",
        route: "browser",
        status: "ready",
      });
      expect(result.observedAt).toBeDefined();
      expect(new Date(result.observedAt).toString()).not.toBe("Invalid Date");
    });

    it("reports unavailable when KERNEL_API_KEY is missing", async () => {
      mocks.env.KERNEL_API_KEY = "";

      const result = await checkCapabilityReadiness({
        route: "browser",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        reason: "Browser execution is not configured.",
        route: "browser",
        status: "unavailable",
      });
      expect(result.legalNextAction).toBeUndefined();
    });

    it("reports unavailable when browser session budget is exceeded", async () => {
      mocks.checkBudget.mockRejectedValue(
        new BudgetExceededError("browser_session", 10)
      );

      const result = await checkCapabilityReadiness({
        route: "browser",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        reason: "Workspace browser session budget limit reached.",
        route: "browser",
        status: "unavailable",
      });
      expect(result.legalNextAction).toBeUndefined();
    });

    it("reports needs_authorization when scope is missing and scope enforcement is enabled", async () => {
      const result = await checkCapabilityReadiness({
        route: "browser",
      });

      expect(result).toMatchObject({
        reason: "An authenticated workspace user is required.",
        route: "browser",
        status: "needs_authorization",
      });
    });

    it("never includes API key or token in browser readiness reason", async () => {
      mocks.env.KERNEL_API_KEY = "super-secret-key-12345";

      const result = await checkCapabilityReadiness({
        route: "browser",
        scope: aliceScope,
      });

      expect(JSON.stringify(result)).not.toContain("super-secret-key-12345");
    });
  });

  describe("square route", () => {
    it("reports unavailable when Square is not configured", async () => {
      mocks.env.SQUARE_CONNECTOR_UID = "";

      const result = await checkCapabilityReadiness({
        route: "square",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        reason:
          "Square is not configured: set SQUARE_CONNECTOR_UID to enable it.",
        route: "square",
        status: "unavailable",
      });
    });

    it("reports ready in non-production sandbox when sandbox access token is set", async () => {
      mocks.env.SQUARE_ENVIRONMENT = "sandbox";
      mocks.env.VERCEL_ENV = "preview";
      mocks.env.SQUARE_SANDBOX_ACCESS_TOKEN = "sandbox-token-xyz";

      const result = await checkCapabilityReadiness({
        route: "square",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        reason: "Sandbox access token configured.",
        route: "square",
        status: "ready",
      });
      expect(JSON.stringify(result)).not.toContain("sandbox-token-xyz");
    });

    it("requires scope in sandbox when scope enforcement is enabled", async () => {
      mocks.env.SQUARE_ENVIRONMENT = "sandbox";
      mocks.env.VERCEL_ENV = "preview";
      mocks.env.SQUARE_SANDBOX_ACCESS_TOKEN = "sandbox-token-xyz";

      const result = await checkCapabilityReadiness({
        route: "square",
      });

      expect(result).toMatchObject({
        reason: "An authenticated workspace user is required.",
        route: "square",
        status: "needs_authorization",
      });
    });

    it("does not treat whitespace-only sandbox token as ready", async () => {
      mocks.env.SQUARE_ENVIRONMENT = "sandbox";
      mocks.env.VERCEL_ENV = "preview";
      mocks.env.SQUARE_SANDBOX_ACCESS_TOKEN = "    ";
      mocks.env.SQUARE_CONNECTOR_UID = "";

      const result = await checkCapabilityReadiness({
        route: "square",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        reason:
          "Square is not configured: set SQUARE_CONNECTOR_UID to enable it.",
        route: "square",
        status: "unavailable",
      });
    });

    it("reports needs_authorization when no installation exists", async () => {
      mocks.findInstallation.mockResolvedValue(undefined);

      const result = await checkCapabilityReadiness({
        objectiveRevision: "rev_square_1",
        route: "square",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        legalNextAction: "use existing authorization challenge",
        objectiveRevision: "rev_square_1",
        reason: "Square installation not found for workspace user.",
        route: "square",
        status: "needs_authorization",
      });
    });

    it("reports needs_authorization when installation status is revoked", async () => {
      mocks.findInstallation.mockResolvedValue({ status: "revoked" });

      const result = await checkCapabilityReadiness({
        route: "square",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        legalNextAction: "use existing authorization challenge",
        reason: "Square connection has been revoked.",
        route: "square",
        status: "needs_authorization",
      });
    });

    it("reports unknown when installation is active because valid grant requires execution check", async () => {
      mocks.findInstallation.mockResolvedValue({ status: "active" });

      const result = await checkCapabilityReadiness({
        route: "square",
        scope: aliceScope,
      });

      expect(result).toMatchObject({
        reason:
          "Square installation is present, but valid-grant status requires execution-time verification.",
        route: "square",
        status: "unknown",
      });
      expect(result.legalNextAction).toBeUndefined();
    });

    it("reports needs_authorization when scope is missing and scope enforcement is enabled", async () => {
      const result = await checkCapabilityReadiness({
        route: "square",
      });

      expect(result).toMatchObject({
        reason: "An authenticated workspace user is required.",
        route: "square",
        status: "needs_authorization",
      });
    });
  });

  describe("stale readiness and revision tracking", () => {
    it("reflects revoked status on subsequent check after an active installation is revoked", async () => {
      mocks.findInstallation.mockResolvedValue({ status: "active" });

      const initial = await checkCapabilityReadiness({
        objectiveRevision: "rev_1",
        route: "square",
        scope: aliceScope,
      });
      expect(initial.status).toBe("unknown");
      expect(initial.objectiveRevision).toBe("rev_1");

      // Installation is revoked in database
      mocks.findInstallation.mockResolvedValue({ status: "revoked" });

      const refreshed = await checkCapabilityReadiness({
        objectiveRevision: "rev_2",
        route: "square",
        scope: aliceScope,
      });
      expect(refreshed.status).toBe("needs_authorization");
      expect(refreshed.legalNextAction).toBe(
        "use existing authorization challenge"
      );
      expect(refreshed.objectiveRevision).toBe("rev_2");
    });
  });

  describe("unsupported route", () => {
    it("reports unsupported for unrecognized routes", async () => {
      const result = await checkCapabilityReadiness({
        route: "non-existent-route",
        scope: aliceScope,
      });

      const expectedStatus: CapabilityReadinessStatus = "unsupported";
      expect(result).toMatchObject({
        reason: 'Unsupported capability route: "non-existent-route".',
        route: "non-existent-route",
        status: expectedStatus,
      });
    });
  });
});
