import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { startFakeSquare } from "@/evals/square/fake/server";

const SQUARE_VERSION = "2025-04-16";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const moneySchema = z.object({ amount: z.number(), currency: z.string() });
const locationsResponseSchema = z.object({
  locations: z.array(z.object({ id: z.string() })),
});
const customersResponseSchema = z.object({
  customers: z.array(z.object({ id: z.string(), email_address: z.string() })),
  cursor: z.string().optional(),
});
const ordersResponseSchema = z.object({
  orders: z.array(z.object({ total_money: moneySchema })),
});
const countsResponseSchema = z.object({
  counts: z.array(z.object({ quantity: z.string() })),
});
const refundsResponseSchema = z.object({
  refunds: z.array(z.unknown()),
  cursor: z.string().optional(),
});
const errorsResponseSchema = z.object({
  errors: z.array(z.object({ code: z.string(), category: z.string() })),
});

async function json<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const raw: unknown = await res.json();
  return schema.parse(raw);
}

describe("fake Square server", () => {
  let square: { url: string; close(): Promise<void> };

  beforeEach(async () => {
    square = await startFakeSquare({ port: 0 });
  });

  afterEach(async () => {
    await square.close();
  });

  function headers(extra: Record<string, string> = {}) {
    return {
      authorization: "Bearer eval",
      "square-version": SQUARE_VERSION,
      "content-type": "application/json",
      ...extra,
    };
  }

  async function get(path: string, extraHeaders?: Record<string, string>) {
    return fetch(`${square.url}${path}`, { headers: headers(extraHeaders) });
  }

  async function post(
    path: string,
    body: JsonValue,
    extraHeaders?: Record<string, string>
  ) {
    return fetch(`${square.url}${path}`, {
      method: "POST",
      headers: headers(extraHeaders),
      body: JSON.stringify(body),
    });
  }

  it("answers GET /v2/locations with the fixture location", async () => {
    const res = await get("/v2/locations");
    expect(res.status).toBe(200);
    const body = await json(res, locationsResponseSchema);
    const [location] = body.locations;
    expect(body.locations).toHaveLength(1);
    expect(location?.id).toBe("LQK1QAMZG63BM");
  });

  it("AE1: SearchOrders filtered by Ada's customer id returns 1 order totaling 875 cents", async () => {
    const searchRes = await post("/v2/customers/search", {
      query: { filter: { email_address: { exact: "ada@example.com" } } },
    });
    const { customers: found } = await json(searchRes, customersResponseSchema);
    expect(found).toHaveLength(1);
    const [ada] = found;
    const adaId = ada?.id ?? "";

    const res = await post("/v2/orders/search", {
      location_ids: ["LQK1QAMZG63BM"],
      query: { filter: { customer_filter: { customer_ids: [adaId] } } },
      return_entries: false,
    });
    expect(res.status).toBe(200);
    const body = await json(res, ordersResponseSchema);
    expect(body.orders).toHaveLength(1);
    const [order] = body.orders;
    expect(order?.total_money).toEqual({ amount: 875, currency: "USD" });
  });

  it("SearchOrders with no filter returns all 4 orders", async () => {
    const res = await post("/v2/orders/search", {
      location_ids: ["LQK1QAMZG63BM"],
      return_entries: false,
    });
    const body = await json(res, ordersResponseSchema);
    expect(body.orders).toHaveLength(4);
  });

  it("ListCustomers pages at size 2: first page has a cursor, second has none", async () => {
    const first = await json(
      await get("/v2/customers"),
      customersResponseSchema
    );
    expect(first.customers).toHaveLength(2);
    expect(first.cursor).toBeTruthy();

    const second = await json(
      await get(`/v2/customers?cursor=${String(first.cursor)}`),
      customersResponseSchema
    );
    expect(second.customers).toHaveLength(2);
    expect(second.cursor).toBeUndefined();
  });

  it("BatchRetrieveInventoryCounts returns the Cold Brew variation's count", async () => {
    const res = await post("/v2/inventory/counts/batch-retrieve", {
      catalog_object_ids: ["VAR_COLD_BREW"],
    });
    const body = await json(res, countsResponseSchema);
    expect(body.counts).toHaveLength(1);
    const [count] = body.counts;
    expect(count?.quantity).toBe("34");
  });

  it("ListRefunds returns an empty array with no cursor", async () => {
    const res = await get("/v2/refunds");
    const body = await json(res, refundsResponseSchema);
    expect(body.refunds).toEqual([]);
    expect(body.cursor).toBeUndefined();
  });

  it("AE2: POST /v2/refunds returns 403 FORBIDDEN", async () => {
    const res = await post("/v2/refunds", {});
    expect(res.status).toBe(403);
    const body = await json(res, errorsResponseSchema);
    const [firstError] = body.errors;
    expect(firstError?.code).toBe("FORBIDDEN");
    expect(firstError?.category).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects a missing bearer token with 401", async () => {
    const res = await fetch(`${square.url}/v2/locations`, {
      headers: { "square-version": SQUARE_VERSION },
    });
    expect(res.status).toBe(401);
    const body = await json(res, errorsResponseSchema);
    const [firstError] = body.errors;
    expect(firstError?.code).toBe("UNAUTHORIZED");
  });

  it("rejects a missing Square-Version header with 400", async () => {
    const res = await fetch(`${square.url}/v2/locations`, {
      headers: { authorization: "Bearer eval" },
    });
    expect(res.status).toBe(400);
    const body = await json(res, errorsResponseSchema);
    const [firstError] = body.errors;
    expect(firstError?.code).toBe("BAD_REQUEST");
  });
});
