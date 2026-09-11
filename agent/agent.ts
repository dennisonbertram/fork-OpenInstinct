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
        const toolChoice = deliveryToolChoiceForInteractiveTurn({
          channelKind: ctx.channel.kind,
          deliveryStatus: finalDeliveryStatus(turnId),
          reportOwed: reportPolicyForTurn().kind === "must_report",
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
