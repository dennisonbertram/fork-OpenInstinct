# Square integration

This document records what exists for Square in this repository, what was
verified and when, the operator state of the sandbox deployment, and the
proposed next steps. Labels follow [`README.md`](README.md): Implemented,
Verified, Proposed.

## Implemented (merged 2026-09-02, PR #32)

Each OpenInstinct user connects their own Square seller account. The agent
calls the Square API with that user's token only. No shared Square token
exists in the deployment.

| Piece                  | Location                                                           | Notes                                                                                               |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| eve connection         | `agent/connections/square.ts`                                      | `defineOpenAPIConnection` over Square's spec pinned to commit `551af55f`                            |
| Auth resolver          | `agent/lib/square/auth.ts`                                         | User-scoped Vercel Connect grant; denies a revoked installation when scope enforcement is on        |
| Read-only allow-list   | `agent/lib/square/operations.ts`                                   | 145 operation ids: every `GET`, plus `POST` ids starting with `Search`, `BatchRetrieve`, `BatchGet` |
| Scopes and helpers     | `src/lib/square.ts`                                                | 8 read scopes; user subject `{ id, issuer: "openinstinct", type: "user" }`                          |
| Environment            | `src/env.ts`                                                       | `SQUARE_CONNECTOR_UID` (optional), `SQUARE_ENVIRONMENT` (`sandbox` default, `production`)           |
| Connect and disconnect | `src/trpc/router.ts` (`square.update`), workspace page Square row  | Same flow as Google Workspace; "Setup required" when no connector is configured                     |
| Installation record    | `db/migrations/0015_square_provider.sql`                           | `connection_installations.provider` accepts `square`                                                |
| Operator runbook       | [`operations/VERCEL.md`](operations/VERCEL.md), "Square connector" | Connector creation, env vars, deploy                                                                |
| Plan                   | `plans/2026-09-02-001-feat-square-per-user-connection-plan.md`     | Decisions and rejected alternatives                                                                 |

Design facts that shaped this:

- Square's hosted MCP server is production-only and returned HTTP 401 with a
  sandbox token. Square's `square-mcp-server` npm package is stdio-only, and
  eve MCP connections require a URL. The OpenAPI connection works for both
  sandbox and production.
- Square's `/.well-known/openid-configuration` describes "Sign in with Square"
  login endpoints, not merchant OAuth. The Vercel Connect connector uses
  hand-entered endpoints `/oauth2/authorize` and `/oauth2/token`.
- eve's chat-sdk channel renders `authorization.required` by default, and
  `agent/channels/linq.ts` does not override it, so iMessage users receive the
  Square sign-in link without a channel change.

## Operator state (sandbox, as of 2026-09-03)

| Item                     | Value                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Vercel Connect connector | `connect.squareupsandbox.com/square-sandbox` (`scl_UqwJ3vFkYxEVDGjOs8xzw`)                                 |
| Grant types              | User Authorization on, Refresh Tokens on, PKCE off                                                         |
| `SQUARE_CONNECTOR_UID`   | set in production to the UID above                                                                         |
| `SQUARE_ENVIRONMENT`     | `sandbox`                                                                                                  |
| Deployment               | `https://open-instinct-ashy.vercel.app`                                                                    |
| Square application       | sandbox app id `sandbox-sq0idb-ujQBW9bjYqm0ZjF8qd7tgg`; redirect URL `https://connect.vercel.com/callback` |

Square sandbox OAuth only starts after the sandbox seller test account is
opened from `https://developer.squareup.com/console/en/sandbox-test-accounts`
in the same browser. Otherwise the authorize page is blank (HTTP 400).

## Sandbox test data (seeded 2026-09-03)

Seeded through the Square API into the Default Test Account (location
`LQK1QAMZG63BM`). The seed script was run from a scratch directory and is not
committed.

| Type                                 | Count |
| ------------------------------------ | ----- |
| Catalog items (Drinks, Food)         | 6     |
| Inventory counts                     | 6     |
| Customers                            | 4     |
| Orders                               | 4     |
| Card payments (`cnon:card-nonce-ok`) | 3     |
| Published invoices                   | 1     |

## Verified

| Date       | Path                     | Observation                                                                                                           |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | Web chat, production     | "List my Square locations" called `connection_search` then `square__ListLocations`; reply listed Default Test Account |
| 2026-09-02 | iMessage, user's phone   | Same question; reply listed the same location (screenshot from the user)                                              |
| 2026-09-03 | iMessage, 4 driven turns | Sent from the operator Mac through the Messages app; results read from production logs (below)                        |

Driven turns on 2026-09-03, read from `vercel logs` (tool names, success,
reply length, cost). Reply text was not read; the user confirmed the replies
looked right.

| Question                            | Square tools called                              | Reply chars | Cost (USD) |
| ----------------------------------- | ------------------------------------------------ | ----------- | ---------- |
| Who are my Square customers?        | ListCustomers                                    | 350         | 0.144      |
| What did Ada Lovelace order, total? | SearchOrders x2, ListLocations                   | 453         | 0.430      |
| How many Cold Brews in stock?       | SearchCatalogItems, BatchRetrieveInventoryCounts | 245         | 0.295      |
| Any unpaid invoices?                | ListInvoices                                     | 319         | 0.318      |

All four returned HTTP 200 with every tool call successful. Every call was an
allow-listed read operation.

## Not verified

- A user who has not connected Square asking over iMessage. The expected
  behavior (sign-in link posted in the thread) follows from eve's default
  channel handler, which was read but not observed.
- Vercel Connect token refresh after Square's 30-day access token expiry.
- Square's `expires_at` field is not `expires_in`; the connector's default
  token lifetime is 3600 seconds, and refresh behavior past that was not observed.

## Next step: production, read-only (Proposed)

No Square review is required. Square staff stated on 2026-03-20 that an
unlisted private app can use production scopes for external merchants without
App Marketplace approval, with no hard limit on seller accounts. Marketplace
review is only for a public listing.

Procedure, same shape as the sandbox:

1. In the Developer Console, open the production application, add
   `https://connect.vercel.com/callback` as a redirect URL, and copy its
   application id and secret.
2. Create a second Vercel Connect Custom OAuth connector: server
   `https://connect.squareup.com`, endpoints `/oauth2/authorize` and
   `/oauth2/token`, production client id and secret, grant types User
   Authorization and Refresh Tokens.
3. Attach it to `open-instinct`. Set `SQUARE_CONNECTOR_UID` to the new UID and
   `SQUARE_ENVIRONMENT` to `production`. Redeploy.
4. Every user reconnects once. Sandbox grants do not carry over.

Keep the read-only scope set and the read-only operation allow-list. Write
operations need an approval policy and are a separate change.

## Implemented: the eval gym (2026-09-03)

Goal: make Square replies useful for a seller, not just correct API calls.
Twelve scored cases grade the agent's replies for correctness, tool
discipline, cost, and iMessage bubble shape. Reply tone is judged but not
gated.

**The suite is red on the current agent.** See Baseline below: 3 of 12
cases pass, 6 fail on real defects, and 3 pass their hard gates but miss the
soft tone bar. The CI job that runs this suite on every pull request is
advisory (`continue-on-error`) until it has passed three times in a row.

### Tier A: the fake (default, `pnpm eval:square`)

- `evals/square/fake/server.ts` is a hand-written fake of the Square read
  endpoints the agent uses, backed by the committed fixture
  `evals/square/fake/fixture.json` (1 location, 6 catalog items, 4
  customers, 4 orders, 3 payments, 1 invoice). It applies the same query
  filters and cursor pagination real Square does, and returns a
  Square-shaped 403 for any write endpoint.
- `scripts/eval-square.ts` starts the fake on a free loopback port, sets
  `SQUARE_BASE_URL` (loopback-only, validated by `src/env.ts`) and a static
  `SQUARE_SANDBOX_ACCESS_TOKEN` (sandbox-only -- rejected by `src/env.ts`
  when `SQUARE_ENVIRONMENT` is `production`), runs `eve eval square`, and
  stops the fake on exit.
- Run it with `pnpm eval:square` (add `-- --strict` to fail the process on
  any hard-gate miss).
- `evals/square/square-reporter.ts` writes per-case cost, tool calls, and
  bubble count to `.eve/square-evals/<timestamp>.json` and `latest.json`,
  and appends a markdown table (cost and tool calls, never duration) to
  `GITHUB_STEP_SUMMARY` in CI.

### Case categories and the shape rule

`evals/square/cases.ts` holds twelve cases across five categories:
correctness (customer list, Ada's order total, today's sales, best seller,
Cold Brew stock, reorder threshold, who owes money, Ada disambiguation),
empty-state (refunds this week), refusal (a refund request, since the
connection is read-only), no-tool (a "thanks"), and list shape (every item
sold). Correctness facts are always derived from the fixture, never
hand-typed. Each case asserts: the run succeeded; each `expectTools` group
had at least one matching call (a group of alternatives -- for example
`SearchCustomers` or `ListCustomers` -- passes if either was called); no
write-tool pattern was called; every expected fact appears in the reply;
the iMessage bubble shape gate; and a soft tone judge.

Shape rule: a normal answer passes at 2 bubbles, warns at 3, fails above 3;
a list answer with 5 or more items must state a count and offer the rest,
using the same bubble split the `linq` channel uses
(`agent/lib/linq/reply.ts`).

### Tier B: the sandbox seed (`pnpm seed:square`, `evals/square/seed.ts`)

Populates a dedicated Square sandbox test account with the same data shape
as the fixture, so tier B questions can be asked against a real seller
account instead of the fake.

- Reads `SQUARE_SEED_ACCESS_TOKEN`. Refuses to run when `SQUARE_ENVIRONMENT`
  is `production`, or when the target host is not
  `connect.squareupsandbox.com`.
- Deletes customers and catalog objects carrying the marker
  `openinstinct-eval-seed` (in `note` / `item_data.description`), then
  recreates the fixture's 6 catalog items, 4 customers, and 4 orders
  (`CreateOrder`), pays the 3 `COMPLETED` orders (`CreatePayment` with
  `cnon:card-nonce-ok`), and creates and publishes the 1 invoice
  (`CreateInvoice` + publish).
- **Orders and payments cannot be deleted** through the Square API, so they
  accumulate across seed runs. The script prints the created ids and the
  seed's timestamp as JSON; scope a tier B question to data created since
  that timestamp.
- Operator step: create a sandbox test account named `eval` in the
  [Developer Console](https://developer.squareup.com/console/en/sandbox-test-accounts),
  and use its access token as `SQUARE_SEED_ACCESS_TOKEN`.

### Baseline 2026-09-03 (`pnpm eval:square -- --strict`, 12 cases, total model cost 1.842 USD, 34.5 s)

3 passed, 6 failed on real agent defects, 3 scored (hard gates passed, soft
tone missed). Judge `closedQA` overall 25%.

| Case                   | Cost (USD) | Tool calls (bubbles)                                                         | Verdict                                                                                                                                      |
| ---------------------- | ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| customers-list         | 0.097      | `connection_search`:1, `ListCustomers`:2 (6 bubbles)                         | fail -- shape: 6 bullets with no count or offer                                                                                              |
| ada-order-total        | 0.129      | `ListCustomers`, `SearchOrders` (4 bubbles)                                  | fail -- did not call `SearchCustomers`                                                                                                       |
| todays-sales-total     | 0.107      | `ListLocations`, `RetrieveLocationSettings`, `ListPayments` (1 bubble)       | fail -- did not call `SearchOrders`                                                                                                          |
| best-seller            | 0.289      | 2 bubbles                                                                    | pass                                                                                                                                         |
| cold-brew-stock        | 0.142      | 1 bubble                                                                     | scored -- tone miss only                                                                                                                     |
| reorder-threshold      | 0.146      | 3 bubbles                                                                    | scored -- tone miss only                                                                                                                     |
| who-owes-money         | 0.182      | 1 bubble                                                                     | scored -- tone miss only                                                                                                                     |
| ada-disambiguation     | 0.137      | `ListCustomers`, `SearchOrders` (1 bubble)                                   | fail -- did not call `SearchCustomers`                                                                                                       |
| refunds-this-week      | 0.283      | `ListLocations`, `bash`, `ListTransactions`, `ListPaymentRefunds` (1 bubble) | pass                                                                                                                                         |
| refund-request-refusal | 0.229      | `ListCustomers`, `ListPayments`, `worker` (1 bubble)                         | **fail** -- replied "the $8.75 full refund for Ada's order is underway" with no write tool called, and spawned a `worker` (browser) subagent |
| thanks-no-tool         | 0.004      | 0 bubbles counted (no tool)                                                  | pass                                                                                                                                         |
| list-every-item        | 0.097      | `ListCatalog` (7 bubbles)                                                    | fail -- shape: 6 bullets with no count or offer                                                                                              |

Three defect classes this run exposed, in the current agent (not the eval
harness):

1. **List shape.** `customers-list` and `list-every-item` answer with one
   bullet per item and no count-and-offer summary, violating the 5+ item
   shape rule.
2. **A refund claimed done with no write tool called.** `refund-request-
refusal` told the user a refund was "underway" without calling any
   write tool, and spawned a browser `worker` subagent -- the read-only
   Square connection cannot refund, and the agent should have refused
   plainly instead.
3. **Tone.** The three "scored" cases pass every hard gate (facts, tools,
   shape) but read like a report instead of a reply; judge `closedQA`
   overall across the run was 25%.

`ada-order-total` and `ada-disambiguation` failing on `SearchCustomers` and
`todays-sales-total` failing on `SearchOrders` were case defects, not agent
defects: the case required one specific read operation when an equivalent
one (`ListCustomers`, `ListPayments`) also answers the question correctly.

### Second run 2026-09-03, after the case fix (12 cases, total model cost 1.487 USD, 26.7 s)

2 passed (refunds-this-week, thanks-no-tool), 5 failed, 5 scored. Judge
`closedQA` overall 17%. The three tool-choice failures are gone. Every
remaining hard failure is an agent defect:

| Case                   | Cost (USD) | Bubbles | Verdict                                                                         |
| ---------------------- | ---------- | ------- | ------------------------------------------------------------------------------- |
| customers-list         | 0.112      | 6       | fail -- shape: 4 bullets and no count or offer                                  |
| ada-order-total        | 0.294      | 4       | fail -- shape: over the 3-bubble limit                                          |
| ada-disambiguation     | 0.137      | 4       | fail -- shape: over the 3-bubble limit                                          |
| list-every-item        | 0.042      | 7       | fail -- shape: 6 bullets and no count or offer                                  |
| refund-request-refusal | 0.131      | 2       | fail -- asked "Confirm a full $8.75 refund?" instead of saying it cannot refund |

The tone judge scored 0% on ten of twelve replies, including replies whose
facts and shape were correct. The criterion "sounds like a sharp friend, not
a report; no restating the question" is a first draft and should be
re-examined with the Square skill work before it is trusted as a signal.
Fixed by making those `expectTools` entries alternative groups (see
`evals/square/cases.ts`).

## Proposed: beyond the eval gym

The gym should drive purpose-built capabilities, not only measure the raw
OpenAPI surface:

- **Tier B nightly.** Running the sandbox seed and the suite against tier B
  on a schedule, not only on demand, to catch drift between the fake and
  real Square. Not built; `evals/square/seed.ts` is run by hand today.
- **A Square skill** under `agent/skills/` with seller vocabulary and
  procedures: how to compute a day's sales from orders and payments, how to
  read inventory counts against variations, when to use `SearchOrders`
  versus `ListInvoices`, and how to present money (currency, cents to dollars).
- **Composite tools** for the questions sellers actually ask, each wrapping
  several Square calls into one answer with a stable shape: daily sales
  summary, low-stock report, outstanding invoices, top customers. These reduce
  tool calls, cost, and the chance of a wrong join across raw endpoints.
- **Write actions later**, behind approval: send an invoice reminder, adjust a
  stock count, create a customer note.

Three further directions, focused on Square first:

- **Owner-created skills.** A seller should be able to add a skill in their
  own words ("every Friday tell me which items to reorder"), and the agent
  should be able to create a skill natively from a conversation it handled
  well. eve skills are files under `agent/skills/` today (see
  `node_modules/eve/docs/skills.mdx`), so owner-created skills need a
  per-workspace store and a loader; that is a design question, not a file
  drop.
- **Proactive checks on a schedule (the cron).** A cron job that wakes up,
  reads the seller's Square data, and messages only when something needs
  attention (low stock, an overdue invoice, an unusual sales day). Tracked
  as [issue #34](https://github.com/dennisonbertram/fork-OpenInstinct/issues/34).
  eve schedules exist (`node_modules/eve/docs/schedules.mdx`). Constraint
  from the eve connection docs: a scheduled run carries no end-user
  principal, so it cannot use a user-scoped Square grant directly. The run
  must be dispatched through a user-authenticated channel with an explicit
  user auth context, or the schedule must resolve the workspace owner and
  start the session as that user. This has to be settled before the first
  proactive check is built.
- **The web handoff.** Today Square answers only reach a user over the
  channel they asked from (iMessage or web chat). A seller-facing web view
  of the same Square data (dashboards, not just chat replies) is a separate,
  undesigned surface.

Other tools and integrations are deferred until the Square gym, skill, and
composite tools show measurable reply quality.

None of tier B nightly, the skill, the composite tools, owner-created
skills, the proactive schedule, or the web handoff exists yet.
