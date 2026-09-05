import { z } from "zod";
import {
  defineDynamic,
  defineTool,
  toolOutput,
  type DynamicResolveContext,
} from "eve/tools";
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
    "step.started": (event, context) => {
      const parsed = stepEventSchema.safeParse(event);
      const turnId = parsed.success ? parsed.data.data.turnId : undefined;
      return finalDeliveryStatus(turnId) === "completed"
        ? null
        : resolveMessaging(context, turnId);
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
}

const stepEventSchema = z.object({ data: z.object({ turnId: z.string() }) });

function resolveMessaging(
  context: DynamicResolveContext,
  turnId: string | undefined
) {
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
      if (final)
        beginFinalDelivery(
          toolContext.session.turn.id,
          toolContext.callId,
          isLinq
        );
      return message;
    },
    toModelOutput() {
      return toolOutput.text(
        finalDeliveryStatus(turnId) === "completed"
          ? "Final message submitted. Delivery for this turn is complete. Finish the turn now with only DELIVERY_COMPLETE; do not call another tool or repeat the result."
          : finalDeliveryStatus(turnId) === "unconfirmed"
            ? "Linq did not confirm delivery. Do not claim the message arrived or repeat it automatically; verify its status or obtain user direction before retrying."
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

  return resolveModeValue(context, {
    interactive,
    "scheduled-report": sendOnly,
  });
}
