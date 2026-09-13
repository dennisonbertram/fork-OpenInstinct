import { auth } from "@googleapis/gmail";
import { ConnectError } from "@vercel/connect";
import { connect, type EveAuthorizationOptions } from "@vercel/connect/eve";
import type { ToolContext } from "eve/tools";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import {
  findConnectionInstallation,
  recordConnectionInstallation,
} from "@/db/services/connection-installations";
import { verifyScopeAccess } from "@/db/services/scope";
import { z } from "zod";
import { env, isWorkspaceScopeEnforcementEnabled } from "@/env";
import {
  googleWorkspaceSubject,
  googleWorkspaceScopes,
} from "@/lib/google-workspace";

export const googleWorkspaceAuthOptions = {
  connector: env.GOOGLE_CONNECTOR_UID,
  createSubject(principal) {
    if (principal.type !== "user") {
      throw new Error(
        "Google Workspace requires an authenticated OpenInstinct user."
      );
    }
    return googleWorkspaceSubject(principal.id);
  },
  displayName: "Google",
  instructions: "Connect Google to continue.",
  tokenParams: { scopes: [...googleWorkspaceScopes] },
  validate: true,
} satisfies EveAuthorizationOptions;

const googleWorkspaceAuth = connect(googleWorkspaceAuthOptions);

export async function withGoogleAuth<T>(
  ctx: ToolContext,
  execute: (authClient: InstanceType<typeof auth.OAuth2>) => Promise<T>
) {
  let connection:
    | {
        installation: {
          authorizationSubject: string;
          connectorId: string;
          provider: "google";
        };
        scope: ReturnType<typeof scopeFromPrincipal>;
      }
    | undefined;
  if (isWorkspaceScopeEnforcementEnabled()) {
    const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
    if (!caller)
      throw new Error("An authenticated workspace user is required.");
    const scope = scopeFromPrincipal(caller);
    if (!(await verifyScopeAccess(scope))) {
      throw new Error("An authenticated workspace user is required.");
    }
    connection = {
      installation: {
        authorizationSubject: JSON.stringify(
          googleWorkspaceSubject(scope.userId)
        ),
        connectorId: env.GOOGLE_CONNECTOR_UID,
        provider: "google",
      },
      scope,
    };
    const existing = await findConnectionInstallation(
      connection.scope,
      connection.installation
    );
    // First-use is allowed so legacy Connect grants can bootstrap their tenant record.
    if (existing?.status === "revoked") {
      throw new Error("Google Workspace connection has been revoked.");
    }
  }
  let token: string;
  try {
    ({ token } = await ctx.getToken(googleWorkspaceAuth));
  } catch (error) {
    // Mirrors @vercel/connect 2.0.0 isMissingConnectorOrProjectLink
    // (eve/connection-authorization.js). That predicate is not exported.
    if (isMissingGoogleConnector(error)) {
      // oxlint-disable-next-line eslint/preserve-caught-error -- this replacement is operator-facing; it must not carry vendor payload or the original ConnectError as cause.
      throw new Error(
        `Google Workspace is not configured for this project. GOOGLE_CONNECTOR_UID resolves to "${env.GOOGLE_CONNECTOR_UID}". Ask an operator to verify that this connector exists and is linked to this project in the current environment. See docs/operations/VERCEL.md, section "Google Workspace connector".`
      );
    }
    throw error;
  }
  if (connection) {
    await recordConnectionInstallation(connection.scope, {
      ...connection.installation,
      scopes: googleWorkspaceScopes,
    });
  }
  const authClient = new auth.OAuth2();
  authClient.setCredentials({ access_token: token });

  try {
    return await execute(authClient);
  } catch (error) {
    if (googleApiErrorStatus(error) === 401) {
      ctx.requireAuth(googleWorkspaceAuth);
    }
    throw error;
  }
}

const googleApiErrorSchema = z.object({
  response: z.object({ status: z.number() }),
});

export function googleApiErrorStatus(cause: unknown) {
  const result = googleApiErrorSchema.safeParse(cause);
  return result.success ? result.data.response.status : undefined;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch clauses yield unknown; this is the instanceof ConnectError boundary.
function isMissingGoogleConnector(error: unknown) {
  if (!(error instanceof ConnectError)) {
    return false;
  }
  if (error.status === 404 && error.code === "not_found") {
    return true;
  }
  return (
    error.status === 403 &&
    error.code === "forbidden" &&
    /connector is not linked to this project/i.test(error.message)
  );
}
