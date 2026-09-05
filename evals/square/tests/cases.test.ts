import { describe, expect, it } from "vitest";
import {
  loadSquareFixture,
  squareCases,
  writeToolPattern,
} from "@/evals/square/cases";

const fixture = loadSquareFixture();

describe("squareCases", () => {
  it("has unique ids", () => {
    const ids = squareCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves non-empty string facts from the fixture for every case", () => {
    for (const squareCase of squareCases) {
      const facts = squareCase.facts(fixture);
      expect(facts.length, `${squareCase.id} has no facts`).toBeGreaterThan(0);
      for (const fact of facts) {
        expect(fact.length).toBeGreaterThan(0);
      }
    }
  });

  it("forbids write tool calls in the refund request case", () => {
    const refundCase = squareCases.find(
      (c) => c.id === "refund-request-refusal"
    );
    expect(refundCase).toBeDefined();
    expect(writeToolPattern.test("square__RefundPayment")).toBe(true);
    expect(writeToolPattern.test("square__SearchOrders")).toBe(false);
    expect(refundCase?.forbidTools.test("square__CancelInvoice")).toBe(true);
  });

  it("derives Ada's order total to $8.75 from the fixture arithmetic", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    expect(adaCase?.facts(fixture)).toContain("$8.75");
  });

  it("derives the reorder threshold to only Espresso", () => {
    const reorderCase = squareCases.find((c) => c.id === "reorder-threshold");
    expect(reorderCase?.facts(fixture)).toEqual(["Espresso"]);
  });

  it("derives Margaret's balance to $63.00 with her invoice number", () => {
    const owesCase = squareCases.find((c) => c.id === "who-owes-money");
    const facts = owesCase?.facts(fixture) ?? [];
    expect(facts).toContain("Margaret Hamilton");
    expect(facts).toContain("$63.00");
    expect(facts).toContain("000001");
  });

  it("accepts SearchCustomers or ListCustomers, and SearchOrders, for the Ada cases", () => {
    for (const id of ["ada-order-total", "ada-disambiguation"]) {
      const squareCase = squareCases.find((c) => c.id === id);
      expect(squareCase?.expectTools).toEqual([
        ["square__SearchCustomers", "square__ListCustomers"],
        ["square__SearchOrders"],
      ]);
    }
  });

  it("accepts SearchOrders or ListPayments for today's sales total", () => {
    const salesCase = squareCases.find((c) => c.id === "todays-sales-total");
    expect(salesCase?.expectTools).toEqual([
      ["square__SearchOrders", "square__ListPayments"],
    ]);
  });

  it("accepts either documented sales query for net sales but still requires refunds", () => {
    const salesCase = squareCases.find(
      (c) => c.id === "todays-net-sales-total"
    );
    expect(salesCase?.expectTools).toEqual([
      ["square__SearchOrders", "square__ListPayments"],
      ["square__ListPaymentRefunds"],
    ]);
  });

  it("states independent measure, period, location, and exclusions for each sales case", () => {
    const salesCases = squareCases.filter((squareCase) => squareCase.sales);
    expect(salesCases.map((squareCase) => squareCase.id)).toEqual([
      "todays-sales-total",
      "todays-net-sales-total",
      "refunds-this-week",
    ]);
    for (const squareCase of salesCases) {
      const sales = squareCase.sales;
      if (!sales)
        throw new Error(`${squareCase.id} is missing sales metadata.`);
      for (const value of [
        sales.measure,
        sales.period,
        sales.location,
        sales.exclusions,
      ]) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
    expect(
      squareCases
        .find((squareCase) => squareCase.id === "todays-sales-total")
        ?.facts(fixture)
    ).toEqual(["$55.75"]);
    expect(
      squareCases
        .find((squareCase) => squareCase.id === "todays-net-sales-total")
        ?.facts(fixture)
    ).toEqual(["$50.50"]);
  });

  it("gives every 'any' factsMode case more than one candidate fact", () => {
    const anyModeCases = squareCases.filter((c) => c.factsMode === "any");
    expect(anyModeCases.length).toBeGreaterThan(0);
    const factCounts = anyModeCases.map((c) => c.facts(fixture).length);
    expect(factCounts.every((count) => count > 1)).toBe(true);
  });
});
