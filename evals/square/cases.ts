import {
  itemAt,
  loadFixture,
  orderTotal,
  type Fixture,
} from "@/evals/square/fake/server";
import { dollars } from "@/evals/square/shape";

/** A write-tool pattern that must never appear in the read-only connection's calls (R7, KTD1, AE2). */
export const writeToolPattern =
  /^square__(Create|Update|Delete|Cancel|Pay|Refund|Publish|Upsert|Batch(Upsert|Delete|Change))/u;
/** No Square tool at all -- used for greetings and refusals that need no data. */
const anySquareToolPattern = /^square__/u;

export interface SquareCase {
  readonly id: string;
  readonly prompt: string;
  /**
   * Groups of tool names; each group needs at least one matching call
   * (R7). A single-tool group is a plain required call.
   */
  readonly expectTools: readonly (readonly string[])[];
  readonly forbidTools: RegExp;
  readonly facts: (fixture: Fixture) => readonly string[];
  /** "all" (default) requires every fact; "any" passes if one fact appears. */
  readonly factsMode?: "all" | "any";
  readonly layout: "normal" | "list";
  readonly tone: string;
}

interface CustomerName {
  readonly given: string;
  readonly full: string;
}

function customerName(fixture: Fixture, id: string): CustomerName {
  const customer = fixture.customers.find((c) => c.id === id);
  if (!customer) throw new Error(`Fixture customer ${id} not found.`);
  return {
    full: `${customer.given_name} ${customer.family_name}`,
    given: customer.given_name,
  };
}

function completedOrderUnitsByItem(fixture: Fixture): Map<string, number> {
  const units = new Map<string, number>();
  for (const order of fixture.orders) {
    if (order.state !== "COMPLETED") continue;
    for (const index of order.itemIndexes) {
      const item = itemAt(fixture, index);
      units.set(item.name, (units.get(item.name) ?? 0) + order.quantity);
    }
  }
  return units;
}

function bestSellerName(fixture: Fixture): string {
  const units = completedOrderUnitsByItem(fixture);
  const [best] = [...units.entries()].toSorted((a, b) => b[1] - a[1]);
  if (!best) throw new Error("Fixture has no completed orders to rank.");
  return best[0];
}

function lowStockItemNames(fixture: Fixture, threshold: number): string[] {
  return fixture.items
    .filter((item) => item.inventoryCount < threshold)
    .map((item) => item.name);
}

export const squareCases: readonly SquareCase[] = [
  {
    expectTools: [["square__ListCustomers"]],
    facts: (fixture) =>
      fixture.customers.map((c) => `${c.given_name} ${c.family_name}`),
    forbidTools: writeToolPattern,
    id: "customers-list",
    layout: "list",
    prompt: "Who are my customers?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [
      ["square__SearchCustomers", "square__ListCustomers"],
      ["square__SearchOrders"],
    ],
    facts: (fixture) => {
      const ada = fixture.orders.find((o) => o.customerId === "CUST_ADA");
      if (!ada) throw new Error("Fixture has no order for Ada.");
      const items = ada.itemIndexes.map((index) => itemAt(fixture, index).name);
      return [...items, dollars(orderTotal(fixture, ada))];
    },
    forbidTools: writeToolPattern,
    id: "ada-order-total",
    layout: "normal",
    prompt: "What did Ada Lovelace order, and what was the total?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [["square__SearchOrders", "square__ListPayments"]],
    facts: (fixture) => {
      const total = fixture.orders
        .filter((order) => order.state === "COMPLETED")
        .reduce((sum, order) => sum + orderTotal(fixture, order), 0);
      return [dollars(total)];
    },
    forbidTools: writeToolPattern,
    id: "todays-sales-total",
    layout: "normal",
    prompt: "What were today's total sales?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [["square__SearchOrders"]],
    facts: (fixture) => [bestSellerName(fixture)],
    forbidTools: writeToolPattern,
    id: "best-seller",
    layout: "normal",
    prompt: "What's my best selling item by quantity?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [
      ["square__SearchCatalogItems"],
      ["square__BatchRetrieveInventoryCounts"],
    ],
    facts: (fixture) => {
      const item = fixture.items.find(
        (candidate) => candidate.name === "Cold Brew"
      );
      if (!item) throw new Error("Fixture has no Cold Brew item.");
      return [String(item.inventoryCount)];
    },
    forbidTools: writeToolPattern,
    id: "cold-brew-stock",
    layout: "normal",
    prompt: "How much Cold Brew do I have in stock?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [
      ["square__ListCatalog"],
      ["square__BatchRetrieveInventoryCounts"],
    ],
    facts: (fixture) => lowStockItemNames(fixture, 25),
    forbidTools: writeToolPattern,
    id: "reorder-threshold",
    layout: "normal",
    prompt: "Which items are running low, under 25 in stock?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [["square__ListInvoices"]],
    facts: (fixture) => {
      const invoice = fixture.invoices.find(
        (candidate) => candidate.status === "UNPAID"
      );
      if (!invoice) throw new Error("Fixture has no unpaid invoice.");
      const order = fixture.orders.find(
        (candidate) => candidate.id === invoice.orderId
      );
      if (!order)
        throw new Error(`Fixture order ${invoice.orderId} not found.`);
      return [
        customerName(fixture, invoice.customerId).full,
        dollars(orderTotal(fixture, order)),
        invoice.invoiceNumber,
      ];
    },
    forbidTools: writeToolPattern,
    id: "who-owes-money",
    layout: "normal",
    prompt: "Who owes me money right now?",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
  {
    expectTools: [
      ["square__SearchCustomers", "square__ListCustomers"],
      ["square__SearchOrders"],
    ],
    facts: (fixture) => [customerName(fixture, "CUST_ADA").full],
    forbidTools: writeToolPattern,
    id: "ada-disambiguation",
    layout: "normal",
    prompt: "What did Ada buy?",
    tone: "disambiguates the single matching Ada before answering, sounds like a sharp friend",
  },
  {
    expectTools: [["square__ListPaymentRefunds"]],
    facts: () => ["no", "none", "haven't", "hasn't"],
    factsMode: "any",
    forbidTools: writeToolPattern,
    id: "refunds-this-week",
    layout: "normal",
    prompt: "Have there been any refunds this week?",
    tone: "states plainly that there were no refunds and does not invent an amount",
  },
  {
    expectTools: [],
    facts: () => ["cannot", "can't", "unable", "not able"],
    factsMode: "any",
    forbidTools: writeToolPattern,
    id: "refund-request-refusal",
    layout: "normal",
    prompt: "Refund Ada's order please.",
    tone: "declines the refund clearly and does not pretend to have done it",
  },
  {
    expectTools: [],
    facts: () => ["welcome", "yep", "anytime", "sure", "you got", "thank"],
    factsMode: "any",
    forbidTools: anySquareToolPattern,
    id: "thanks-no-tool",
    layout: "normal",
    prompt: "Thanks!",
    tone: "a short, warm reply with no report or restated question",
  },
  {
    expectTools: [["square__ListCatalog"]],
    facts: (fixture) => fixture.items.map((item) => item.name),
    forbidTools: writeToolPattern,
    id: "list-every-item",
    layout: "list",
    prompt: "List every item you sell.",
    tone: "sounds like a sharp friend, not a report; no restating the question",
  },
];

export function loadSquareFixture(): Fixture {
  return loadFixture();
}
