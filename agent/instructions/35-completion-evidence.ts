import { defineDynamic } from "eve/instructions";
import { z } from "zod";
import { completionEvidenceContext } from "@/agent/lib/completion-evidence-context";
import { reconcileBackgroundTasks } from "@/agent/lib/completion-obligations";
import { resolveModeInstructions } from "@/agent/lib/mode";

/**
 * Gives the model a durable, per-claim account of settled background work on
 * every turn, not only the turn that delivers the report.
 *
 * `situation-view.ts` already projects this provenance, but nothing fed it to
 * the model, so a later turn had only its own earlier prose to paraphrase --
 * and provenance got rounded off in the retelling. This module is the missing
 * consumer: it renders `completion-evidence-context.ts`'s block as an
 * instruction, so it reaches the model as data the model reads, not a claim it
 * has to remember it once wrote correctly.
 *
 * Eve instructions resolve only on `session.started` or `turn.started` --
 * there is no `step.started` hook for instructions -- so this reconciles the
 * completion records itself rather than relying on the model resolver's
 * `step.started` call in `agent/agent.ts`, which runs later in the turn.
 * `reconcileBackgroundTasks()`'s own docstring says admission and terminal
 * promotion are both idempotent and "repeating this is free," so calling it
 * again here, ahead of that later call, cannot double-count anything -- it
 * just means this instruction is not built from records one step stale.
 */

const turnStartedEventSchema = z.object({
  data: z.object({ turnId: z.string() }),
});

export default defineDynamic({
  events: {
    "turn.started": (event, context) => {
      reconcileBackgroundTasks();

      const turnId = turnStartedEventSchema.safeParse(event).data?.data.turnId;
      if (turnId === undefined) return null;

      const content = completionEvidenceContext(turnId);
      if (content === undefined) return null;

      return resolveModeInstructions(context, {
        interactive: content,
        "scheduled-report": content,
      });
    },
  },
});
