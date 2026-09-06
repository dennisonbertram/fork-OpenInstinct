import { defineState } from "eve/context";
import type { DynamicResolveContext } from "eve/tools";
import { useLogger as evlogLogger } from "evlog/eve";
import { z } from "zod";
import { env } from "@/env";
import { resolveModeValue } from "@/agent/lib/mode";

const treatmentState = defineState<{
  escalatedTurnId: string | null;
}>("openinstinct.linq-conversation", () => ({ escalatedTurnId: null }));
export const stepStartedEventSchema = z.object({
  data: z.object({ turnId: z.string() }),
});

interface LinqConversationTreatmentSelection {
  readonly authenticatorIsLinqMessage: boolean;
  readonly channelIsLinq: boolean;
  readonly interactiveMode: boolean;
  readonly selected: boolean;
  readonly targetWorkspaceConfigured: boolean;
  readonly workspaceMatches: boolean;
}

function resolveLinqConversationTreatmentSelection(
  context: Pick<DynamicResolveContext, "channel" | "session">
): LinqConversationTreatmentSelection {
  const principal = context.session.auth.current;
  const channelIsLinq = context.channel.kind === "channel:linq";
  const authenticatorIsLinqMessage =
    principal?.authenticator === "linq-message";
  const interactiveMode =
    resolveModeValue(context, { interactive: true }) === true;
  const targetWorkspaceId = env.LINQ_CONVERSATION_WORKSPACE_ID;
  const targetWorkspaceConfigured = targetWorkspaceId !== undefined;
  const workspaceMatches =
    targetWorkspaceId !== undefined &&
    principal?.attributes.workspaceId === targetWorkspaceId.trim();
  return {
    authenticatorIsLinqMessage,
    channelIsLinq,
    interactiveMode,
    selected:
      channelIsLinq &&
      authenticatorIsLinqMessage &&
      interactiveMode &&
      env.LINQ_CONVERSATION_MODE === "on" &&
      targetWorkspaceConfigured &&
      workspaceMatches,
    targetWorkspaceConfigured,
    workspaceMatches,
  };
}

export function recordLinqConversationRoleSelection(
  context: Pick<DynamicResolveContext, "channel" | "session">
) {
  const selection = resolveLinqConversationTreatmentSelection(context);
  if (env.LINQ_CONVERSATION_MODE === "on") {
    evlogLogger(context).set({
      experiment: {
        linqConversation: {
          authenticatorIsLinqMessage: selection.authenticatorIsLinqMessage,
          channelIsLinq: selection.channelIsLinq,
          interactiveMode: selection.interactiveMode,
          roleSelected: selection.selected,
          targetWorkspaceConfigured: selection.targetWorkspaceConfigured,
          workspaceMatches: selection.workspaceMatches,
        },
      },
    });
  }
  return selection.selected;
}

export function isLinqConversationFirstStep(
  turnId: string | undefined,
  context: Pick<DynamicResolveContext, "channel" | "session">
) {
  return (
    turnId !== undefined &&
    resolveLinqConversationTreatmentSelection(context).selected &&
    treatmentState.get().escalatedTurnId !== turnId
  );
}

export function escalateLinqConversation(
  turnId: string,
  context?: Pick<DynamicResolveContext, "session">
) {
  treatmentState.update(() => ({ escalatedTurnId: turnId }));
  if (context && env.LINQ_CONVERSATION_MODE === "on") {
    evlogLogger(context).set({
      experiment: { linqConversation: { escalated: true } },
    });
  }
}

export function resolveLinqConversationCapability<T>(
  turnId: string | undefined,
  context: Pick<DynamicResolveContext, "channel" | "session">,
  value: T
) {
  const suppressed = isLinqConversationFirstStep(turnId, context);
  if (env.LINQ_CONVERSATION_MODE === "on") {
    evlogLogger(context).set({
      experiment: {
        linqConversation: { projectCapabilitySuppressed: suppressed },
      },
    });
  }
  return suppressed ? null : value;
}
