// Proves the fake Square server's HTTP responses agree with the facts
// cases.ts derives from the same fixture -- no model involved.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadSquareFixture, squareCases } from "@/evals/square/cases";
import { startFakeSquare } from "@/evals/square/fake/server";

const SQUARE_VERSION = "2025-04-16";
let server: Awaited<ReturnType<typeof startFakeSquare>>;

beforeAll(async () => {
  server = await startFakeSquare({});
});

afterAll(async () => {
  await server.close();
});

interface SearchOrdersBody {
  readonly query: {
    readonly filter: {
      readonly customer_filter: { readonly customer_ids: string[] };
    };
  };
}

const searchOrdersResponseSchema = z.object({
  orders: z.array(z.object({ total_money: z.object({ amount: z.number() }) })),
});

const invoicesResponseSchema = z.object({
  invoices: z.array(
    z.object({
      invoice_number: z.string(),
      payment_requests: z.array(
        z.object({ computed_amount_money: z.object({ amount: z.number() }) })
      ),
    })
  ),
});

function authHeaders() {
  return {
    authorization: "Bearer eval",
    "content-type": "application/json",
    "square-version": SQUARE_VERSION,
  };
}

async function searchOrders(body: SearchOrdersBody) {
  const res = await fetch(`${server.url}/v2/orders/search`, {
    body: JSON.stringify(body),
    headers: authHeaders(),
    method: "POST",
  });
  return searchOrdersResponseSchema.parse(await res.json());
}

async function listInvoices() {
  const res = await fetch(`${server.url}/v2/invoices`, {
    headers: authHeaders(),
  });
  return invoicesResponseSchema.parse(await res.json());
}

describe("fake Square agrees with case facts", () => {
  it("SearchOrders for Ada matches the ada-order-total case's derived total", async () => {
    const fixture = loadSquareFixture();
    const adaCase = squareCases.find((c) => c.id === "ada-order-total");
    const expected = adaCase?.facts(fixture) ?? [];

    const result = await searchOrders({
      query: { filter: { customer_filter: { customer_ids: ["CUST_ADA"] } } },
    });

    expect(result.orders).toHaveLength(1);
    const [order] = result.orders;
    const totalDollars = `$${((order?.total_money.amount ?? 0) / 100).toFixed(2)}`;
    expect(expected).toContain(totalDollars);
  });

  it("ListInvoices matches the who-owes-money case's derived facts", async () => {
    const fixture = loadSquareFixture();
    const owesCase = squareCases.find((c) => c.id === "who-owes-money");
    const expected = owesCase?.facts(fixture) ?? [];

    const result = await listInvoices();

    expect(result.invoices).toHaveLength(1);
    const [invoice] = result.invoices;
    expect(expected).toContain(invoice?.invoice_number);
    const amount =
      invoice?.payment_requests[0]?.computed_amount_money.amount ?? 0;
    expect(expected).toContain(`$${(amount / 100).toFixed(2)}`);
  });
});
