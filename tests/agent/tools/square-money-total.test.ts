import { describe, expect, it } from "vitest";
import {
  squareMoneyTotal,
  squareMoneyTotalInputSchema,
} from "@/agent/tools/square-money-total";
import { toolContextFor } from "@/tests/helpers/tool-context";

const context = toolContextFor({ toolName: "square-money-total" });

describe("square money total tool", () => {
  it("sums USD minor units exactly before formatting", () => {
    expect(
      squareMoneyTotal.execute(
        {
          amounts: [
            { amount: 875, currency: "USD" },
            { amount: 2_000, currency: "USD" },
            { amount: 2_700, currency: "USD" },
          ],
        },
        context
      )
    ).toEqual({ currency: "USD", formatted: "$55.75", totalMinor: 5_575 });
  });

  it("formats a non-fixture USD total exactly", () => {
    expect(
      squareMoneyTotal.execute(
        {
          amounts: [
            { amount: 125, currency: "USD" },
            { amount: 275, currency: "USD" },
          ],
        },
        context
      )
    ).toEqual({ currency: "USD", formatted: "$4.00", totalMinor: 400 });
  });

  it("formats zero and negative USD totals without rounding", () => {
    expect(
      squareMoneyTotal.execute(
        {
          amounts: [
            { amount: -1, currency: "USD" },
            { amount: 1, currency: "USD" },
          ],
        },
        context
      )
    ).toEqual({ currency: "USD", formatted: "$0.00", totalMinor: 0 });
    expect(
      squareMoneyTotal.execute(
        { amounts: [{ amount: -1, currency: "USD" }] },
        context
      )
    ).toEqual({ currency: "USD", formatted: "-$0.01", totalMinor: -1 });
  });

  it.each([
    {
      amounts: [{ amount: 12_345, currency: "JPY" }],
      expected: { currency: "JPY", formatted: "¥12,345", totalMinor: 12_345 },
    },
    {
      amounts: [{ amount: 1_234, currency: "KWD" }],
      expected: {
        currency: "KWD",
        formatted: "KWD\u00a01.234",
        totalMinor: 1_234,
      },
    },
    {
      amounts: [{ amount: 1_234, currency: "CAD" }],
      expected: { currency: "CAD", formatted: "CA$12.34", totalMinor: 1_234 },
    },
    {
      amounts: [{ amount: 1_234, currency: "EUR" }],
      expected: { currency: "EUR", formatted: "€12.34", totalMinor: 1_234 },
    },
    {
      amounts: [{ amount: 1_234, currency: "GBP" }],
      expected: { currency: "GBP", formatted: "£12.34", totalMinor: 1_234 },
    },
  ])("formats supported minor-unit precision: %#", ({ amounts, expected }) => {
    expect(squareMoneyTotal.execute({ amounts }, context)).toEqual(expected);
  });

  it("keeps a large safe USD amount exact", () => {
    expect(
      squareMoneyTotal.execute(
        { amounts: [{ amount: Number.MAX_SAFE_INTEGER, currency: "USD" }] },
        context
      )
    ).toEqual({
      currency: "USD",
      formatted: "$90,071,992,547,409.91",
      totalMinor: Number.MAX_SAFE_INTEGER,
    });
  });

  it.each([
    { amounts: [] },
    { amounts: [{ amount: 1, currency: "ZZZ" }] },
    { amounts: [{ amount: Number.MAX_SAFE_INTEGER + 1, currency: "USD" }] },
    {
      amounts: Array.from({ length: 101 }, () => ({
        amount: 1,
        currency: "USD",
      })),
    },
  ])("rejects unsupported or unsafe input: %#", (input) => {
    expect(squareMoneyTotalInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects mixed currencies", () => {
    expect(() =>
      squareMoneyTotal.execute(
        {
          amounts: [
            { amount: 1, currency: "USD" },
            { amount: 1, currency: "JPY" },
          ],
        },
        context
      )
    ).toThrow(/same currency/i);
  });

  it("rejects a total that exceeds JSON-safe integer precision", () => {
    expect(() =>
      squareMoneyTotal.execute(
        {
          amounts: [
            { amount: Number.MAX_SAFE_INTEGER, currency: "USD" },
            { amount: 1, currency: "USD" },
          ],
        },
        context
      )
    ).toThrow(/safe integer/i);
  });
});
