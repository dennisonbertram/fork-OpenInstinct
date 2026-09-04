import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { requireDeliveredText } from "@/evals/agent/shared";
import { contractEvalTags } from "./shared";

export default defineEval({
  description:
    "A Square read tool reaches the fake server as the authenticated workspace caller and returns rows.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("call square__ListCustomers {}");
    t.succeeded();
    turn.calledTool("square__ListCustomers", {
      count: 1,
      status: "completed",
    });
    t.check(await requireDeliveredText(t, turn), includes("Ada"));
  },
});
