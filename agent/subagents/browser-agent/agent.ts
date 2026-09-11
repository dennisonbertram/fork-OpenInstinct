import { defineAgent, defineDynamic } from "eve";
import { resolveModeValue } from "@/agent/lib/mode";
import { isContractFixtureEnabled } from "@/env";
import { contractFixtureModel } from "@/evals/contract/fixture-model";
import { taskCompletionSchema } from "@/lib/worker-completion";

export default defineDynamic({
  build: {
    externalDependencies: ["@onkernel/browser-loop"],
  },
  events: {
    "turn.started": (_event, context) => {
      const worker = defineAgent({
        description:
          "Execute one bounded browser assignment for the root coordinator, including secure vault autofill, transaction preparation, optional durable browser images, human-takeover handoff, cleanup, and a concise verified result. Every initial and resumed call must include the task-completion outputSchema required by the root instructions.",
        // Browser evidence requires native image input as well as tool calls.
        // The root swaps in the same fixture under the same eval-only flag; a
        // worker that still called a real model would make an end-to-end
        // completion journey need a paid model and a live browser to settle one
        // synthetic cohort. EVAL_CONTRACT_FIXTURE is never set in production.
        model: isContractFixtureEnabled()
          ? contractFixtureModel
          : "openai/gpt-5.6-luna-fast",
        reasoning: "low",
        // Each result refreshes refs; queued calls can otherwise outlive their refs.
        modelOptions: {
          providerOptions: { openai: { parallelToolCalls: false } },
        },
        outputSchema: taskCompletionSchema,
        compaction: {
          thresholdPercent: 0.7,
        },
      });
      return resolveModeValue(context, {
        interactive: worker,
        "scheduled-worker": worker,
      });
    },
  },
});
