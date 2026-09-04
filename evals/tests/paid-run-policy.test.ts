import { describe, expect, it } from "vitest";
import { reserveEstimatedCost } from "@/evals/paid-run-policy";

describe("paid run reservations", () => {
  it("keeps each prior attempt's estimate after a later cheap attempt", () => {
    expect(() => {
      reserveEstimatedCost(
        { estimatedCostUsd: 4, maxCostUsd: 12 },
        {
          actorCostUnaccountable: false,
          actorCostsUsd: [6, 0],
        }
      );
    }).toThrow("next estimated attempt would exceed");
  });
});
