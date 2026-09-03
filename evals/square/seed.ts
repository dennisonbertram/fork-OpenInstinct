// Tier B seed (R15, KTD1, KTD8): populates a dedicated Square sandbox test
// account with the same data shape as evals/square/fake/fixture.json, so a
// live sandbox run answers the same questions the fake does.
//
// Refuses outside a sandbox host, and never touches SQUARE_ENVIRONMENT=production.
// Orders and payments cannot be deleted through the Square API, so this script
// only deletes and recreates customers and catalog objects (marked with
// SEED_MARKER); it prints the seed timestamp so tier B questions can be
// scoped to "since this run" and old orders/payments accumulate across runs.
//
// Usage: SQUARE_SEED_ACCESS_TOKEN=<sandbox eval account token> node evals/square/seed.ts
import fixtureJson from "./fake/fixture.json" with { type: "json" };
import { z } from "zod";

export const SEED_MARKER = "openinstinct-eval-seed";
const SANDBOX_HOST = "connect.squareupsandbox.com";
const SQUARE_VERSION = "2025-04-16";

const fixtureSchema = z.object({
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  customers: z.array(
    z.object({
      email_address: z.string(),
      family_name: z.string(),
      given_name: z.string(),
      id: z.string(),
    })
  ),
  invoices: z.array(
    z.object({
      customerId: z.string(),
      dueDate: z.string(),
      orderId: z.string(),
      title: z.string(),
    })
  ),
  items: z.array(
    z.object({
      categoryId: z.string(),
      itemId: z.string(),
      name: z.string(),
      priceCents: z.number(),
      variationId: z.string(),
    })
  ),
  location: z.object({ currency: z.string(), id: z.string() }),
  orders: z.array(
    z.object({
      customerId: z.string(),
      id: z.string(),
      itemIndexes: z.tuple([z.number(), z.number()]),
      quantity: z.number(),
      state: z.enum(["COMPLETED", "OPEN"]),
    })
  ),
});

const fixture = fixtureSchema.parse(fixtureJson);

/* oxlint-disable anti-slop/no-unknown-returns -- this is the raw HTTP boundary; every caller parses the body with a zod schema (parseBody) before touching it. */
export type SquareFetch = (
  path: string,
  init: { method: string; body?: unknown }
) => Promise<{ status: number; json: () => Promise<unknown> }>;
/* oxlint-enable anti-slop/no-unknown-returns */

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- logs whatever Square returned for an error, already parsed or not; only used for diagnostics.
function assertOk(status: number, path: string, body: unknown): void {
  if (status >= 200 && status < 300) return;
  throw new Error(
    `Square ${path} returned ${String(status)}: ${JSON.stringify(body)}`
  );
}

/** Parses a raw SquareFetch response body against a schema at the I/O boundary. */
async function parseBody<T>(
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- the raw SquareFetch response; schema.parse validates it before anything downstream sees the value.
  res: { json: () => Promise<unknown> },
  schema: z.ZodType<T>
): Promise<T> {
  return schema.parse(await res.json());
}

function makeSquareFetch(baseUrl: string, token: string): SquareFetch {
  return async (path, init) =>
    fetch(`${baseUrl}${path}`, {
      body: init.body ? JSON.stringify(init.body) : undefined,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      method: init.method,
    });
}

function idempotencyKey(scope: string): string {
  return `${SEED_MARKER}-${scope}-${crypto.randomUUID()}`;
}

const customersResponseSchema = z.object({
  customers: z
    .array(z.object({ id: z.string(), note: z.string().optional() }))
    .optional(),
});

async function purgeMarkedCustomers(squareFetch: SquareFetch): Promise<void> {
  const res = await squareFetch("/v2/customers", { method: "GET" });
  const body = await parseBody(res, customersResponseSchema);
  assertOk(res.status, "GET /v2/customers", body);
  const ids = (body.customers ?? [])
    .filter((c) => c.note === SEED_MARKER)
    .map((c) => c.id);
  /* oxlint-disable eslint/no-await-in-loop -- one seed run touches a handful of test-account rows; sequential deletes avoid idempotency-key collisions on the sandbox account. */
  for (const id of ids) {
    const del = await squareFetch(`/v2/customers/${id}`, {
      method: "DELETE",
    });
    assertOk(del.status, `DELETE /v2/customers/${id}`, await del.json());
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

const catalogListResponseSchema = z.object({
  objects: z
    .array(
      z.object({
        id: z.string(),
        item_data: z.object({ description: z.string().optional() }).optional(),
      })
    )
    .optional(),
});

async function purgeMarkedCatalogObjects(
  squareFetch: SquareFetch
): Promise<void> {
  const res = await squareFetch("/v2/catalog/list?types=ITEM", {
    method: "GET",
  });
  const body = await parseBody(res, catalogListResponseSchema);
  assertOk(res.status, "GET /v2/catalog/list", body);
  const ids = (body.objects ?? [])
    .filter((o) => o.item_data?.description === SEED_MARKER)
    .map((o) => o.id);
  if (ids.length === 0) return;
  const del = await squareFetch("/v2/catalog/batch-delete", {
    body: { object_ids: ids },
    method: "POST",
  });
  assertOk(del.status, "POST /v2/catalog/batch-delete", await del.json());
}

interface CatalogUpsertResult {
  idMappings: Map<string, string>;
}

const catalogUpsertResponseSchema = z.object({
  id_mappings: z
    .array(z.object({ client_object_id: z.string(), object_id: z.string() }))
    .optional(),
});

async function upsertCatalog(
  squareFetch: SquareFetch
): Promise<CatalogUpsertResult> {
  const categoryObjects = fixture.categories.map((category) => ({
    category_data: { name: category.name },
    id: `#${category.id}`,
    type: "CATEGORY",
  }));
  const itemObjects = fixture.items.map((item) => ({
    id: `#${item.itemId}`,
    item_data: {
      category_id: `#${item.categoryId}`,
      description: SEED_MARKER,
      name: item.name,
      variations: [
        {
          id: `#${item.variationId}`,
          item_variation_data: {
            item_id: `#${item.itemId}`,
            name: item.name,
            price_money: {
              amount: item.priceCents,
              currency: fixture.location.currency,
            },
          },
          type: "ITEM_VARIATION",
        },
      ],
    },
    type: "ITEM",
  }));
  const res = await squareFetch("/v2/catalog/batch-upsert", {
    body: {
      batches: [{ objects: [...categoryObjects, ...itemObjects] }],
      idempotency_key: idempotencyKey("catalog"),
    },
    method: "POST",
  });
  const body = await parseBody(res, catalogUpsertResponseSchema);
  assertOk(res.status, "POST /v2/catalog/batch-upsert", body);
  const idMappings = new Map(
    (body.id_mappings ?? []).map((m) => [m.client_object_id, m.object_id])
  );
  return { idMappings };
}

const createCustomerResponseSchema = z.object({
  customer: z.object({ id: z.string() }).optional(),
});

async function createCustomers(
  squareFetch: SquareFetch
): Promise<Map<string, string>> {
  const created = new Map<string, string>();
  /* oxlint-disable eslint/no-await-in-loop -- creates a handful of sandbox customers sequentially so idempotency keys never race. */
  for (const customer of fixture.customers) {
    const res = await squareFetch("/v2/customers", {
      body: {
        email_address: customer.email_address,
        family_name: customer.family_name,
        given_name: customer.given_name,
        idempotency_key: idempotencyKey(`customer-${customer.id}`),
        note: SEED_MARKER,
      },
      method: "POST",
    });
    const body = await parseBody(res, createCustomerResponseSchema);
    assertOk(res.status, "POST /v2/customers", body);
    if (!body.customer) throw new Error("Square did not return a customer.");
    created.set(customer.id, body.customer.id);
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return created;
}

const createOrderResponseSchema = z.object({
  order: z
    .object({
      id: z.string(),
      total_money: z.object({ amount: z.number() }).optional(),
    })
    .optional(),
});

async function createOrders(
  squareFetch: SquareFetch,
  idMappings: Map<string, string>,
  customerIds: Map<string, string>
): Promise<Map<string, { id: string; totalCents: number }>> {
  const created = new Map<string, { id: string; totalCents: number }>();
  /* oxlint-disable eslint/no-await-in-loop -- creates a handful of sandbox orders sequentially so idempotency keys never race. */
  for (const order of fixture.orders) {
    const customerId = customerIds.get(order.customerId);
    if (!customerId) {
      throw new Error(`No created customer for ${order.customerId}.`);
    }
    const lineItems = order.itemIndexes.map((index) => {
      const item = fixture.items[index];
      if (!item) {
        throw new Error(`Fixture item index ${String(index)} out of range.`);
      }
      const variationId = idMappings.get(`#${item.variationId}`);
      if (!variationId) {
        throw new Error(`No created catalog id for ${item.variationId}.`);
      }
      return {
        catalog_object_id: variationId,
        quantity: String(order.quantity),
      };
    });
    const res = await squareFetch("/v2/orders", {
      body: {
        idempotency_key: idempotencyKey(`order-${order.id}`),
        order: {
          customer_id: customerId,
          line_items: lineItems,
          location_id: fixture.location.id,
        },
      },
      method: "POST",
    });
    const body = await parseBody(res, createOrderResponseSchema);
    assertOk(res.status, "POST /v2/orders", body);
    if (!body.order) throw new Error("Square did not return an order.");
    created.set(order.id, {
      id: body.order.id,
      totalCents: body.order.total_money?.amount ?? 0,
    });
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return created;
}

async function payCompletedOrders(
  squareFetch: SquareFetch,
  createdOrders: Map<string, { id: string; totalCents: number }>
): Promise<void> {
  /* oxlint-disable eslint/no-await-in-loop -- pays a handful of sandbox orders sequentially so idempotency keys never race. */
  for (const order of fixture.orders) {
    if (order.state !== "COMPLETED") continue;
    const created = createdOrders.get(order.id);
    if (!created) throw new Error(`No created order for ${order.id}.`);
    const res = await squareFetch("/v2/payments", {
      body: {
        amount_money: {
          amount: created.totalCents,
          currency: fixture.location.currency,
        },
        idempotency_key: idempotencyKey(`payment-${order.id}`),
        order_id: created.id,
        source_id: "cnon:card-nonce-ok",
      },
      method: "POST",
    });
    assertOk(res.status, "POST /v2/payments", await res.json());
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

const createInvoiceResponseSchema = z.object({
  invoice: z.object({ id: z.string(), version: z.number() }).optional(),
});

async function createAndPublishInvoices(
  squareFetch: SquareFetch,
  createdOrders: Map<string, { id: string; totalCents: number }>,
  customerIds: Map<string, string>
): Promise<void> {
  /* oxlint-disable eslint/no-await-in-loop -- creates and publishes a handful of sandbox invoices sequentially so idempotency keys never race. */
  for (const invoice of fixture.invoices) {
    const created = createdOrders.get(invoice.orderId);
    const customerId = customerIds.get(invoice.customerId);
    if (!created || !customerId) {
      throw new Error(`Missing order/customer for invoice ${invoice.orderId}.`);
    }
    const res = await squareFetch("/v2/invoices", {
      body: {
        idempotency_key: idempotencyKey(`invoice-${invoice.orderId}`),
        invoice: {
          location_id: fixture.location.id,
          order_id: created.id,
          payment_requests: [
            { due_date: invoice.dueDate, request_type: "BALANCE" },
          ],
          primary_recipient: { customer_id: customerId },
          title: invoice.title,
        },
      },
      method: "POST",
    });
    const body = await parseBody(res, createInvoiceResponseSchema);
    assertOk(res.status, "POST /v2/invoices", body);
    if (!body.invoice) throw new Error("Square did not return an invoice.");
    const publish = await squareFetch(
      `/v2/invoices/${body.invoice.id}/publish`,
      {
        body: {
          idempotency_key: idempotencyKey(`invoice-publish-${invoice.orderId}`),
          version: body.invoice.version,
        },
        method: "POST",
      }
    );
    assertOk(
      publish.status,
      `POST /v2/invoices/${body.invoice.id}/publish`,
      await publish.json()
    );
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

/** Pure line-item arithmetic, independent of what Square computes server-side (used by tests). */
export function fixtureOrderTotalCents(orderId: string): number {
  const order = fixture.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new Error(`Fixture order ${orderId} not found.`);
  return order.itemIndexes.reduce((sum, index) => {
    const item = fixture.items[index];
    if (!item) {
      throw new Error(`Fixture item index ${String(index)} out of range.`);
    }
    return sum + item.priceCents * order.quantity;
  }, 0);
}

export interface SeedResult {
  seededAt: string;
  customerIds: string[];
  catalogItemIds: string[];
  orderIds: string[];
}

export async function runSeed(squareFetch: SquareFetch): Promise<SeedResult> {
  await purgeMarkedCustomers(squareFetch);
  await purgeMarkedCatalogObjects(squareFetch);

  const { idMappings } = await upsertCatalog(squareFetch);
  const customerIds = await createCustomers(squareFetch);
  const createdOrders = await createOrders(
    squareFetch,
    idMappings,
    customerIds
  );
  await payCompletedOrders(squareFetch, createdOrders);
  await createAndPublishInvoices(squareFetch, createdOrders, customerIds);

  return {
    catalogItemIds: fixture.items.map(
      (item) => idMappings.get(`#${item.itemId}`) ?? ""
    ),
    customerIds: [...customerIds.values()],
    orderIds: [...createdOrders.values()].map((o) => o.id),
    seededAt: new Date().toISOString(),
  };
}

function refuseUnlessSandbox(env: NodeJS.ProcessEnv): void {
  if (env.SQUARE_ENVIRONMENT === "production") {
    throw new Error(
      "Refusing to seed: SQUARE_ENVIRONMENT is production. This script only targets a sandbox test account."
    );
  }
  const baseUrl = env.SQUARE_SEED_BASE_URL ?? `https://${SANDBOX_HOST}`;
  if (new URL(baseUrl).host !== SANDBOX_HOST) {
    throw new Error(
      `Refusing to seed: host must be ${SANDBOX_HOST}, got ${new URL(baseUrl).host}.`
    );
  }
}

async function main(): Promise<void> {
  // oxlint-disable-next-line eslint/no-restricted-properties -- reads the operator-supplied seed token and sandbox override, both validated by refuseUnlessSandbox above
  const env = process.env;
  refuseUnlessSandbox(env);
  const token = env.SQUARE_SEED_ACCESS_TOKEN;
  if (!token) {
    throw new Error("SQUARE_SEED_ACCESS_TOKEN is required.");
  }
  const baseUrl = env.SQUARE_SEED_BASE_URL ?? `https://${SANDBOX_HOST}`;
  const result = await runSeed(makeSquareFetch(baseUrl, token));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
