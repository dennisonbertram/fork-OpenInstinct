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

  it("preserves automatic choice after a pending or unconfirmed attempt so the model does not resend it", () => {
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
});
