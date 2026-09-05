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
/**
 * Checkable tone bar for plain answers. The earlier "sounds like a sharp
 * friend" wording scored 0% on correct one-sentence replies (see
 * docs/SQUARE.md, second run), so the bar names observable properties.
 */
const directTone =
  "leads with the answer in one or two sentences; does not restate the question, use headers or bullets, or mention which tools were used";
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
  /** Present for money questions so the fixture cannot hide ambiguous accounting. */
  readonly sales?: {
    readonly exclusions: string;
    readonly location: string;
    readonly measure: string;
    readonly period: string;
  };
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
    tone: directTone,
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
    tone: directTone,
  },
  {
    expectTools: [["square__SearchOrders", "square__ListPayments"]],
    facts: () => ["$55.75"],
    forbidTools: writeToolPattern,
    id: "todays-sales-total",
    layout: "normal",
    prompt:
      "As of 2026-11-02T04:59:59.999Z, what were today's gross completed sales at Default Test Account in America/New_York? Treat today as 2026-11-01 local time, include all pages, and do not subtract refunds.",
    sales: {
      exclusions:
        "canceled, open, yesterday, and other-location orders; refunds are not subtracted",
      location: "Default Test Account (LQK1QAMZG63BM)",
      measure: "gross completed sales",
      period:
        "2026-11-01 America/New_York inclusive: [2026-11-01T04:00:00.000Z, 2026-11-02T04:59:59.999Z]",
    },
    tone: directTone,
  },
  {
    expectTools: [
      ["square__SearchOrders", "square__ListPayments"],
      ["square__ListPaymentRefunds"],
    ],
    facts: () => ["$50.50"],
    forbidTools: writeToolPattern,
    id: "todays-net-sales-total",
    layout: "normal",
    prompt:
      "As of 2026-11-02T04:59:59.999Z, what were today's net sales after refunds at Default Test Account in America/New_York? Treat today as 2026-11-01 local time and include all pages.",
    sales: {
      exclusions:
        "canceled, open, yesterday, and other-location orders; subtract completed refunds in the same period",
      location: "Default Test Account (LQK1QAMZG63BM)",
      measure: "net sales after refunds",
      period:
        "2026-11-01 America/New_York inclusive: [2026-11-01T04:00:00.000Z, 2026-11-02T04:59:59.999Z]",
    },
    tone: directTone,
  },
  {
    expectTools: [["square__SearchOrders"]],
    facts: (fixture) => [bestSellerName(fixture)],
    forbidTools: writeToolPattern,
    id: "best-seller",
    layout: "normal",
    prompt: "What's my best selling item by quantity?",
    tone: directTone,
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
    tone: directTone,
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
    tone: directTone,
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
    tone: directTone,
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
    tone: "names the one matching customer in full (Ada Lovelace) instead of asking which Ada; answers in one or two sentences",
  },
  {
    expectTools: [["square__ListPaymentRefunds"]],
    facts: () => ["$5.25"],
    forbidTools: writeToolPattern,
    id: "refunds-this-week",
    layout: "normal",
    prompt:
      "As of 2026-11-02T04:59:59.999Z, how much was refunded this week at Default Test Account in America/New_York? Report the refund total, not net sales.",
    sales: {
      exclusions:
        "refunds outside the stated week and all orders; this is not a net-sales measure",
      location: "Default Test Account (LQK1QAMZG63BM)",
      measure: "completed refund total",
      period: "week ending 2026-11-01 America/New_York",
    },
    tone: "states the $5.25 completed refund total plainly and does not call it net sales",
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
    facts: () => [
      "welcome",
      "yep",
      "anytime",
      "sure",
      "you got",
      "thank",
      "reacted",
    ],
    factsMode: "any",
    forbidTools: anySquareToolPattern,
    id: "thanks-no-tool",
    layout: "normal",
    prompt: "Thanks!",
    tone: "a short, warm acknowledgement, either a brief text reply or a positive native reaction such as a heart or thumbs-up, with no report or restated question",
  },
  {
    expectTools: [["square__ListCatalog", "square__SearchCatalogItems"]],
    facts: (fixture) => fixture.items.map((item) => item.name),
    forbidTools: writeToolPattern,
    id: "list-every-item",
    layout: "list",
    prompt: "List every item you sell.",
    tone: directTone,
  },
];

export function loadSquareFixture(): Fixture {
  return loadFixture();
}
