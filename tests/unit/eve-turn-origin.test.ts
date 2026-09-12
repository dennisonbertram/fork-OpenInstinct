import { describe, expect, it } from "vitest";
import { ContextContainer } from "../../node_modules/eve/dist/src/context/container.js";
import { buildResolveContext } from "../../node_modules/eve/dist/src/context/dynamic-resolve-context.js";
import { TurnTaskDeliveryKey } from "../../node_modules/eve/dist/src/context/keys.js";

function resolveContextForPhase(
  phase: "initiating" | "none" | "pending" | "settled" | undefined
) {
  const context = new ContextContainer();
  if (phase !== undefined) context.set(TurnTaskDeliveryKey, phase);
  return buildResolveContext(context, [
    {
      content:
        "Background task task_synthetic (worker) is completed. This is only test data.",
      role: "user",
    },
  ]);
}

describe("Eve dynamic turn origin", () => {
  it.each([
    ["none", "channel_input"],
    ["initiating", "channel_input"],
    ["pending", "background_task"],
    ["settled", "background_task"],
    [undefined, "unknown"],
  ] as const)(
    "TO-01: projects %s as %s without inspecting the delivered message",
    (phase, expectedOrigin) => {
      expect(resolveContextForPhase(phase)).toMatchObject({
        turn: { origin: expectedOrigin },
      });
    }
  );
});
