import { db } from "@/db";
import { createRevision, getAgent, listRevisions } from "@/db/services/agents";
import { agentManifestSchema } from "@/lib/agent-manifest";
import {
  apiError,
  apiErrorFor,
  apiJson,
  authorizeApiRequest,
  finalizeIdempotencyKey,
  parseJson,
  requiredIdempotencyKey,
  reserveIdempotencyKey,
} from "@/lib/api/v1-auth";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: RouteContext<"/v1/agents/[agentId]/revisions">
) {
  const auth = await authorizeApiRequest(request, "agents:write");
  if (auth.response) return auth.response;
  const { agentId } = await context.params;
  if (!(await getAgent(auth.context.scope, agentId)))
    return apiError(
      404,
      "not_found",
      "Resource not found.",
      auth.context.requestId
    );
  const idempotency = requiredIdempotencyKey(request, auth.context.requestId);
  if (!("key" in idempotency)) return idempotency.response;
  const body = await parseJson(request, agentManifestSchema);
  if ("error" in body)
    return apiError(400, "invalid_request", body.error, auth.context.requestId);
  const route = `/v1/agents/${agentId}/revisions`;
  try {
    const result = await db.transaction(async (transaction) => {
      const reservation = await reserveIdempotencyKey(
        auth.context.scope.workspaceId,
        route,
        idempotency.key,
        transaction
      );
      if (reservation.state !== "reserved") return reservation;
      const revision = await createRevision(
        auth.context.scope,
        agentId,
        body.data,
        transaction
      );
      await finalizeIdempotencyKey(
        auth.context.scope.workspaceId,
        route,
        idempotency.key,
        revision.id,
        201,
        transaction
      );
      return { state: "created" as const, revision };
    });
    if (result.state === "complete") {
      if (!result.row.resourceId)
        return apiError(
          409,
          "idempotency_conflict",
          "A request with this Idempotency-Key is in progress.",
          auth.context.requestId
        );
      const revision = (await listRevisions(auth.context.scope, agentId)).find(
        (row) => row.id === result.row.resourceId
      );
      if (revision)
        return apiJson(
          { data: revision },
          result.row.responseStatus,
          auth.context.requestId
        );
      return apiError(
        409,
        "idempotency_conflict",
        "A request with this Idempotency-Key is in progress.",
        auth.context.requestId
      );
    }
    if (result.state === "in_flight")
      return apiError(
        409,
        "idempotency_conflict",
        "A request with this Idempotency-Key is in progress.",
        auth.context.requestId
      );
    return apiJson({ data: result.revision }, 201, auth.context.requestId);
  } catch (error) {
    return apiErrorFor(
      error instanceof Error ? error : new Error(),
      auth.context.requestId
    );
  }
}
