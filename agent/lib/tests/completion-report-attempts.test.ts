import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  accepted: vi.fn(),
  attempted: vi.fn(),
  claim: vi.fn(),
  unconfirmed: vi.fn(),
}));

vi.mock("@/db/services/completion-report-attempts", () => ({
  claimCompletionReportPart: service.claim,
  markAccepted: service.accepted,
  markProviderAttempted: service.attempted,
  markUnconfirmed: service.unconfirmed,
}));

import {
  permitReportDispatch,
  reportPartAccepted,
  reportPartUnconfirmed,
} from "@/agent/lib/completion-report-attempts";

const identity = {
  cohortId: "turn_1",
  part: "text" as const,
  reportRevision: 0,
  rootSessionId: "root-session",
  workspaceId: "workspace-1",
};

function request() {
  return {
    channel: "channel:sendblue",
    contentDigest: "digest-1",
    conversationId: "conversation-1",
    identity,
    leaseOwner: "owner-a",
  };
}

const heldClaim = {
  id: "attempt-1",
  leaseOwner: "owner-a",
  providerHandle: null,
  state: "claimed" as const,
  version: 3,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("permitReportDispatch", () => {
  it("CA-01: records the attempt before granting permission to dispatch", async () => {
    service.claim.mockResolvedValue({ claim: heldClaim, kind: "claimed" });
    service.attempted.mockResolvedValue({
      ...heldClaim,
      state: "attempted",
      version: 4,
    });

    const permission = await permitReportDispatch(request());

    expect(permission.kind).toBe("may_dispatch");
    // The ordering that matters: the durable record of intent exists before the
    // caller is told it may call a provider.
    expect(service.attempted).toHaveBeenCalledOnce();
    expect(service.attempted).toHaveBeenCalledWith(
      expect.objectContaining({
        id: heldClaim.id,
        leaseOwner: "owner-a",
        version: heldClaim.version,
      })
    );
  });

  it("CA-02: refuses to dispatch when the attempt CAS is lost", async () => {
    service.claim.mockResolvedValue({ claim: heldClaim, kind: "claimed" });
    // A concurrent owner moved the row, so this caller's CAS finds nothing.
    service.attempted.mockResolvedValue(undefined);

    const permission = await permitReportDispatch(request());

    // Holding a claim is not permission. Losing the CAS means someone else may
    // already be dispatching, so this caller must not.
    expect(permission.kind).toBe("do_not_dispatch");
  });

  it("CA-03: an already accepted part is reported, not dispatched again", async () => {
    service.claim.mockResolvedValue({
      claim: { ...heldClaim, providerHandle: "handle-1", state: "accepted" },
      kind: "settled",
    });

    const permission = await permitReportDispatch(request());

    expect(permission.kind).toBe("already_accepted");
    expect(service.attempted).not.toHaveBeenCalled();
  });

  it("CA-04: an uncertain part is never attempted again", async () => {
    service.claim.mockResolvedValue({
      claim: { ...heldClaim, state: "attempted" },
      kind: "uncertain",
    });

    const permission = await permitReportDispatch(request());

    expect(permission.kind).toBe("do_not_dispatch");
    expect(service.attempted).not.toHaveBeenCalled();
  });

  it("CA-05: the logical key comes from the obligation, never from a call id", async () => {
    service.claim.mockResolvedValue({ claim: heldClaim, kind: "claimed" });
    service.attempted.mockResolvedValue({ ...heldClaim, state: "attempted" });

    await permitReportDispatch(request());

    const passed = service.claim.mock.calls[0]?.[0] as {
      key: Record<string, unknown>;
      id: string;
    };
    expect(passed.key).toEqual({
      cohortId: "turn_1",
      part: "text",
      reportRevision: 0,
      rootSessionId: "root-session",
      workspaceId: "workspace-1",
    });
    // The row id may be anything unique; identity is the key above.
    expect(passed.id).toEqual(expect.any(String));
  });
});

describe("settling a dispatched part", () => {
  it("CA-06: acceptance is recorded against the lease and version that dispatched", async () => {
    const dispatched = {
      ...heldClaim,
      state: "attempted" as const,
      version: 4,
    };
    service.accepted.mockResolvedValue({ ...dispatched, state: "accepted" });

    expect(
      await reportPartAccepted({
        claim: dispatched,
        providerHandle: "handle-9",
      })
    ).toBe(true);
    expect(service.accepted).toHaveBeenCalledWith(
      expect.objectContaining({
        id: dispatched.id,
        leaseOwner: "owner-a",
        providerHandle: "handle-9",
        version: 4,
      })
    );
  });

  it("CA-07: an unconfirmed dispatch is recorded and nothing resends it", async () => {
    const dispatched = {
      ...heldClaim,
      state: "attempted" as const,
      version: 4,
    };
    service.unconfirmed.mockResolvedValue({
      ...dispatched,
      state: "unconfirmed",
    });

    expect(await reportPartUnconfirmed(dispatched)).toBe(true);
    expect(service.unconfirmed).toHaveBeenCalledOnce();
    // No retry path exists here at all.
    expect(service.attempted).not.toHaveBeenCalled();
    expect(service.claim).not.toHaveBeenCalled();
  });
});
