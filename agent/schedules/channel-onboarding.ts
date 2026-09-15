import { randomUUID } from "node:crypto";
import { defineSchedule, type ScheduleToFn } from "eve/schedules";
import sendblueChannel from "@/agent/channels/sendblue";
import {
  drainSendblueChannelOnboarding,
  reconcileChannelOnboardingProviderDelivery,
} from "@/agent/lib/onboarding/delivery";
import { getOnboardingSendblueStatus } from "@/agent/lib/onboarding/sendblue-provider";
import {
  claimChannelOnboardingProviderStatuses,
  markChannelOnboardingProviderDelivered,
  markChannelOnboardingProviderRejected,
  observeChannelOnboardingProviderStatus,
  recoverExpiredAttemptedChannelOnboardingOperations,
} from "@/db/services/channel-onboarding-delivery";

const recoveryLimit = 20;

export default defineSchedule({
  cron: "* * * * *",
  run({ to, waitUntil }) {
    waitUntil(runChannelOnboardingRecovery(to));
  },
});

/**
 * Runs independently of the new-enrollment rollout flag. The flag may stop
 * creating new enrollment records, but must not strand work already committed.
 */
export async function runChannelOnboardingRecovery(
  to: ScheduleToFn,
  now = new Date(),
  owner = `channel-onboarding-schedule:${randomUUID()}`
) {
  await recoverExpiredAttemptedChannelOnboardingOperations(now);
  await drainSendblueChannelOnboarding({
    async dispatchOpeningRequest(input) {
      const session = await to(sendblueChannel, {
        adapterName: "sendblue",
        threadId: input.threadId,
      }).send(input.content, { auth: input.auth, turnPolicy: "queue" });
      return { kind: "accepted", sessionId: session.id };
    },
    limit: recoveryLimit,
    now,
    owner,
  });
  await reconcileChannelOnboardingProviderDelivery({
    dependencies: {
      claimProviderStatus(input) {
        return claimChannelOnboardingProviderStatuses({
          ...input,
          provider: "sendblue",
        });
      },
      async getProviderStatus(providerHandle) {
        return (await getOnboardingSendblueStatus(providerHandle)).kind;
      },
      async markProviderDelivered(fence) {
        await markChannelOnboardingProviderDelivered(fence);
      },
      async markProviderRejected(fence) {
        await markChannelOnboardingProviderRejected(fence);
      },
      async observeProviderStatus(input) {
        await observeChannelOnboardingProviderStatus(input);
      },
    },
    limit: recoveryLimit,
    now,
    owner,
  });
}
