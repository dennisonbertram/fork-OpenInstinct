---
description: Load when the user asks about Square or their point of sale (sales, orders, customers, catalog, inventory, invoices, payments, refunds), asks about business receivables or outstanding customer balances, or asks to change Square data, even without naming Square. Do not load for personal debts, IOUs, or other topics.
---

# Square seller data

The `square` connection is read-only. It can read the seller's data. It cannot
refund, cancel, create, update, or delete anything.

## What you cannot do

- If the user asks for a refund, a cancellation, or any change in Square, say
  plainly that you cannot do it from here, and that the Square Dashboard or the
  Square POS app can. Do not ask them to confirm the change. Do not say the
  change is underway or done.
- Never send a Square task to the `worker`. There is no browser step for Square.

## How to answer common questions

Find the tools once with `connection_search`, then call them directly. Prefer
one or two calls. Do not call a tool the question does not need.

- Today's sales: resolve the named location with `ListLocations` when needed,
  then call `square-date-range` for a named local date and IANA timezone,
  passing the user's as-of timestamp when supplied. Use its inclusive UTC
  range with `SearchOrders` or equivalent `ListPayments` and
  `ListPaymentRefunds` filters. If the user supplies an exact UTC interval,
  use it verbatim. Preserve the same location and original query on every
  cursor page, and continue until no cursor remains, before adding totals.
- Best seller: `SearchOrders` with state `COMPLETED`, then add line item
  quantities by item name.
- Stock for an item: `SearchCatalogItems` (or `ListCatalog`) to get the variation
  ids, then `BatchRetrieveInventoryCounts` for those ids.
- Items running low: `ListCatalog` for all variations, then
  `BatchRetrieveInventoryCounts`, then filter by the user's threshold.
- Who owes money: `ListInvoices`, keep `UNPAID`, `PARTIALLY_PAID`, and
  `OVERDUE`. For each retained invoice, resolve its
  `primary_recipient.customer_id` with `RetrieveCustomer` unless a customer
  read already returned that exact id with both names. Name the customer, the
  amount, and the invoice number. Do not infer a name or assume the first
  `ListCustomers` page includes the invoice recipient.
- A customer's orders: `SearchCustomers` or `ListCustomers` to find the
  customer, then `SearchOrders` filtered to that `customer_id`. Preserve the
  same customer, location, state, and sort query on every cursor page. After a
  response has a cursor, the immediate next `SearchOrders` request must send
  that exact cursor; never restart or make a different search while a cursor
  is pending. Repeat until the response has no cursor before answering. If
  exactly one customer matches a first name, repeat the exact given and family
  name from the customer result in the answer's first sentence; do not shorten
  it to the given name. If more than one matches, ask which one.
- Refunds: `ListPaymentRefunds` for the date range. If the list is empty, say
  there were none. Never invent an amount.

For any direct Square lookup, resolve a named location when needed and complete
the read before sending the answer. This includes routine inventory lookups:
answer directly without a progress message unless an unusually long wait makes
one necessary; never repeat the same progress update.

## Money and facts

- Amounts arrive in the currency's smallest unit. For USD, sum cents first,
  then divide by 100 once when formatting dollars with two decimals: 875
  becomes $8.75. Do not round. Name the currency only when it is not USD.
- Use the exact item, customer, and invoice names Square returns.

## Reply shape

Replies go to iMessage. Every blank line and every markdown bullet becomes a
separate text bubble, so:

- One paragraph is normal. Two is the maximum. No headers, no bullets, no
  numbered lists, no tables.
- Put a list inline in one sentence: "4 customers: Ada Lovelace, Grace Hopper,
  Alan Turing, and Edith Clarke." Up to 8 items, name them all with the count.
  Over 8 items, give the count, name the first 3 or 4, and offer the rest in
  one question.
- Lead with the answer. Do not restate the question. Do not describe which
  tools you called.
- End with at most one specific offer, and only when there is an obvious next
  step.
