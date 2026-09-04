import { defineAgent, defineDynamic } from "eve";
import { scheduledRunIdentity } from "@/agent/lib/schedules/identity";
import { isScheduledAgentRunLeaseActive } from "@/db/services/scheduled-agent-run-leases";
import { getGatewayModel } from "@/db/services/settings";
import { scopeFromPrincipal } from "@/agent/lib/principal-scope";
import { contractFixtureModel } from "@/evals/contract/fixture-model";
import { isContractFixtureEnabled } from "@/env";
import { rootAgentReasoning } from "@/agent/agent-settings";

export default defineAgent({
  experimental: {
    tasks: true,
  },
  model: defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
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
        if (isContractFixtureEnabled()) {
          return {
            model: contractFixtureModel,
            modelContextWindowTokens: 128_000,
          };
        }
        return getGatewayModel(scopeFromPrincipal(caller));
      },
    },
  }),
  reasoning: rootAgentReasoning,
  compaction: {
    thresholdPercent: 0.7,
  },
});
