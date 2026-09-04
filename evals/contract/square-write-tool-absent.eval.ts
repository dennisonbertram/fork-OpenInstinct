import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { requireDeliveredText } from "@/evals/agent/shared";
import { contractEvalTags } from "./shared";

export default defineEval({
  description: "No Square write tool is exposed to the root model.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("inspect square__CreateCustomer");
    t.succeeded();
    turn.notCalledTool("square__CreateCustomer");
    t.check(
      await requireDeliveredText(t, turn),
      equals("absent:square__CreateCustomer")
    );
  },
});
