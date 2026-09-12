import { defineDynamic } from "eve/instructions";
import { z } from "zod";
import { completionEvidenceContext } from "@/agent/lib/completion-evidence-context";
import { reconcileBackgroundTasks } from "@/agent/lib/completion-obligations";
import { resolveModeInstructions } from "@/agent/lib/mode";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";

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
 * This resolver runs before the model step, so it reconciles records with the
 * authenticated workspace and root-session identity before it reads them.
 */

const turnStartedEventSchema = z.object({
  data: z.object({ turnId: z.string() }),
});

export default defineDynamic({
  events: {
    "turn.started": async (event, context) => {
      const caller =
        context.session.auth.current ?? context.session.auth.initiator;
      if (caller) {
        await reconcileBackgroundTasks({
          rootSessionId: context.session.id,
          workspaceId: scopeFromPrincipal(caller).workspaceId,
        });
      }
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
