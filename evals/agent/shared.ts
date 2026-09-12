import type { EveEvalContext, EveEvalTurn } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { z } from "zod";
import { sendMessageInputSchema } from "@/agent/lib/send-message";

export const agentEvalTags = ["agent", "behavior"] as const;

export async function requireDeliveredText(
  t: EveEvalContext,
  turn: EveEvalTurn
) {
  const delivery = turn.requireToolCall("send_message", {
    status: "completed",
  });
  // The tool's OUTPUT, not its input. `reportWithRecordedFacts` appends the
  // completion records inside `execute`, so the model's arguments are only half
  // of what the person receives. Reading `input` here meant every case asserting
  // on the delivered message -- that it carries no internal ids, that a worker's
  // claim keeps its attribution -- was checking the model's own prose and could
  // not see the appended report at all.
  //
  // Falls back to the input when a runner does not capture output, so a case
  // still has text to assert on rather than failing for the wrong reason.
  const delivered = sendMessageInputSchema.safeParse(delivery.output);
  const requested = sendMessageInputSchema.safeParse(delivery.input);
  const parsed = delivered.success ? delivered : requested;
  const text =
    parsed.success && parsed.data.kind === "message"
      ? parsed.data.text
      : undefined;
  const parsedText = z.string().trim().min(1).safeParse(text);

  await t.require(parsedText.success, equals(true));
  if (!parsedText.success) {
    throw new Error("send_message did not deliver non-empty text.");
  }
  return parsedText.data;
}

export function assertPlainTextDelivery(t: EveEvalContext, text: string) {
  t.check(
    text,
    satisfies<string>(
      (value) =>
        !/(?:^|\n)#{1,6}\s/u.test(value) &&
        !/(?:^|\n)\s*(?:[-*+] |\d+\. )/u.test(value) &&
        !/\*\*|```|\[[^\]]+\]\([^)]+\)/u.test(value),
      "delivery uses plain iMessage text instead of Markdown"
    )
  );
}
