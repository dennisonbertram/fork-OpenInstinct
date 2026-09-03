// A deterministic, read-only fake of the Square API, backed by
// evals/square/fake/fixture.json. Mirrors the shapes in the pinned spec
// (https://raw.githubusercontent.com/square/connect-api-specification/551af55f16fce178780e6556570973aaf660e52a/api.json)
// closely enough for the agent's read-only operations (agent/lib/square/operations.ts)
// to round-trip through it. Every write path returns a Square-shaped 403.
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";
import fixtureJson from "./fixture.json" with { type: "json" };
import { z } from "zod";

const CUSTOMERS_PAGE_SIZE = 2;

interface Money {
  amount: number;
  currency: string;
}

const fixtureItemSchema = z.object({
  itemId: z.string(),
  variationId: z.string(),
  name: z.string(),
  categoryId: z.string(),
  priceCents: z.number(),
  inventoryCount: z.number(),
});

const fixtureOrderSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  state: z.enum(["COMPLETED", "OPEN"]),
  quantity: z.number(),
  itemIndexes: z.tuple([z.number(), z.number()]),
  createdAt: z.string(),
});

const fixtureSchema = z.object({
  location: z.object({
    id: z.string(),
    name: z.string(),
    currency: z.string(),
    status: z.string(),
    created_at: z.string(),
  }),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  items: z.array(fixtureItemSchema),
  customers: z.array(
    z.object({
      id: z.string(),
      given_name: z.string(),
      family_name: z.string(),
      email_address: z.string(),
      created_at: z.string(),
    })
  ),
  orders: z.array(fixtureOrderSchema),
  payments: z.array(
    z.object({ id: z.string(), orderId: z.string(), createdAt: z.string() })
  ),
  invoices: z.array(
    z.object({
      id: z.string(),
      orderId: z.string(),
      customerId: z.string(),
      invoiceNumber: z.string(),
      title: z.string(),
      status: z.string(),
      dueDate: z.string(),
      createdAt: z.string(),
    })
  ),
});

export type Fixture = z.infer<typeof fixtureSchema>;
export type FixtureItem = z.infer<typeof fixtureItemSchema>;
export type FixtureOrder = z.infer<typeof fixtureOrderSchema>;
type FixtureCustomer = Fixture["customers"][number];
type FixturePayment = Fixture["payments"][number];
type FixtureInvoice = Fixture["invoices"][number];

const searchCustomersBodySchema = z.object({
  query: z
    .object({
      filter: z
        .object({
          email_address: z
            .object({
              exact: z.string().optional(),
              fuzzy: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const searchOrdersBodySchema = z.object({
  location_ids: z.array(z.string()).optional(),
  query: z
    .object({
      filter: z
        .object({
          customer_filter: z
            .object({ customer_ids: z.array(z.string()).optional() })
            .optional(),
          state_filter: z
            .object({ states: z.array(z.string()).optional() })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  return_entries: z.boolean().optional(),
});

const searchCatalogItemsBodySchema = z.object({
  text_filter: z.string().optional(),
});

const batchRetrieveInventoryCountsBodySchema = z.object({
  catalog_object_ids: z.array(z.string()).optional(),
});

function money(amount: number, currency: string): Money {
  return { amount, currency };
}

export function loadFixture(): Fixture {
  // A static import keeps the fixture inside the bundle eve builds for
  // authored modules; a file read relative to import.meta.url does not survive it.
  return fixtureSchema.parse(fixtureJson);
}

function errorEnvelope(category: string, code: string, detail: string) {
  return { errors: [{ category, code, detail }] };
}

export function itemAt(fixture: Fixture, index: number): FixtureItem {
  const item = fixture.items[index];
  if (!item) {
    throw new Error(`Fixture item index ${String(index)} is out of range.`);
  }
  return item;
}

function orderForPayment(
  fixture: Fixture,
  payment: FixturePayment
): FixtureOrder {
  const order = fixture.orders.find(
    (candidate) => candidate.id === payment.orderId
  );
  if (!order) {
    throw new Error(
      `Fixture order ${payment.orderId} not found for payment ${payment.id}.`
    );
  }
  return order;
}

function orderForInvoice(
  fixture: Fixture,
  invoice: FixtureInvoice
): FixtureOrder {
  const order = fixture.orders.find(
    (candidate) => candidate.id === invoice.orderId
  );
  if (!order) {
    throw new Error(
      `Fixture order ${invoice.orderId} not found for invoice ${invoice.id}.`
    );
  }
  return order;
}

function catalogItemObject(fixture: Fixture, item: FixtureItem) {
  return {
    type: "ITEM",
    id: item.itemId,
    item_data: {
      name: item.name,
      category_id: item.categoryId,
      variations: [
        {
          type: "ITEM_VARIATION",
          id: item.variationId,
          item_variation_data: {
            item_id: item.itemId,
            name: item.name,
            price_money: money(item.priceCents, fixture.location.currency),
          },
        },
      ],
    },
  };
}

function catalogCategoryObject(category: { id: string; name: string }) {
  return {
    type: "CATEGORY",
    id: category.id,
    category_data: { name: category.name },
  };
}

function orderLineItem(fixture: Fixture, item: FixtureItem, quantity: number) {
  const total = item.priceCents * quantity;
  return {
    uid: `${item.variationId}-line`,
    name: item.name,
    quantity: String(quantity),
    catalog_object_id: item.variationId,
    variation_name: item.name,
    base_price_money: money(item.priceCents, fixture.location.currency),
    total_money: money(total, fixture.location.currency),
  };
}

export function orderTotal(fixture: Fixture, order: FixtureOrder) {
  return order.itemIndexes.reduce(
    (sum, index) => sum + itemAt(fixture, index).priceCents * order.quantity,
    0
  );
}

function orderObject(fixture: Fixture, order: FixtureOrder) {
  const lineItems = order.itemIndexes.map((index) =>
    orderLineItem(fixture, itemAt(fixture, index), order.quantity)
  );
  return {
    id: order.id,
    location_id: fixture.location.id,
    customer_id: order.customerId,
    state: order.state,
    line_items: lineItems,
    total_money: money(orderTotal(fixture, order), fixture.location.currency),
    created_at: order.createdAt,
    updated_at: order.createdAt,
  };
}

function paymentObject(fixture: Fixture, payment: FixturePayment) {
  const order = orderForPayment(fixture, payment);
  return {
    id: payment.id,
    created_at: payment.createdAt,
    updated_at: payment.createdAt,
    order_id: order.id,
    customer_id: order.customerId,
    location_id: fixture.location.id,
    status: "COMPLETED",
    source_type: "CARD",
    total_money: money(orderTotal(fixture, order), fixture.location.currency),
    amount_money: money(orderTotal(fixture, order), fixture.location.currency),
  };
}

function invoiceObject(fixture: Fixture, invoice: FixtureInvoice) {
  const order = orderForInvoice(fixture, invoice);
  const total = orderTotal(fixture, order);
  return {
    id: invoice.id,
    location_id: fixture.location.id,
    order_id: invoice.orderId,
    invoice_number: invoice.invoiceNumber,
    title: invoice.title,
    status: invoice.status,
    primary_recipient: { customer_id: invoice.customerId },
    payment_requests: [
      {
        uid: `${invoice.id}-request-0`,
        request_type: "BALANCE",
        due_date: invoice.dueDate,
        computed_amount_money: money(total, fixture.location.currency),
      },
    ],
    created_at: invoice.createdAt,
    updated_at: invoice.createdAt,
  };
}

function customerFullName(customer: FixtureCustomer) {
  return `${customer.given_name} ${customer.family_name}`.toLowerCase();
}

function sendJson<T>(res: ServerResponse, status: number, body: T): T {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
  return body;
}

async function readJsonBody<T>(
  req: IncomingMessage,
  schema: z.ZodType<T>
): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(String(chunk)));
    }
  }
  const text =
    chunks.length === 0 ? "{}" : Buffer.concat(chunks).toString("utf8");
  const raw: unknown = JSON.parse(text);
  return schema.parse(raw);
}

function handleLocations(fixture: Fixture, res: ServerResponse) {
  sendJson(res, 200, { locations: [fixture.location] });
}

function handleListCustomers(fixture: Fixture, url: URL, res: ServerResponse) {
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? Number(cursor) : 0;
  const page = fixture.customers.slice(start, start + CUSTOMERS_PAGE_SIZE);
  const nextStart = start + CUSTOMERS_PAGE_SIZE;
  if (nextStart < fixture.customers.length) {
    sendJson(res, 200, { customers: page, cursor: String(nextStart) });
    return;
  }
  sendJson(res, 200, { customers: page });
}

function handleSearchCustomers(
  fixture: Fixture,
  body: z.infer<typeof searchCustomersBodySchema>,
  res: ServerResponse
) {
  const emailFilter = body.query?.filter?.email_address;
  let matches = fixture.customers;
  if (emailFilter?.exact) {
    const exact = emailFilter.exact.toLowerCase();
    matches = matches.filter((c) => c.email_address.toLowerCase() === exact);
  } else if (emailFilter?.fuzzy) {
    const needle = emailFilter.fuzzy.toLowerCase();
    matches = matches.filter(
      (c) =>
        c.email_address.toLowerCase().includes(needle) ||
        customerFullName(c).includes(needle)
    );
  }
  sendJson(res, 200, { customers: matches });
}

function handleGetCustomer(fixture: Fixture, id: string, res: ServerResponse) {
  const customer = fixture.customers.find((c) => c.id === id);
  if (!customer) {
    sendJson(
      res,
      404,
      errorEnvelope(
        "INVALID_REQUEST_ERROR",
        "NOT_FOUND",
        `Customer ${id} not found.`
      )
    );
    return;
  }
  sendJson(res, 200, { customer });
}

function handleListCatalog(fixture: Fixture, url: URL, res: ServerResponse) {
  const types =
    url.searchParams
      .get("types")
      ?.split(",")
      .map((t) => t.trim()) ?? [];
  const wantsCategories = types.length === 0 || types.includes("CATEGORY");
  const wantsItems = types.length === 0 || types.includes("ITEM");
  const objects = [
    ...(wantsCategories ? fixture.categories.map(catalogCategoryObject) : []),
    ...(wantsItems
      ? fixture.items.map((item) => catalogItemObject(fixture, item))
      : []),
  ];
  sendJson(res, 200, { objects });
}

function handleSearchCatalogItems(
  fixture: Fixture,
  body: z.infer<typeof searchCatalogItemsBodySchema>,
  res: ServerResponse
) {
  const textFilter = body.text_filter?.toLowerCase() ?? "";
  const items = fixture.items
    .filter(
      (item) => !textFilter || item.name.toLowerCase().includes(textFilter)
    )
    .map((item) => catalogItemObject(fixture, item));
  sendJson(res, 200, { items });
}

function handleBatchRetrieveInventoryCounts(
  fixture: Fixture,
  body: z.infer<typeof batchRetrieveInventoryCountsBodySchema>,
  res: ServerResponse
) {
  const ids = body.catalog_object_ids ?? [];
  const items =
    ids.length === 0
      ? fixture.items
      : fixture.items.filter((i) => ids.includes(i.variationId));
  const counts = items.map((item) => ({
    catalog_object_id: item.variationId,
    catalog_object_type: "ITEM_VARIATION",
    state: "IN_STOCK",
    location_id: fixture.location.id,
    quantity: String(item.inventoryCount),
    calculated_at: fixture.location.created_at,
  }));
  sendJson(res, 200, { counts });
}

function handleSearchOrders(
  fixture: Fixture,
  body: z.infer<typeof searchOrdersBodySchema>,
  res: ServerResponse
) {
  const customerIds = body.query?.filter?.customer_filter?.customer_ids;
  const states = body.query?.filter?.state_filter?.states;
  let matches = fixture.orders;
  if (customerIds && customerIds.length > 0) {
    matches = matches.filter((o) => customerIds.includes(o.customerId));
  }
  if (states && states.length > 0) {
    matches = matches.filter((o) => states.includes(o.state));
  }
  const orders = matches.map((o) => orderObject(fixture, o));
  sendJson(res, 200, { orders });
}

function handleListPayments(fixture: Fixture, url: URL, res: ServerResponse) {
  const locationId = url.searchParams.get("location_id");
  const payments =
    locationId && locationId !== fixture.location.id
      ? []
      : fixture.payments.map((p) => paymentObject(fixture, p));
  sendJson(res, 200, { payments });
}

function handleListRefunds(res: ServerResponse) {
  sendJson(res, 200, { refunds: [] });
}

function handleListInvoices(fixture: Fixture, url: URL, res: ServerResponse) {
  const locationId = url.searchParams.get("location_id");
  const invoices =
    locationId && locationId !== fixture.location.id
      ? []
      : fixture.invoices.map((i) => invoiceObject(fixture, i));
  sendJson(res, 200, { invoices });
}

function forbiddenWrite(res: ServerResponse) {
  sendJson(
    res,
    403,
    errorEnvelope(
      "AUTHENTICATION_ERROR",
      "FORBIDDEN",
      "Write operations are not available in the eval fake."
    )
  );
}

async function route(
  fixture: Fixture,
  req: IncomingMessage,
  res: ServerResponse
) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;

  if (!path.startsWith("/v2/")) {
    sendJson(
      res,
      404,
      errorEnvelope("INVALID_REQUEST_ERROR", "BAD_REQUEST", "Not found.")
    );
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    sendJson(
      res,
      401,
      errorEnvelope(
        "AUTHENTICATION_ERROR",
        "UNAUTHORIZED",
        "Missing bearer token."
      )
    );
    return;
  }
  if (!req.headers["square-version"]) {
    sendJson(
      res,
      400,
      errorEnvelope(
        "INVALID_REQUEST_ERROR",
        "BAD_REQUEST",
        "Missing Square-Version header."
      )
    );
    return;
  }

  const method = req.method ?? "GET";

  if (method === "GET" && path === "/v2/locations") {
    handleLocations(fixture, res);
    return;
  }
  if (method === "GET" && path === "/v2/customers") {
    handleListCustomers(fixture, url, res);
    return;
  }
  if (method === "POST" && path === "/v2/customers/search") {
    handleSearchCustomers(
      fixture,
      await readJsonBody(req, searchCustomersBodySchema),
      res
    );
    return;
  }
  if (method === "GET" && path.startsWith("/v2/customers/")) {
    handleGetCustomer(fixture, path.slice("/v2/customers/".length), res);
    return;
  }
  if (method === "GET" && path === "/v2/catalog/list") {
    handleListCatalog(fixture, url, res);
    return;
  }
  if (method === "POST" && path === "/v2/catalog/search-catalog-items") {
    handleSearchCatalogItems(
      fixture,
      await readJsonBody(req, searchCatalogItemsBodySchema),
      res
    );
    return;
  }
  if (method === "POST" && path === "/v2/inventory/counts/batch-retrieve") {
    handleBatchRetrieveInventoryCounts(
      fixture,
      await readJsonBody(req, batchRetrieveInventoryCountsBodySchema),
      res
    );
    return;
  }
  if (method === "POST" && path === "/v2/orders/search") {
    handleSearchOrders(
      fixture,
      await readJsonBody(req, searchOrdersBodySchema),
      res
    );
    return;
  }
  if (method === "GET" && path === "/v2/payments") {
    handleListPayments(fixture, url, res);
    return;
  }
  if (method === "GET" && path === "/v2/refunds") {
    handleListRefunds(res);
    return;
  }
  if (method === "GET" && path === "/v2/invoices") {
    handleListInvoices(fixture, url, res);
    return;
  }

  forbiddenWrite(res);
}

export async function startFakeSquare(
  options: { port?: number } = {}
): Promise<{ url: string; close(): Promise<void> }> {
  const fixture = loadFixture();

  const server = createServer((req, res) => {
    route(fixture, req, res).catch((cause: unknown) => {
      sendJson(
        res,
        500,
        errorEnvelope("API_ERROR", "INTERNAL_SERVER_ERROR", String(cause))
      );
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, "127.0.0.1", resolve)
  );
  const address = server.address();
  // node:net's Socket#address() has no other runtime discriminant between
  // its AddressInfo and Unix-socket-path string shapes.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (!address || typeof address === "string") {
    throw new Error("Fake Square server failed to bind a loopback port.");
  }
  const url = `http://127.0.0.1:${String(address.port)}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((cause) => {
          if (cause) {
            reject(cause);
          } else {
            resolve();
          }
        });
      }),
  };
}

async function main() {
  const { url } = await startFakeSquare({});
  console.log(`Fake Square listening on ${url}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  void main();
}
