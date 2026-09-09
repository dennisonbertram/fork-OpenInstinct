import { describe, expect, it } from "vitest";
import {
  squareDateRange,
  squareDateRangeInputSchema,
} from "@/agent/tools/square-date-range";
import { toolContextFor } from "@/tests/helpers/tool-context";

describe("square date range tool", () => {
  it("derives a 25-hour New York fall-DST day", async () => {
    expect(
      squareDateRange.execute(
        {
          date: "2026-11-01",
          timezone: "America/New_York",
        },
        toolContextFor({ toolName: "square-date-range" })
      )
    ).toEqual({
      endAt: "2026-11-02T04:59:59.999Z",
      startAt: "2026-11-01T04:00:00.000Z",
      timezone: "America/New_York",
    });
  });

  it("derives a 23-hour New York spring-DST day", async () => {
    expect(
      squareDateRange.execute(
        { date: "2026-03-08", timezone: "America/New_York" },
        toolContextFor({ toolName: "square-date-range" })
      )
    ).toMatchObject({
      endAt: "2026-03-09T03:59:59.999Z",
      startAt: "2026-03-08T05:00:00.000Z",
    });
  });

  it("clamps an as-of bound before the next local midnight", async () => {
    expect(
      squareDateRange.execute(
        {
          asOf: "2026-11-02T02:00:00.000Z",
          date: "2026-11-01",
          timezone: "America/New_York",
        },
        toolContextFor({ toolName: "square-date-range" })
      )
    ).toMatchObject({ endAt: "2026-11-02T02:00:00.000Z" });
  });

  it.each([
    { date: "2026-02-30", timezone: "America/New_York" },
    { date: "2026-11-01", timezone: "Not/AZone" },
  ])("rejects invalid date or timezone: %j", (input) => {
    expect(squareDateRangeInputSchema.safeParse(input).success).toBe(false);
  });
});
