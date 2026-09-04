import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import {
  contractEvalTags,
  deliveredMessages,
  deliveryComplete,
} from "./shared";

export default defineEval({
  description: "Two send_message calls are two ordered delivery requests.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("say first | second");
    t.succeeded();
    turn.calledTool("send_message", { count: 2 });
    t.check(
      deliveredMessages(turn).map((message) => message.text),
      equals(["first", "second"])
    );
    t.check(t.reply, equals(deliveryComplete));
  },
});
