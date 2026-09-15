import {
  defineDynamic,
  type DynamicConnectionEvents,
  defineOpenAPIConnection,
  type DynamicConnectionResolveContext,
} from "eve/connections";
import { z } from "zod";
import { squareAuth } from "@/agent/lib/square/auth";
import { isChannelObservedSession } from "@/agent/lib/mode";
import { squareReadOperations } from "@/agent/lib/square/operations";
import { env } from "@/env";
import { squareBaseUrl } from "@/lib/square";

export default defineDynamic({
  events: {
    "session.started": resolveSquare,
    "turn.started": resolveSquare,
  },
});

function resolveSquare(
  _event: Parameters<
    NonNullable<DynamicConnectionEvents["session.started"]>
  >[0],
  context: DynamicConnectionResolveContext
) {
  if (isChannelObservedSession(context)) return null;
  const principal =
    context.session.auth.current ?? context.session.auth.initiator;
  const workspaceId = z
    .string()
    .min(1)
    .safeParse(principal?.attributes.workspaceId);
  const principalId = z.string().min(1).safeParse(principal?.principalId);
  // Dynamic connections need a stable, non-secret identity. This keeps
  // Eve's durable auth binding scoped to the existing user/workspace while
  // leaving squareAuth and its approved authorization behavior unchanged.
  const instanceKey =
    workspaceId.success && principalId.success
      ? `${workspaceId.data}:${principalId.data}`
      : "square-runtime";
  return defineOpenAPIConnection({
    spec: "https://raw.githubusercontent.com/square/connect-api-specification/551af55f16fce178780e6556570973aaf660e52a/api.json",
    baseUrl: squareBaseUrl(env.SQUARE_ENVIRONMENT, env.SQUARE_BASE_URL),
    description:
      "The connected user's Square seller account: locations, catalog items, customers, orders, payments, invoices, inventory, and bookings. Read-only.",
    headers: { "Square-Version": "2025-04-16" },
    instanceKey,
    operations: { allow: squareReadOperations },
    auth: squareAuth,
  });
}
