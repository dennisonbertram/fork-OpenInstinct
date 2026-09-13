import type { AccessScope } from "@/lib/access-scope";
import { findConnectionInstallation } from "@/db/services/connection-installations";
import { BudgetExceededError, checkBudget } from "@/db/services/usage";
import { env, isWorkspaceScopeEnforcementEnabled } from "@/env";
import { squareSubject } from "@/lib/square";

/**
 * Standard readiness status vocabulary from Plan 012.
 *
 * It is advisory only. It must never replace authorization, scope, budget,
 * origin/frame, idempotency, or approval checks in the executor.
 */
export type CapabilityReadinessStatus =
  | "ready"
  | "needs_authorization"
  | "needs_user_input"
  | "unsupported"
  | "unavailable"
  | "unknown";

export interface CapabilityReadinessResult {
  readonly status: CapabilityReadinessStatus;
  readonly reason: string;
  readonly legalNextAction?: string;
  readonly observedAt: string;
  readonly objectiveRevision?: string;
  readonly route: string;
}

export interface CapabilityReadinessInput {
  readonly route: string;
  readonly scope?: AccessScope;
  readonly objectiveRevision?: string;
}

/**
 * Evaluates capability readiness for one selected route before dispatch.
 *
 * Uses existing owner reads without opening browser connections or executing
 * live OAuth queries. Does not log secrets, account keys, or raw tokens.
 */
export async function checkCapabilityReadiness(
  input: CapabilityReadinessInput
): Promise<CapabilityReadinessResult> {
  const observedAt = new Date().toISOString();
  const { objectiveRevision, route, scope } = input;

  if (route === "browser") {
    return checkBrowserReadiness({
      objectiveRevision,
      observedAt,
      route,
      scope,
    });
  }

  if (route === "square") {
    return checkSquareReadiness({
      objectiveRevision,
      observedAt,
      route,
      scope,
    });
  }

  return {
    objectiveRevision,
    observedAt,
    reason: `Unsupported capability route: "${route}".`,
    route,
    status: "unsupported",
  };
}

async function checkBrowserReadiness(context: {
  readonly objectiveRevision?: string;
  readonly observedAt: string;
  readonly route: string;
  readonly scope?: AccessScope;
}): Promise<CapabilityReadinessResult> {
  const { objectiveRevision, observedAt, route, scope } = context;

  if (!env.KERNEL_API_KEY || env.KERNEL_API_KEY.trim().length === 0) {
    return {
      objectiveRevision,
      observedAt,
      reason: "Browser execution is not configured.",
      route,
      status: "unavailable",
    };
  }

  if (isWorkspaceScopeEnforcementEnabled()) {
    if (!scope) {
      return {
        objectiveRevision,
        observedAt,
        reason: "An authenticated workspace user is required.",
        route,
        status: "needs_authorization",
      };
    }

    try {
      await checkBudget(scope, "browser_session");
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        return {
          objectiveRevision,
          observedAt,
          reason: "Workspace browser session budget limit reached.",
          route,
          status: "unavailable",
        };
      }
      throw error;
    }
  }

  return {
    legalNextAction: "start worker",
    objectiveRevision,
    observedAt,
    reason: "Browser execution prerequisites satisfied.",
    route,
    status: "ready",
  };
}

async function checkSquareReadiness(context: {
  readonly objectiveRevision?: string;
  readonly observedAt: string;
  readonly route: string;
  readonly scope?: AccessScope;
}): Promise<CapabilityReadinessResult> {
  const { objectiveRevision, observedAt, route, scope } = context;

  const sandboxToken = env.SQUARE_SANDBOX_ACCESS_TOKEN?.trim();
  if (
    env.SQUARE_ENVIRONMENT === "sandbox" &&
    env.VERCEL_ENV !== "production" &&
    sandboxToken &&
    sandboxToken.length > 0
  ) {
    if (isWorkspaceScopeEnforcementEnabled() && !scope) {
      return {
        objectiveRevision,
        observedAt,
        reason: "An authenticated workspace user is required.",
        route,
        status: "needs_authorization",
      };
    }

    // Square API calls are not subject to workspace usage budgets (which track
    // browser_session, model_tokens, provider_message, and storage_bytes).
    return {
      objectiveRevision,
      observedAt,
      reason: "Sandbox access token configured.",
      route,
      status: "ready",
    };
  }

  if (
    !env.SQUARE_CONNECTOR_UID ||
    env.SQUARE_CONNECTOR_UID.trim().length === 0
  ) {
    return {
      objectiveRevision,
      observedAt,
      reason:
        "Square is not configured: set SQUARE_CONNECTOR_UID to enable it.",
      route,
      status: "unavailable",
    };
  }

  if (isWorkspaceScopeEnforcementEnabled()) {
    if (!scope) {
      return {
        objectiveRevision,
        observedAt,
        reason: "An authenticated workspace user is required.",
        route,
        status: "needs_authorization",
      };
    }

    const installationKey = {
      authorizationSubject: JSON.stringify(squareSubject(scope.userId)),
      connectorId: env.SQUARE_CONNECTOR_UID,
      provider: "square" as const,
    };

    const existing = await findConnectionInstallation(scope, installationKey);

    if (!existing) {
      return {
        legalNextAction: "use existing authorization challenge",
        objectiveRevision,
        observedAt,
        reason: "Square installation not found for workspace user.",
        route,
        status: "needs_authorization",
      };
    }

    if (existing.status === "revoked") {
      return {
        legalNextAction: "use existing authorization challenge",
        objectiveRevision,
        observedAt,
        reason: "Square connection has been revoked.",
        route,
        status: "needs_authorization",
      };
    }

    // Active installation presence is NOT valid-grant proof without an OAuth query
    return {
      objectiveRevision,
      observedAt,
      reason:
        "Square installation is present, but valid-grant status requires execution-time verification.",
      route,
      status: "unknown",
    };
  }

  return {
    objectiveRevision,
    observedAt,
    reason:
      "Square installation status cannot be verified without workspace scope.",
    route,
    status: "unknown",
  };
}
