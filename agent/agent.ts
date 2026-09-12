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
const frameworkAgentsNoteSchema = z.object({
  content: z.string().startsWith("[Agents]"),
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
        const scope = scopeFromPrincipal(caller);
        // Keep this session's record of what background work is owed in line
        // with the framework's own task index, before anything decides what to
        // say. Idempotent, so a replayed step cannot double count.
        await reconcileBackgroundTasks({
          rootSessionId: ctx.session.id,
          workspaceId: scope.workspaceId,
        });
        const turnId = stepEventSchema.safeParse(event).data?.data.turnId;
        // Role, not text, is the signal: only a genuinely new user message
        // should let the model choose a tool other than send_message while a
        // report is owed.
        // Whether this turn is carrying out a request rather than only owing a
        // report. Two corrections an outside review forced, both verified:
        //
        // A framework-injected "[Agents]" announcement rides the USER role --
        // eve's own bootstrap-model-utils says so and warns such notes "must not
        // drive" parsing. Counting one as a request let a report-only wake
        // escape the forced summary, so those are excluded.
        //
        // And mid-turn the newest entry is a tool result, not the user's
        // message, even though the request is still unfinished. Treating that as
        // "no request pending" put the old block back the moment a lookup needed
        // a second call. Work in progress counts as a request in flight.
        const newest = ctx.messages.at(-1);
        const isFrameworkAgentsNote =
          frameworkAgentsNoteSchema.safeParse(newest).success;
        const userRequestPending =
          (newest?.role === "user" && !isFrameworkAgentsNote) ||
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
            wrapLinqModelDurationProbe(gateway(await getGatewayModel(scope)), {
              auth: caller,
              sessionId: ctx.session.id,
              turnId,
            }),
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
