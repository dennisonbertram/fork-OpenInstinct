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

  it("derives Ada's completed order items and total for the current fixture", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const facts = adaCase?.facts(fixture) ?? [];
    expect(facts).toContain("$8.75");
    expect(facts).toContain("Espresso");
    expect(facts).toContain("Latte");
    expect(facts).toHaveLength(3);
  });

  it("ada-order-total prompt scopes the question without leaking expected totals or items", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const prompt = adaCase?.prompt ?? "";
    expect(prompt).toContain("Ada Lovelace");
    expect(prompt).toContain("completed");
    expect(prompt).toContain("2026-11-01");
    expect(prompt).toContain("2026-11-02T04:59:59.999Z");
    expect(prompt).toContain("Default Test Account");
    expect(prompt).toContain("America/New_York");
    expect(prompt).toContain("include all pages");
    expect(prompt).not.toContain("$8.75");
    expect(prompt).not.toContain("$26.25");
    expect(prompt).not.toContain("Espresso");
    expect(prompt).not.toContain("Latte");
  });

  it("ada-order-total declares sales scope and requires SearchOrders cursor drain", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    expect(adaCase?.requiresSearchOrderCursorDrain).toBe(true);
    const sales = adaCase?.sales;
    expect(sales).toBeDefined();
    if (!sales) throw new Error("ada-order-total sales metadata missing");
    expect(sales.measure.length).toBeGreaterThan(0);
    expect(sales.period).toContain("2026-11-01T04:00:00.000Z");
    expect(sales.period).toContain("2026-11-02T04:59:59.999Z");
    expect(sales.location).toContain("LQK1QAMZG63BM");
    expect(sales.exclusions).toMatch(/canceled|open/);
  });

  it("ada-order-total facts sum all matching completed orders and ignore distractors", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const base = structuredClone(fixture);
    base.orders = [
      {
        id: "ORD_OTHER_LOC",
        customerId: "CUST_ADA",
        locationId: "LOCATION_OTHER",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T05:00:00Z",
      },
      {
        id: "ORD_CANCELED",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "CANCELED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T06:00:00Z",
      },
      {
        id: "ORD_HISTORICAL",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-03-08T05:00:00Z",
      },
      {
        id: "ORD_MATCH_2",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [2, 3],
        createdAt: "2026-11-01T07:00:00Z",
      },
      {
        id: "ORD_MATCH_1",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T04:00:00Z",
      },
      {
        id: "ORD_OPEN",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "OPEN",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T08:00:00Z",
      },
    ];
    const facts = adaCase?.facts(base) ?? [];
    expect(facts).toContain("Espresso");
    expect(facts).toContain("Latte");
    expect(facts).toContain("Cold Brew");
    expect(facts).toContain("Croissant");
    expect(facts).toContain("$17.75");
    expect(facts.filter((f) => f.startsWith("$"))).toEqual(["$17.75"]);
  });

  it("ada-order-total throws when no orders match the scope", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const base = structuredClone(fixture);
    base.orders = [
      {
        id: "ORD_CANCELED",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "CANCELED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T06:00:00Z",
      },
      {
        id: "ORD_OTHER_DAY",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-03-08T05:00:00Z",
      },
      {
        id: "ORD_OTHER_LOC",
        customerId: "CUST_ADA",
        locationId: "LOCATION_OTHER",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T06:00:00Z",
      },
    ];
    expect(() => adaCase?.facts(base)).toThrow(
      "Fixture has no completed Ada order for the requested period."
    );
  });

  it("ada-order-total facts use numeric timestamp boundaries and offsets", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const base = structuredClone(fixture);
    base.orders = [
      {
        id: "ORD_BEFORE",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T03:59:59.999Z",
      },
      {
        id: "ORD_OFFSET_START",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [2, 3],
        createdAt: "2026-11-01T00:00:00-04:00",
      },
      {
        id: "ORD_START",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T04:00:00.000Z",
      },
      {
        id: "ORD_END_NO_MS",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [2, 3],
        createdAt: "2026-11-02T04:59:59Z",
      },
      {
        id: "ORD_END_OFFSET",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T23:59:59.999-05:00",
      },
      {
        id: "ORD_END_999",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [2, 3],
        createdAt: "2026-11-02T04:59:59.999Z",
      },
      {
        id: "ORD_AFTER",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-02T05:00:00.000Z",
      },
    ];
    const facts = adaCase?.facts(base) ?? [];
    expect(facts).toContain("Espresso");
    expect(facts).toContain("Latte");
    expect(facts).toContain("Cold Brew");
    expect(facts).toContain("Croissant");
    expect(facts).toContain("$44.50");
    expect(facts.filter((f) => f.startsWith("$"))).toEqual(["$44.50"]);
  });

  it("ada-order-total facts are unchanged when matching orders are reversed", () => {
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const ordered = structuredClone(fixture);
    ordered.orders = [
      {
        id: "ORD_MATCH_2",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [2, 3],
        createdAt: "2026-11-01T07:00:00Z",
      },
      {
        id: "ORD_CANCELED",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "CANCELED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T06:00:00Z",
      },
      {
        id: "ORD_MATCH_1",
        customerId: "CUST_ADA",
        locationId: "LQK1QAMZG63BM",
        state: "COMPLETED",
        quantity: 1,
        itemIndexes: [0, 1],
        createdAt: "2026-11-01T04:00:00Z",
      },
    ];
    const reversed = structuredClone(ordered);
    reversed.orders = ordered.orders.toReversed();
    const forward = [...(adaCase?.facts(ordered) ?? [])].toSorted();
    const backward = [...(adaCase?.facts(reversed) ?? [])].toSorted();
    expect(backward).toEqual(forward);
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
      ["square-date-range"],
    ]);
  });

  it("states independent measure, period, location, and exclusions for each sales case", () => {
    const salesCases = squareCases.filter((squareCase) => squareCase.sales);
    expect(salesCases.map((squareCase) => squareCase.id)).toEqual([
      "ada-order-total",
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
