import { connect } from "@vercel/connect/eve";
import type { ConnectionAuthResolver } from "eve/connections";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import {
  findConnectionInstallation,
  recordConnectionInstallation,
} from "@/db/services/connection-installations";
import { verifyScopeAccess } from "@/db/services/scope";
import {
  env,
  isContractFixtureEnabled,
  isWorkspaceScopeEnforcementEnabled,
} from "@/env";
import { squareScopes, squareSubject } from "@/lib/square";

export const squareAuth: ConnectionAuthResolver = async (ctx) => {
  if (
    env.SQUARE_ENVIRONMENT === "sandbox" &&
    env.VERCEL_ENV !== "production" &&
    env.SQUARE_SANDBOX_ACCESS_TOKEN
  ) {
    const token = env.SQUARE_SANDBOX_ACCESS_TOKEN;
    if (isContractFixtureEnabled()) {
      if (!isWorkspaceScopeEnforcementEnabled()) {
        throw new Error("Contract evals require workspace scope enforcement.");
      }
      const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
      if (caller?.principalType !== "user") {
        throw new Error("An authenticated workspace user is required.");
      }
      const scope = scopeFromPrincipal(caller);
      if (!(await verifyScopeAccess(scope))) {
        throw new Error("An authenticated workspace user is required.");
      }
      return {
        getToken: async () => ({ token }),
        principalType: "user" as const,
      };
    }
    return { getToken: async () => ({ token }) };
  }
  if (!env.SQUARE_CONNECTOR_UID) {
    throw new Error(
      "Square is not configured: set SQUARE_CONNECTOR_UID to enable it."
    );
  }
  if (isWorkspaceScopeEnforcementEnabled()) {
    const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
    if (!caller)
      throw new Error("An authenticated workspace user is required.");
    const scope = scopeFromPrincipal(caller);
    if (!(await verifyScopeAccess(scope))) {
      throw new Error("An authenticated workspace user is required.");
    }
    const installation = {
      authorizationSubject: JSON.stringify(squareSubject(scope.userId)),
      connectorId: env.SQUARE_CONNECTOR_UID,
      provider: "square" as const,
    };
    const existing = await findConnectionInstallation(scope, installation);
    // First-use is allowed so legacy Connect grants can bootstrap their tenant record.
    if (existing?.status === "revoked") {
      throw new Error("Square connection has been revoked.");
    }
    await recordConnectionInstallation(scope, {
      ...installation,
      scopes: squareScopes,
    });
  }
  return connect({
    connector: env.SQUARE_CONNECTOR_UID,
    createSubject(principal) {
      if (principal.type !== "user") {
        throw new Error("Square requires an authenticated OpenInstinct user.");
      }
      return squareSubject(principal.id);
    },
    tokenParams: { scopes: [...squareScopes] },
    validate: true,
  });
};
