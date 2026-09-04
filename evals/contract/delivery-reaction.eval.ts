import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { contractEvalTags, deliveryComplete } from "./shared";

export default defineEval({
  description: "A reaction is a complete reply with no text delivery.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("say ; react heart");
    t.succeeded();
    turn.calledTool("react_to_message", {
      count: 1,
      input: { operation: "add", type: "heart" },
    });
    turn.notCalledTool("send_message");
    t.check(t.reply, equals(deliveryComplete));
  },
});
