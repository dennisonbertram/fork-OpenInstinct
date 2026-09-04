import { defineEval } from "eve/evals";
import {
  assertPlainTextDelivery,
  requireDeliveredText,
} from "@/evals/agent/shared";
import { contractEvalTags } from "./shared";

export default defineEval({
  description: "Delivered Square result text has no Markdown formatting.",
  tags: contractEvalTags,
  async test(t) {
    const turn = await t.send("call square__ListCustomers {}");
    t.succeeded();
    assertPlainTextDelivery(t, await requireDeliveredText(t, turn));
  },
});
