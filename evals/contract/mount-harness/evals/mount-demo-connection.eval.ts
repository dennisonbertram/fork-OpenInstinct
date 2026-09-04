import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "A mounted MCP connection tool is discoverable and callable.",
  tags: ["contract-mount"],
  async test(t) {
    await t.send('call demo__echo__echo {"text":"x"}');
    t.succeeded();
    t.calledTool("connection_search", { count: 1, status: "completed" });
    t.calledTool("demo__echo__echo", { count: 1, status: "completed" });
    t.check(t.reply, includes('"text":"x"'));
  },
});
