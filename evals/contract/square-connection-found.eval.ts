import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { requireDeliveredText } from "@/evals/agent/shared";
import { contractEvalTags } from "./shared";

export default defineEval({
  description:
    "connection_search is enabled at the root and returns the Square connection.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send(
      'call connection_search {"keywords":"ListCustomers"}'
    );
    t.succeeded();
    turn.calledTool("connection_search", { count: 1 });
    t.check(await requireDeliveredText(t, turn), includes(/square/iu));
  },
});
