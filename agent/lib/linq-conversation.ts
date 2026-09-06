import { defineState } from "eve/context";
import type { DynamicResolveContext } from "eve/tools";
import { z } from "zod";
import { env } from "@/env";
import { resolveModeValue } from "@/agent/lib/mode";

const treatmentState = defineState<{
  escalatedTurnId: string | null;
}>("openinstinct.linq-conversation", () => ({ escalatedTurnId: null }));
export const stepStartedEventSchema = z.object({
  data: z.object({ turnId: z.string() }),
});

export function isLinqConversationTreatment(
  context: Pick<DynamicResolveContext, "channel" | "session">
) {
  const principal = context.session.auth.current;
  return (
    context.channel.kind === "channel:linq" &&
    principal?.authenticator === "linq-message" &&
    resolveModeValue(context, { interactive: true }) === true &&
    env.LINQ_CONVERSATION_MODE === "on" &&
    env.LINQ_CONVERSATION_WORKSPACE_ID !== undefined &&
    principal.attributes.workspaceId ===
      env.LINQ_CONVERSATION_WORKSPACE_ID.trim()
  );
}

export function isLinqConversationFirstStep(
  turnId: string | undefined,
  context: Pick<DynamicResolveContext, "channel" | "session">
) {
  return (
    turnId !== undefined &&
    isLinqConversationTreatment(context) &&
    treatmentState.get().escalatedTurnId !== turnId
  );
}

export function escalateLinqConversation(turnId: string) {
  treatmentState.update(() => ({ escalatedTurnId: turnId }));
}

export function resolveLinqConversationCapability<T>(
  turnId: string | undefined,
  context: Pick<DynamicResolveContext, "channel" | "session">,
  value: T
) {
  return isLinqConversationFirstStep(turnId, context) ? null : value;
}
