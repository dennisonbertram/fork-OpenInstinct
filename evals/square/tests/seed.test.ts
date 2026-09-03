import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fixtureOrderTotalCents,
  runSeed,
  SEED_MARKER,
  type SquareFetch,
} from "@/evals/square/seed";

interface RecordedCall {
  path: string;
  method: string;
  body?: unknown;
}

const catalogUpsertBodySchema = z.object({
  batches: z.array(
    z.object({
      objects: z.array(
        z.object({
          id: z.string(),
          item_data: z
            .object({
              description: z.string().optional(),
              variations: z.array(z.object({ id: z.string() })).optional(),
            })
            .optional(),
          type: z.string(),
        })
      ),
    })
  ),
});

const orderCreateBodySchema = z.object({
  order: z.object({
    line_items: z.array(z.object({ catalog_object_id: z.string() })),
  }),
});

const customerCreateBodySchema = z.object({ note: z.string() });

/** A mock SquareFetch: never touches the network, records every request body. */
function mockSquareFetch() {
  const calls: RecordedCall[] = [];
  let customerCount = 0;
  let orderCount = 0;

  const fetch: SquareFetch = async (path, init) => {
    calls.push({ body: init.body, method: init.method, path });

    if (path === "/v2/customers" && init.method === "GET") {
      return jsonResponse({ customers: [] });
    }
    if (path.startsWith("/v2/catalog/list") && init.method === "GET") {
      return jsonResponse({ objects: [] });
    }
    if (path === "/v2/catalog/batch-upsert") {
      const body = catalogUpsertBodySchema.parse(init.body);
      const objects = body.batches[0]?.objects ?? [];
      const idMappings: { client_object_id: string; object_id: string }[] = [];
      for (const o of objects) {
        idMappings.push({ client_object_id: o.id, object_id: `SQ_${o.id}` });
        for (const v of o.item_data?.variations ?? []) {
          idMappings.push({ client_object_id: v.id, object_id: `SQ_${v.id}` });
        }
      }
      return jsonResponse({ id_mappings: idMappings });
    }
    if (path === "/v2/customers" && init.method === "POST") {
      customerCount += 1;
      return jsonResponse({
        customer: { id: `SQCUST_${String(customerCount)}` },
      });
    }
    if (path === "/v2/orders") {
      orderCount += 1;
      const body = orderCreateBodySchema.parse(init.body);
      return jsonResponse({
        order: {
          id: `SQORD_${String(orderCount)}`,
          total_money: { amount: 100 * body.order.line_items.length },
        },
      });
    }
    if (path === "/v2/payments") {
      return jsonResponse({ payment: { id: "SQPAY_1" } });
    }
    if (path === "/v2/invoices") {
      return jsonResponse({ invoice: { id: "SQINV_1", version: 1 } });
    }
    if (path.endsWith("/publish")) {
      return jsonResponse({ invoice: { id: "SQINV_1", version: 2 } });
    }
    throw new Error(`Unexpected call: ${init.method} ${path}`);
  };

  return { calls, fetch };
}

function jsonResponse<T extends object>(body: T) {
  return Promise.resolve({ json: () => Promise.resolve(body), status: 200 });
}

describe("evals/square/seed", () => {
  it("purges marked customers and catalog objects before recreating", async () => {
    const { fetch, calls } = mockSquareFetch();
    await runSeed(fetch);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/v2/customers" });
    expect(calls[1]?.path).toMatch(/^\/v2\/catalog\/list/);
  });

  it("upserts 6 catalog items marked with the seed marker", async () => {
    const { fetch, calls } = mockSquareFetch();
    await runSeed(fetch);
    const upsert = calls.find((c) => c.path === "/v2/catalog/batch-upsert");
    const body = catalogUpsertBodySchema.parse(upsert?.body);
    const items =
      body.batches[0]?.objects.filter((o) => o.type === "ITEM") ?? [];
    expect(items).toHaveLength(6);
    expect(items.every((i) => i.item_data?.description === SEED_MARKER)).toBe(
      true
    );
  });

  it("creates 4 customers, each with the seed marker as a note", async () => {
    const { fetch, calls } = mockSquareFetch();
    await runSeed(fetch);
    const customerCreates = calls.filter(
      (c) => c.path === "/v2/customers" && c.method === "POST"
    );
    expect(customerCreates).toHaveLength(4);
    for (const call of customerCreates) {
      expect(customerCreateBodySchema.parse(call.body).note).toBe(SEED_MARKER);
    }
  });

  it("creates 4 orders", async () => {
    const { fetch, calls } = mockSquareFetch();
    await runSeed(fetch);
    const orderCreates = calls.filter((c) => c.path === "/v2/orders");
    expect(orderCreates).toHaveLength(4);
  });

  it("computes the invoice's order total as 6300 cents from the fixture", () => {
    expect(fixtureOrderTotalCents("ORD_3")).toBe(6300);
  });

  it("makes no live network calls -- fetch is fully mocked", async () => {
    const { fetch, calls } = mockSquareFetch();
    await runSeed(fetch);
    expect(calls.length).toBeGreaterThan(0);
  });
});
