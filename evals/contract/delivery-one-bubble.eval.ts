import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { requireDeliveredText } from "@/evals/agent/shared";
import { contractEvalTags, deliveryComplete } from "./shared";

export default defineEval({
  description:
    "A reply is delivered through send_message; the final assistant text is only the marker.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("say hi there");
    t.succeeded();
    turn.calledTool("send_message", { count: 1 });
    t.check(await requireDeliveredText(t, turn), equals("hi there"));
    t.check(t.reply, equals(deliveryComplete));
  },
});
