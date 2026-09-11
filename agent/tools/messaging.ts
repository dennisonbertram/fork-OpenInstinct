import { z } from "zod";
import {
  defineDynamic,
  defineTool,
  toolOutput,
  type DynamicResolveContext,
} from "eve/tools";
import {
  bindReportAttempt,
  reportPolicyForTurn,
  type ReportPolicy,
} from "../lib/completion-report-policy";
import { reportWithRecordedFacts } from "../lib/completion-report-text";
import {
  beginFinalDelivery,
  finalDeliveryStatus,
} from "../lib/message-delivery";
import { resolveModeValue } from "../lib/mode";
import {
  addReactionToMessageOutputSchema,
  reactToMessageOutputSchema,
} from "../lib/react-to-message";
import { sendMessageInputSchema } from "../lib/send-message";

export default defineDynamic({
  events: {
    // Clears registrations persisted before this resolver became step-scoped.
    "turn.started": () => null,
    "step.started": (event, context) => {
      const parsed = stepEventSchema.safeParse(event);
      const turnId = parsed.success ? parsed.data.data.turnId : undefined;
      return finalDeliveryStatus(turnId) !== undefined
        ? null
        : resolveMessaging(
            context,
            turnId,
            reportPolicyForTurn().kind === "must_report"
          );
    },
  },
});

function assertDeliveryOpen(turnId: string) {
  const status = finalDeliveryStatus(turnId);
  if (status === "pending") {
    throw new Error(
      "Final delivery is awaiting channel confirmation. Do not resend it."
    );
  }
  if (status === "completed") {
    throw new Error(
      "Final delivery already completed for this turn. Finish with DELIVERY_COMPLETE."
    );
  }
  if (status === "unconfirmed") {
    throw new Error(
      "Final delivery was not confirmed. Do not resend automatically; wait for user direction."
    );
  }
}

/**
 * Rejects anything that cannot be a completion summary while one is owed.
 *
 * A reaction, a non-final message, a bare link, and an attachment with no words
 * all fail for the same reason: settled background work owes the user a written
 * account, and none of these says anything about what happened.
 */
function assertCanSatisfyOwedReport(
  attempt:
    | { readonly tool: "react_to_message" }
    | {
        readonly tool: "send_message";
        readonly final: boolean | undefined;
        readonly kind: string;
        readonly text: string | undefined;
      },
  policy: ReportPolicy
) {
  // Read live, not captured when the tools were resolved. A tool retained from
  // an earlier step would otherwise escape this guard, which is the case it most
  // needs to cover.
  if (policy.kind !== "must_report") return;

  if (attempt.tool === "react_to_message") {
    throw new Error(
      "Background work finished and the user is owed a written summary of it, so a reaction cannot answer this turn. Send one final message saying what happened, what the evidence was, and anything still uncertain."
    );
  }
  if (attempt.kind !== "message") {
    throw new Error(
      "A written completion summary is owed, so send kind message with text. A standalone link does not say what happened."
    );
  }
  if (attempt.text === undefined || attempt.text.trim().length === 0) {
    throw new Error(
      "A written completion summary is owed, so this message needs text. Attachments alone do not say what happened."
    );
  }
  if (!attempt.final) {
    throw new Error(
      "A written completion summary is owed, so the message that reports the settled work must set final: true."
    );
  }
}

const stepEventSchema = z.object({ data: z.object({ turnId: z.string() }) });

function resolveMessaging(
  context: DynamicResolveContext,
  turnId: string | undefined,
  reportOwed = false
) {
  const isProviderChannel =
    context.channel.kind === "channel:linq" ||
    context.channel.kind === "channel:sendblue";
  const isLinq = context.channel.kind === "channel:linq";
  const send_message = defineTool({
    description:
      (finalDeliveryStatus(turnId) === "unconfirmed"
        ? "The previous final delivery was not confirmed by Linq. Do not claim it arrived or repeat it automatically: verify its status or obtain user direction before retrying. "
        : "") +
      "Send exactly one user-visible message to the current conversation. This is the delivery path for questions, progress updates, blockers, and final answers that need words. Choose kind message for plain text, private image artifacts, and HTTPS attachments; text and attachments may be combined. Text is delivered exactly as written, so write it the way it should appear to the user and do not use Markdown. Choose kind link with a URL to send a standalone link, rendered as a native Linq preview where supported. Put an ordinary URL in message text when a preview is not wanted. Call send_message multiple times only when you intentionally want separate messages. Set final: true on the last message after the requested work is done or blocked; it closes delivery for this turn. Leave final false for progress, a preview before approval, or when another distinct message is needed. Call it directly without an assistant-text preamble, and do not repeat delivered content afterward.",
    inputSchema: sendMessageInputSchema,
    execute({ final, ...message }, toolContext) {
      assertDeliveryOpen(toolContext.session.turn.id);
      const policy = reportPolicyForTurn();
      assertCanSatisfyOwedReport(
        {
          final,
          kind: message.kind,
          text: "text" in message ? message.text : undefined,
          tool: "send_message",
        },
        policy
      );
      // Bound before delivery begins, so a channel result always has a cohort
      // to settle. A refusal means another call in this turn already holds the
      // obligation, and this call must not pass for the summary.
      const bound =
        policy.kind === "must_report"
          ? bindReportAttempt({
              callId: toolContext.callId,
              cohortIds: policy.cohortIds,
              turnId: toolContext.session.turn.id,
            })
          : [];
      if (policy.kind === "must_report" && bound.length === 0) {
        throw new Error(
          "Another call in this turn already holds the owed completion summary. Do not send it again; finish the turn."
        );
      }
      if (final)
        beginFinalDelivery(
          toolContext.session.turn.id,
          toolContext.callId,
          isProviderChannel
        );
      // The records travel with the report. A shape check can see that text
      // exists, never what it says, so leaving the facts to the model's
      // cooperation is what let a progress note stand in for a summary in
      // production. Nothing is owed on an ordinary turn, and then this returns
      // the model's message exactly as written.
      // Exactly the cohorts this call took, which on success is every cohort
      // that was owed.
      return bound.length > 0 && message.kind === "message"
        ? {
            ...message,
            text: reportWithRecordedFacts(bound, message.text ?? ""),
          }
        : message;
    },
    toModelOutput() {
      return toolOutput.text(
        finalDeliveryStatus(turnId) === "completed"
          ? "Final message submitted. Delivery for this turn is complete. Finish the turn now with only DELIVERY_COMPLETE; do not call another tool or repeat the result."
          : finalDeliveryStatus(turnId) === "unconfirmed"
            ? "The messaging provider did not confirm delivery. Do not claim the message arrived or repeat it automatically; verify its status or obtain user direction before retrying."
            : "The message was submitted to the active channel; provider acceptance may still be pending. Do not send it again. Continue only if work or a distinct message remains; otherwise finish with DELIVERY_COMPLETE."
      );
    },
  });

  const react_to_message = defineTool({
    description: isLinq
      ? "Add or remove a native iMessage Tapback on the user's current message. Use this instead of send_message when a reaction fully communicates a lightweight acknowledgement and words would add nothing. Supports thumbs_up, thumbs_down, heart, laugh, exclamation (emphasis), and question."
      : "Acknowledge the user's current message with one compact reaction displayed in the conversation. Use this instead of send_message when the reaction fully communicates the response and words would add nothing. Supports thumbs_up, thumbs_down, heart, laugh, exclamation (emphasis), and question.",
    inputSchema: isLinq
      ? reactToMessageOutputSchema
      : addReactionToMessageOutputSchema,
    execute(reaction, toolContext) {
      assertDeliveryOpen(toolContext.session.turn.id);
      assertCanSatisfyOwedReport(
        { tool: "react_to_message" },
        reportPolicyForTurn()
      );
      if (reaction.operation === "add") {
        beginFinalDelivery(
          toolContext.session.turn.id,
          toolContext.callId,
          isProviderChannel
        );
      }
      return reaction;
    },
    toModelOutput() {
      return toolOutput.text(
        "The reaction was submitted to the active conversation. Do not repeat it in assistant text."
      );
    },
  });

  const sendOnly = { send_message };
  const interactive = { react_to_message, send_message };

  return resolveModeValue<typeof interactive | typeof sendOnly>(context, {
    // While a written summary is owed, offering a reaction invites the model to
    // answer with one. Removing it is the structural half of the guard; the
    // executor check above is what holds if the model calls it anyway.
    interactive: reportOwed ? sendOnly : interactive,
    "scheduled-report": sendOnly,
  });
}
