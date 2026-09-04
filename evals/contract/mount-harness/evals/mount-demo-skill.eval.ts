import { defineEval } from "eve/evals";

export default defineEval({
  description: "A skill packaged by an extension loads as mount__skill.",
  tags: ["contract-mount"],
  async test(t) {
    await t.send("load demo__reference");
    t.succeeded();
    t.loadedSkill("demo__reference", { count: 1 });
  },
});
