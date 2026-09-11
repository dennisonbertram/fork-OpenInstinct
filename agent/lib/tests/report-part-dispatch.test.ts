import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  permitReportDispatch,
  reportPartAccepted,
  reportPartUnconfirmed,
  ReportPartIdentity,
} from "@/agent/lib/completion-report-attempts";

const claim = vi.hoisted(() => ({
  id: "attempt-1",
  leaseOwner: "owner-a",
  providerHandle: null,
  state: "attempted" as const,
  version: 4,
}));

// Typed against the owning seam, so a signature change there fails here.
const seam = vi.hoisted(() => ({
  accepted: vi.fn<typeof reportPartAccepted>(),
  permit: vi.fn<typeof permitReportDispatch>(),
  unconfirmed: vi.fn<typeof reportPartUnconfirmed>(),
}));

vi.mock("@/agent/lib/completion-report-attempts", () => ({
  permitReportDispatch: seam.permit,
  reportPartAccepted: seam.accepted,
  reportPartUnconfirmed: seam.unconfirmed,
}));

const { dispatchReportPart } = await import("@/agent/lib/report-part-dispatch");

const identity: ReportPartIdentity = {
  cohortId: "turn_1",
  part: "text",
  reportRevision: 0,
  rootSessionId: "root-session",
  workspaceId: "workspace-1",
};

function request<T>(
  dispatch: () => Promise<T>,
  overrides: { identity?: ReportPartIdentity } = {}
) {
  return {
    channel: "channel:sendblue",
    contentDigest: "digest-1",
    conversationId: "conversation-1",
    dispatch,
    leaseOwner: "owner-a",
    ...("identity" in overrides ? overrides : { identity }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  seam.permit.mockResolvedValue({ claim, kind: "may_dispatch" });
  seam.accepted.mockResolvedValue(true);
  seam.unconfirmed.mockResolvedValue(true);
});

describe("dispatchReportPart", () => {
  it("DP-01: an ordinary message is sent without claiming anything", async () => {
    // Most messages are not completion summaries. Those must behave exactly as
    // they did before this seam existed, including claiming nothing at all.
    const send = vi.fn<() => Promise<string>>().mockResolvedValue("handle-1");

    const outcome = await dispatchReportPart(
      request(send, { identity: undefined })
    );

    expect(outcome).toEqual({ kind: "sent", value: "handle-1" });
    expect(send).toHaveBeenCalledOnce();
    expect(seam.permit).not.toHaveBeenCalled();
    expect(seam.accepted).not.toHaveBeenCalled();
  });

  it("DP-02: a report part is claimed, sent, then recorded as accepted", async () => {
    const send = vi.fn<() => Promise<string>>().mockResolvedValue("handle-1");

    const outcome = await dispatchReportPart({
      ...request(send),
      providerHandle: (value: string) => value,
    });

    expect(outcome).toEqual({ kind: "sent", value: "handle-1" });
    expect(seam.accepted).toHaveBeenCalledWith({
      claim,
      providerHandle: "handle-1",
    });
  });

  it("DP-03: permission is obtained before the provider is called", async () => {
    const order: string[] = [];
    seam.permit.mockImplementation(() => {
      order.push("permit");
      return Promise.resolve({ claim, kind: "may_dispatch" });
    });
    const send = vi.fn<() => Promise<string>>(() => {
      order.push("send");
      return Promise.resolve("handle-1");
    });
    seam.accepted.mockImplementation(() => {
      order.push("accepted");
      return Promise.resolve(true);
    });

    await dispatchReportPart(request(send));

    // The ordering is the whole point. A send recorded only afterwards is a
    // send that a crash can hide.
    expect(order).toEqual(["permit", "send", "accepted"]);
  });

  it("DP-04: a part already accepted is never sent again", async () => {
    seam.permit.mockResolvedValue({
      claim: { ...claim, providerHandle: "handle-1", state: "accepted" },
      kind: "already_accepted",
    });
    const send = vi.fn<() => Promise<string>>();

    const outcome = await dispatchReportPart(request(send));

    expect(outcome).toEqual({
      kind: "not_dispatched",
      reason: "already_accepted",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("DP-05: a refused part is never sent and never retried", async () => {
    seam.permit.mockResolvedValue({ claim, kind: "do_not_dispatch" });
    const send = vi.fn<() => Promise<string>>();

    const outcome = await dispatchReportPart(request(send));

    expect(outcome).toEqual({ kind: "not_dispatched", reason: "uncertain" });
    expect(send).not.toHaveBeenCalled();
    expect(seam.accepted).not.toHaveBeenCalled();
    expect(seam.unconfirmed).not.toHaveBeenCalled();
  });

  it("DP-06: a send that throws is recorded as unconfirmed, and the error is not swallowed", async () => {
    const failure = new Error("the provider timed out");
    const send = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(dispatchReportPart(request(send))).rejects.toThrow(failure);

    // The request reached the provider, so the outcome is unknown rather than
    // failed. Recording it is what stops anything sending it again.
    expect(seam.unconfirmed).toHaveBeenCalledWith(claim);
    expect(seam.accepted).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  it("DP-07: acceptance is recorded with no handle when the provider returns none", async () => {
    const send = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await dispatchReportPart(request(send));

    expect(seam.accepted).toHaveBeenCalledWith({
      claim,
      providerHandle: undefined,
    });
  });

  it("DP-08: the identity it was given is the identity it claims", async () => {
    const send = vi.fn<() => Promise<string>>().mockResolvedValue("handle-1");

    await dispatchReportPart({
      ...request(send),
      identity: { ...identity, part: "media-send", reportRevision: 2 },
    });

    expect(seam.permit).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "channel:sendblue",
        contentDigest: "digest-1",
        conversationId: "conversation-1",
        identity: { ...identity, part: "media-send", reportRevision: 2 },
        leaseOwner: "owner-a",
      })
    );
  });
});
