import { headers } from "next/headers";
import { cache } from "react";
import { getAuthSession } from "@/auth/session";
import { accessScopeForUser, type AccessScope } from "@/lib/access-scope";
import { ensureScope, verifyScopeAccess } from "@/db/services/scope";
import { isWorkspaceScopeEnforcementEnabled } from "@/env";

export const requestScopeDependencies = {
  getAuthSession,
  headers,
  isWorkspaceScopeEnforcementEnabled,
  ensureScope,
  verifyScopeAccess,
};

export function createRequireRequestScope(
  dependencies = requestScopeDependencies
) {
  return cache(async (): Promise<AccessScope> => {
    const session = await dependencies.getAuthSession(
      await dependencies.headers()
    );
    if (!session) throw new UnauthenticatedError();
    const scope = accessScopeForUser(`better-auth:${session.user.id}`);
    const verifiedScope = await dependencies.verifyScopeAccess(scope);
    if (verifiedScope) return verifiedScope;
    await dependencies.ensureScope(scope);
    const bootstrappedScope = await dependencies.verifyScopeAccess(scope);
    if (!bootstrappedScope) throw new UnauthenticatedError();
    return bootstrappedScope;
  });
}

export const requireRequestScope = createRequireRequestScope();

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sign in to continue.");
    this.name = "UnauthenticatedError";
  }
}
