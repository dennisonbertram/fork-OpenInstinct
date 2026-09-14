import { describe, expect, it, vi } from "vitest";

import {
  drainChannelOnboardingDelivery,
  reconcileChannelOnboardingProviderDelivery,
  type ChannelOnboardingDeliveryDependencies,
  type ChannelOnboardingReconciliationDependencies,
  type ClaimedChannelOnboardingOperation,
} from "@/agent/lib/onboarding/delivery";

const now = new Date("2026-09-14T12:00:00.000Z");

describe("channel onboarding delivery", () => {
  it("records an attempt before an accepted welcome and persists the provider handle", async () => {
    const operation = welcome();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.sendWelcome).mockResolvedValue({
      kind: "accepted",
      providerHandle: "sendblue-welcome-1",
    });

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(vi.mocked(dependencies.markAttempted)).toHaveBeenCalledBefore(
      vi.mocked(dependencies.sendWelcome)
    );
    expect(dependencies.acceptProvider).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      providerHandle: "sendblue-welcome-1",
      version: operation.version,
    });
    expect(dependencies.releaseProvenUnsent).not.toHaveBeenCalled();
  });

  it("releases a welcome only when SendBlue definitively rejected it", async () => {
    const operation = welcome();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.sendWelcome).mockResolvedValue({
      kind: "rejected",
      retryAt: new Date("2026-09-14T12:05:00.000Z"),
    });

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(dependencies.releaseProvenUnsent).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      retryAt: new Date("2026-09-14T12:05:00.000Z"),
      version: operation.version,
    });
    expect(dependencies.markUncertain).not.toHaveBeenCalled();
  });

  it("marks a missing provider response uncertain and never treats it as accepted", async () => {
    const operation = welcome();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.sendWelcome).mockResolvedValue({
      kind: "uncertain",
    });

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(dependencies.markUncertain).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      version: operation.version,
    });
    expect(dependencies.acceptProvider).not.toHaveBeenCalled();
    expect(dependencies.releaseProvenUnsent).not.toHaveBeenCalled();
  });

  it("makes a quota denial terminal before an external attempt", async () => {
    const operation = welcome();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.reserve).mockResolvedValue({
      kind: "limit_reached",
    });

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(dependencies.failProvenUnsent).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      version: operation.version,
    });
    expect(dependencies.markAttempted).not.toHaveBeenCalled();
    expect(dependencies.sendWelcome).not.toHaveBeenCalled();
  });

  it("uses the same fenced provider path for the first durable assistant reply", async () => {
    const operation = outboundReply();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.sendOutboundReply).mockResolvedValue({
      kind: "accepted",
      providerHandle: "sendblue-reply-1",
    });

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(vi.mocked(dependencies.markAttempted)).toHaveBeenCalledBefore(
      vi.mocked(dependencies.sendOutboundReply)
    );
    expect(dependencies.acceptProvider).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      providerHandle: "sendblue-reply-1",
      version: operation.version,
    });
  });

  it("records the returned Eve session id for an opening request", async () => {
    const operation = openingRequest();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.dispatchOpeningRequest).mockResolvedValue({
      kind: "accepted",
      sessionId: "eve-session-1",
    });

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(vi.mocked(dependencies.markAttempted)).toHaveBeenCalledBefore(
      vi.mocked(dependencies.dispatchOpeningRequest)
    );
    expect(dependencies.acceptHandoff).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      sessionId: "eve-session-1",
      version: operation.version,
    });
  });

  it("marks an interrupted opening handoff uncertain instead of dispatching it again", async () => {
    const operation = openingRequest();
    const dependencies = dependenciesFor([operation]);
    vi.mocked(dependencies.dispatchOpeningRequest).mockRejectedValue(
      new Error("process lost response after Eve dispatch")
    );

    await drainChannelOnboardingDelivery({
      dependencies,
      now,
      owner: "worker-1",
    });

    expect(dependencies.markUncertain).toHaveBeenCalledWith({
      id: operation.id,
      leaseToken: operation.leaseToken,
      version: operation.version,
    });
    expect(dependencies.releaseProvenUnsent).not.toHaveBeenCalled();
  });

  it("immediately reclaims work unblocked by the welcome instead of waiting for cron", async () => {
    const welcomeOperation = welcome();
    const openingOperation = openingRequest();
    const dependencies = dependenciesFor([]);
    vi.mocked(dependencies.claim)
      .mockReset()
      .mockResolvedValueOnce([welcomeOperation])
      .mockResolvedValueOnce([openingOperation])
      .mockResolvedValueOnce([]);
    vi.mocked(dependencies.sendWelcome).mockResolvedValue({
      kind: "accepted",
      providerHandle: "sendblue-welcome-1",
    });
    vi.mocked(dependencies.dispatchOpeningRequest).mockResolvedValue({
      kind: "accepted",
      sessionId: "eve-session-1",
    });

    await expect(
      drainChannelOnboardingDelivery({
        dependencies,
        limit: 2,
        now,
        owner: "worker-1",
      })
    ).resolves.toEqual({ attempted: 2, claimed: 2 });

    expect(dependencies.claim).toHaveBeenNthCalledWith(1, {
      limit: 2,
      now,
      owner: "worker-1",
    });
    expect(dependencies.claim).toHaveBeenNthCalledWith(2, {
      limit: 1,
      now,
      owner: "worker-1",
    });
    expect(dependencies.dispatchOpeningRequest).toHaveBeenCalledOnce();
  });

  it("marks only a known SendBlue handle delivered after reconciliation", async () => {
    const dependencies = reconciliationDependenciesFor();
    vi.mocked(dependencies.getProviderStatus).mockResolvedValue("delivered");

    await reconcileChannelOnboardingProviderDelivery({
      dependencies,
      now,
      owner: "reconciler-1",
    });

    expect(dependencies.markProviderDelivered).toHaveBeenCalledWith({
      id: "operation-welcome",
      leaseToken: "lease-welcome",
      version: 2,
    });
    expect(dependencies.observeProviderStatus).not.toHaveBeenCalled();
  });

  it("keeps a known provider acceptance non-delivered when status lookup is uncertain", async () => {
    const dependencies = reconciliationDependenciesFor();
    vi.mocked(dependencies.getProviderStatus).mockResolvedValue("uncertain");

    await reconcileChannelOnboardingProviderDelivery({
      dependencies,
      now,
      owner: "reconciler-1",
    });

    expect(dependencies.observeProviderStatus).toHaveBeenCalledWith({
      id: "operation-welcome",
      leaseToken: "lease-welcome",
      providerStatus: "uncertain",
      version: 2,
    });
    expect(dependencies.markProviderDelivered).not.toHaveBeenCalled();
    expect(dependencies.markProviderRejected).not.toHaveBeenCalled();
  });
});

function dependenciesFor(
  operations: readonly ClaimedChannelOnboardingOperation[]
): ChannelOnboardingDeliveryDependencies {
  return {
    acceptHandoff:
      vi.fn<ChannelOnboardingDeliveryDependencies["acceptHandoff"]>(),
    acceptProvider:
      vi.fn<ChannelOnboardingDeliveryDependencies["acceptProvider"]>(),
    claim: vi
      .fn<ChannelOnboardingDeliveryDependencies["claim"]>()
      .mockResolvedValueOnce(operations)
      .mockResolvedValue([]),
    dispatchOpeningRequest:
      vi.fn<ChannelOnboardingDeliveryDependencies["dispatchOpeningRequest"]>(),
    failProvenUnsent:
      vi.fn<ChannelOnboardingDeliveryDependencies["failProvenUnsent"]>(),
    markAttempted: vi
      .fn<ChannelOnboardingDeliveryDependencies["markAttempted"]>()
      .mockResolvedValue(true),
    markUncertain:
      vi.fn<ChannelOnboardingDeliveryDependencies["markUncertain"]>(),
    releaseProvenUnsent:
      vi.fn<ChannelOnboardingDeliveryDependencies["releaseProvenUnsent"]>(),
    reserve: vi
      .fn<ChannelOnboardingDeliveryDependencies["reserve"]>()
      .mockResolvedValue({ kind: "proceed" }),
    sendOutboundReply:
      vi.fn<ChannelOnboardingDeliveryDependencies["sendOutboundReply"]>(),
    sendWelcome: vi.fn<ChannelOnboardingDeliveryDependencies["sendWelcome"]>(),
  };
}

function reconciliationDependenciesFor(): ChannelOnboardingReconciliationDependencies {
  return {
    claimProviderStatus: vi
      .fn<ChannelOnboardingReconciliationDependencies["claimProviderStatus"]>()
      .mockResolvedValue([
        {
          id: "operation-welcome",
          leaseToken: "lease-welcome",
          providerHandle: "sendblue-welcome-1",
          version: 2,
        },
      ]),
    getProviderStatus:
      vi.fn<ChannelOnboardingReconciliationDependencies["getProviderStatus"]>(),
    markProviderDelivered:
      vi.fn<
        ChannelOnboardingReconciliationDependencies["markProviderDelivered"]
      >(),
    markProviderRejected:
      vi.fn<
        ChannelOnboardingReconciliationDependencies["markProviderRejected"]
      >(),
    observeProviderStatus:
      vi.fn<
        ChannelOnboardingReconciliationDependencies["observeProviderStatus"]
      >(),
  };
}

function outboundReply(): ClaimedChannelOnboardingOperation {
  return {
    id: "operation-first-answer",
    kind: "outbound_reply",
    leaseToken: "lease-first-answer",
    providerAccountId: "sendblue-account-1",
    providerLineId: "+12025550124",
    sender: "+12025550124",
    recipient: "+12025550123",
    text: "Here is the answer to your first request.",
    version: 1,
  };
}

function welcome(): ClaimedChannelOnboardingOperation {
  return {
    id: "operation-welcome",
    kind: "welcome",
    leaseToken: "lease-welcome",
    providerAccountId: "sendblue-account-1",
    providerLineId: "+12025550124",
    sender: "+12025550124",
    recipient: "+12025550123",
    text: "You're in!",
    version: 1,
  };
}

function openingRequest(): ClaimedChannelOnboardingOperation {
  return {
    id: "operation-opening",
    kind: "opening_request",
    leaseToken: "lease-opening",
    bindingId: "binding-1",
    authAssurance: "channel_observed",
    capabilityProfile: "channel-basic",
    identityProvenance: "sendblue_direct",
    payload: [
      { type: "text", text: "What is in this photo?" },
      {
        mediaType: "image/jpeg",
        type: "file",
        data: new URL("data:image/jpeg;base64,AQID"),
      },
    ],
    principalId: "better-auth:user-1",
    providerAccountId: "sendblue-account-1",
    providerLineId: "+12025550124",
    threadId: "sendblue:conversation-1",
    version: 1,
    workspaceId: "personal:workspace-1",
  };
}
