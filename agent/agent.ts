import { gateway } from "ai";
import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import {
  deliveryToolChoiceForInteractiveTurn,
  wrapInteractiveDeliveryGuard,
} from "@/agent/lib/delivery-guard";
import { reconcileBackgroundTasks } from "@/agent/lib/completion-obligations";
import { reportPolicyForTurn } from "@/agent/lib/completion-report-policy";
import { finalDeliveryStatus } from "@/agent/lib/message-delivery";
import { wrapLinqModelDurationProbe } from "@/agent/lib/linq/timing";
import { scheduledRunIdentity } from "@/agent/lib/schedules/identity";
import { isScheduledAgentRunLeaseActive } from "@/db/services/scheduled-agent-run-leases";
import { getGatewayModel } from "@/db/services/settings";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import { contractFixtureModel } from "@/evals/contract/fixture-model";
import { isContractFixtureEnabled } from "@/env";

/**
 * A framework-injected "[Agents]" announcement.
 *
 * eve appends these under the USER role when the set of parked children changes,
 * and its own `bootstrap-model-utils` warns they "are not authored input and must
 * not drive" parsing. Parsed here rather than sniffed so the shape is checked at
 * the boundary and the rest of the code branches on the answer.
 */
/**
 * The labels eve puts on its own runtime-authored notes.
 *
 * Both ride the USER role. "[Agents]" announces parked children;
 * `bootstrap-model-utils` says such notes "are not authored input and must not
 * drive" parsing. "[Task state]" accompanies a turn eve triggered from background
 * task activity -- `tasks/delivery-context.js` exports it as
 * `TASK_DELIVERY_CONTEXT_LABEL` and its own text says the turn "was triggered by
 * background task activity".
 *
 * Matching the label text is second best and the comment should say so: neither
 * constant is exported from `eve/...` public paths, so there is no accessor to
 * ask instead. A new framework label would silently read as a user request until
 * it is added here.
 */
const frameworkNoteLabels = ["[Agents]", "[Task state]"] as const;

const frameworkNoteSchema = z.object({
  content: z
    .string()
    .refine((text) =>
      frameworkNoteLabels.some((label) => text.startsWith(label))
    ),
  role: z.literal("user"),
});

export default defineAgent({
  experimental: {
    instrumentationProviders: true,
    tasks: true,
  },
  model: defineDynamic({
    events: {
      "step.started": async (event, ctx) => {
        const scheduledRun = scheduledRunIdentity(ctx.session.auth);
        if (
          scheduledRun &&
          !(await isScheduledAgentRunLeaseActive(
            scheduledRun.runId,
            scheduledRun.leaseToken
          ))
        ) {
          throw new Error("The scheduled run lease is no longer active.");
        }
        const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
        if (!caller) throw new Error("An authenticated user is required.");
        // Keep this session's record of what background work is owed in line
        // with the framework's own task index, before anything decides what to
        // say. Idempotent, so a replayed step cannot double count.
        reconcileBackgroundTasks();
        const turnId = stepEventSchema.safeParse(event).data?.data.turnId;
        // Whether this turn is carrying out a request rather than only owing a
        // report. Two corrections an outside review forced, both verified:
        //
        // eve's own runtime-authored notes ride the USER role. Counting one as
        // a request lets a report-only wake escape the summary it owes -- and the
        // wake is exactly the turn that exists to deliver it. See
        // `frameworkNoteLabels`.
        //
        // And mid-turn the newest entry is a tool result, not the user's
        // message, even though the request is still unfinished. Treating that as
        // "no request pending" put the old block back the moment a lookup needed
        // a second call. Work in progress counts as a request in flight.
        const newest = ctx.messages.at(-1);
        const isFrameworkNote = frameworkNoteSchema.safeParse(newest).success;
        const userRequestPending =
          (newest?.role === "user" && !isFrameworkNote) ||
          newest?.role === "tool";
        const toolChoice = deliveryToolChoiceForInteractiveTurn({
          channelKind: ctx.channel.kind,
          deliveryStatus: finalDeliveryStatus(turnId),
          reportOwed: reportPolicyForTurn().kind === "must_report",
          userRequestPending,
          mode:
            caller.authenticator === "scheduled-result"
              ? "scheduled-report"
              : undefined,
        });
        if (isContractFixtureEnabled()) {
          return {
            model: wrapInteractiveDeliveryGuard(
              wrapLinqModelDurationProbe(contractFixtureModel, {
                auth: caller,
                sessionId: ctx.session.id,
                turnId,
              }),
              toolChoice
            ),
            modelContextWindowTokens: 128_000,
          };
        }
        return {
          model: wrapInteractiveDeliveryGuard(
            wrapLinqModelDurationProbe(
              gateway(await getGatewayModel(scopeFromPrincipal(caller))),
              { auth: caller, sessionId: ctx.session.id, turnId }
            ),
            toolChoice
          ),
        };
      },
    },
  }),
  reasoning: "low",
  compaction: {
    thresholdPercent: 0.7,
  },
});

const stepEventSchema = z.object({ data: z.object({ turnId: z.string() }) });
