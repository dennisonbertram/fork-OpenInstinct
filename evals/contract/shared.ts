import type { EveEvalTurn } from "eve/evals";
import { sendMessageOutputSchema } from "@/agent/lib/send-message";

export const contractEvalTags = ["contract"] as const;
export const deliveryComplete = "DELIVERY_COMPLETE";

export function deliveredMessages(turn: EveEvalTurn) {
  return turn.toolCalls.flatMap((call) => {
    if (call.name !== "send_message" || call.status !== "completed") return [];
    const parsed = sendMessageOutputSchema.safeParse(call.input);
    return parsed.success && parsed.data.kind === "message"
      ? [parsed.data]
      : [];
  });
}
