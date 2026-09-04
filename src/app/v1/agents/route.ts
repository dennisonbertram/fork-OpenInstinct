import { z } from "zod";
import { db } from "@/db";
import { createAgent, getAgent, listAgents } from "@/db/services/agents";
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
const createSchema = z.object({
  slug: z.string(),
  displayName: z.string().optional(),
});

export async function GET(request: Request) {
  const auth = await authorizeApiRequest(request, "agents:read");
  if (auth.response) return auth.response;
  return apiJson(
    { data: await listAgents(auth.context.scope) },
    200,
    auth.context.requestId
  );
}

export async function POST(request: Request) {
  const auth = await authorizeApiRequest(request, "agents:write");
  if (auth.response) return auth.response;
  const idempotency = requiredIdempotencyKey(request, auth.context.requestId);
  if (!("key" in idempotency)) return idempotency.response;
  const body = await parseJson(request, createSchema);
  if ("error" in body)
    return apiError(400, "invalid_request", body.error, auth.context.requestId);
  try {
    const result = await db.transaction(async (transaction) => {
      const reservation = await reserveIdempotencyKey(
        auth.context.scope.workspaceId,
        "/v1/agents",
        idempotency.key,
        transaction
      );
      if (reservation.state !== "reserved") return reservation;
      const agent = await createAgent(
        auth.context.scope,
        body.data,
        transaction
      );
      await finalizeIdempotencyKey(
        auth.context.scope.workspaceId,
        "/v1/agents",
        idempotency.key,
        agent.id,
        201,
        transaction
      );
      return { state: "created" as const, agent };
    });
    if (result.state === "complete") {
      if (!result.row.resourceId)
        return apiError(
          409,
          "idempotency_conflict",
          "A request with this Idempotency-Key is in progress.",
          auth.context.requestId
        );
      const agent = await getAgent(auth.context.scope, result.row.resourceId);
      if (agent)
        return apiJson(
          { data: agent },
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
    return apiJson({ data: result.agent }, 201, auth.context.requestId);
  } catch (error) {
    return apiErrorFor(
      error instanceof Error ? error : new Error(),
      auth.context.requestId
    );
  }
}
