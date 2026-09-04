import { defineEval } from "eve/evals";
import { contractEvalTags } from "./shared";

export default defineEval({
  description: "load_skill is enabled at the root and loads the square skill.",
  tags: contractEvalTags,
  async test(t) {
    await t.send("load square");
    t.succeeded();
    t.loadedSkill("square", { count: 1 });
  },
});
