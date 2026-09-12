import { describe, expect, it } from "vitest";
import { deliveryToolChoiceForInteractiveTurn } from "../delivery-guard";

describe("interactive delivery guard", () => {
  it("requires a tool before the current interactive turn has a delivery attempt", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: "interactive",
      })
    ).toEqual({ type: "required" });

    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: "completed",
        mode: "interactive",
      })
    ).toBeUndefined();
  });

  it("does not require another tool after a pending or unconfirmed attempt", () => {
    for (const deliveryStatus of ["pending", "unconfirmed"] as const) {
      expect(
        deliveryToolChoiceForInteractiveTurn({
          channelKind: "channel:linq",
          deliveryStatus,
          mode: "interactive",
        })
      ).toBeUndefined();
    }
  });

  it("applies to Eve conversations and preserves scheduled reports and other channels", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:eve",
        deliveryStatus: undefined,
        mode: "interactive",
      })
    ).toEqual({ type: "required" });
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:sendblue",
        deliveryStatus: undefined,
        mode: "interactive",
      })
    ).toEqual({ type: "required" });
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: "scheduled-report",
      })
    ).toBeUndefined();
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:scheduled-run",
        deliveryStatus: undefined,
        mode: "interactive",
      })
    ).toBeUndefined();
  });

  it("DG-01: an owed report does not force send_message when a new user request is pending", () => {
    // This is the production defect: an old debt must not force
    // send_message as the first and only action of a new user request. The
    // model must still call a tool ({ type: "required" }), but it may pick
    // the one that does the requested work.
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: "interactive",
        reportOwed: true,
        userRequestPending: true,
      })
    ).toEqual({ type: "required" });
  });

  it("DG-02: an owed report still forces send_message on a wake with no pending user request", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: "interactive",
        reportOwed: true,
        userRequestPending: false,
      })
    ).toEqual({ type: "tool", toolName: "send_message" });
  });

  it("DG-03: reportOwed false with a user request pending still just requires a tool", () => {
    expect(
      deliveryToolChoiceForInteractiveTurn({
        channelKind: "channel:linq",
        deliveryStatus: undefined,
        mode: "interactive",
        reportOwed: false,
        userRequestPending: true,
      })
    ).toEqual({ type: "required" });
  });
});
