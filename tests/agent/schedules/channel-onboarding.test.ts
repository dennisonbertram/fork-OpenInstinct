import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResult =
  | { attempted: number; claimed: number }
  | { claimed: number }
  | number
  | undefined;
type MockFunction = (...args: unknown[]) => MockResult | Promise<MockResult>;

const delivery = vi.hoisted(() => ({
  drain: vi.fn<MockFunction>(),
  reconcile: vi.fn<MockFunction>(),
}));
const provider = vi.hoisted(() => ({ status: vi.fn<MockFunction>() }));
const persistence = vi.hoisted(() => ({
  claimStatuses: vi.fn<MockFunction>(),
  delivered: vi.fn<MockFunction>(),
  observe: vi.fn<MockFunction>(),
  rejected: vi.fn<MockFunction>(),
  recover: vi.fn<MockFunction>(),
}));

vi.mock("@/agent/lib/onboarding/delivery", () => ({
  drainSendblueChannelOnboarding: delivery.drain,
  reconcileChannelOnboardingProviderDelivery: delivery.reconcile,
}));
vi.mock("@/agent/channels/sendblue", () => ({
  default: { channel: "sendblue" },
}));
vi.mock("@/agent/lib/onboarding/sendblue-provider", () => ({
  getOnboardingSendblueStatus: provider.status,
}));
vi.mock("@/db/services/channel-onboarding-delivery", () => ({
  claimChannelOnboardingProviderStatuses: persistence.claimStatuses,
  markChannelOnboardingProviderDelivered: persistence.delivered,
  markChannelOnboardingProviderRejected: persistence.rejected,
  observeChannelOnboardingProviderStatus: persistence.observe,
  recoverExpiredAttemptedChannelOnboardingOperations: persistence.recover,
}));

import schedule, {
  runChannelOnboardingRecovery,
} from "@/agent/schedules/channel-onboarding";

describe("channel onboarding schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.recover.mockResolvedValue(0);
    delivery.drain.mockResolvedValue({ attempted: 0, claimed: 0 });
    delivery.reconcile.mockResolvedValue({ claimed: 0 });
  });

  it("recovers ambiguous attempts and reconciles known handles on each native tick", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");

    await runChannelOnboardingRecovery(
      vi.fn<Parameters<typeof runChannelOnboardingRecovery>[0]>(),
      now,
      "schedule-test"
    );

    expect(persistence.recover).toHaveBeenCalledWith(now);
    expect(delivery.drain).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, now, owner: "schedule-test" })
    );
    expect(delivery.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, now, owner: "schedule-test" })
    );
  });

  it("uses waitUntil so the native Eve schedule awaits recovery", async () => {
    const tasks: Promise<unknown>[] = [];

    schedule.run({
      appAuth: {
        attributes: {},
        authenticator: "test",
        principalId: "schedule-test",
        principalType: "app",
      },
      to: vi.fn<Parameters<typeof runChannelOnboardingRecovery>[0]>(),
      waitUntil(task) {
        tasks.push(task);
      },
    });
    await Promise.all(tasks);

    expect(tasks).toHaveLength(1);
    expect(persistence.recover).toHaveBeenCalledOnce();
  });
});
