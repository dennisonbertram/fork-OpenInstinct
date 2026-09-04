import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import {
  contractEvalTags,
  deliveredMessages,
  deliveryComplete,
} from "./shared";

export default defineEval({
  description:
    "The agent delivery protocol carries images as HTTPS attachments, not base64 text.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("attach https://example.test/fixture.png");
    t.succeeded();
    turn.calledTool("send_message", { count: 1 });
    const deliveries = deliveredMessages(turn);
    t.check(deliveries.length, equals(1));
    const message = deliveries[0];
    t.check(
      message?.text === undefined &&
        message?.attachments?.[0]?.kind === "image" &&
        message.attachments[0].url === "https://example.test/fixture.png" &&
        !message.attachments[0].url.startsWith("data:"),
      equals(true)
    );
    t.check(t.reply, equals(deliveryComplete));
  },
});
