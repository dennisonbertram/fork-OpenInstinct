import { defineEval } from "eve/evals";
import { contractEvalTags } from "./shared";

export default defineEval({
  description:
    "The contract suite runs with workspace scope enforcement and admits its seeded caller.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("call square__ListLocations {}");
    t.succeeded();
    turn.calledTool("square__ListLocations", {
      count: 1,
      status: "completed",
    });
  },
});
