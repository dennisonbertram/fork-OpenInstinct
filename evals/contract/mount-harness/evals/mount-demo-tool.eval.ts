import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "A mounted extension tool is callable as mount__tool.",
  tags: ["contract-mount"],
  async test(t) {
    await t.send('call demo__ping {"name":"x"}');
    t.succeeded();
    t.calledTool("demo__ping", { count: 1, status: "completed" });
    t.check(t.reply, includes("pong x"));
  },
});
