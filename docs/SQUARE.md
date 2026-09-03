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

## Proposed: a POS gym

Goal: make Square replies useful for a seller, not just correct API calls.
Reply quality is not measured today; the driven turns above only prove that
the right tools ran.

The repository already has an eve eval harness (`evals/browser`, run with
`eve eval browser`). A `evals/square/` suite would reuse it:

- **Ground truth** comes from the seeded sandbox. The seed script should be
  committed under `evals/square/seed.ts` so the expected answers (customer
  names, order totals, stock counts, invoice balances) are known and
  regenerable. Sandbox accounts can be reset from the Developer Console.
- **Cases** are seller questions with expected facts, for example: "who owes
  me money" must name the invoice recipient and the balance; "what sold best
  this week" must name the top item by quantity; "do I need to reorder
  anything" must list items below a threshold. Each case asserts the tool
  set, key facts in the reply, and reply length, with an LLM judge for tone
  and usefulness.
- **Metrics** per run: correctness of facts, tool calls per answer, latency,
  and cost. The four driven turns cost 0.14 to 0.43 USD each with 2 to 5
  tool calls; those are the baseline to beat.

The gym should drive purpose-built capabilities, not only measure the raw
OpenAPI surface:

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

Two further directions, focused on Square first:

- **Owner-created skills.** A seller should be able to add a skill in their
  own words ("every Friday tell me which items to reorder"), and the agent
  should be able to create a skill natively from a conversation it handled
  well. eve skills are files under `agent/skills/` today (see
  `node_modules/eve/docs/skills.mdx`), so owner-created skills need a
  per-workspace store and a loader; that is a design question, not a file
  drop.
- **Proactive checks on a schedule.** A cron job that wakes up, reads the
  seller's Square data, and messages only when something needs attention
  (low stock, an overdue invoice, an unusual sales day). eve schedules exist
  (`node_modules/eve/docs/schedules.mdx`). Constraint from the eve connection
  docs: a scheduled run carries no end-user principal, so it cannot use a
  user-scoped Square grant directly. The run must be dispatched through a
  user-authenticated channel with an explicit user auth context, or the
  schedule must resolve the workspace owner and start the session as that
  user. This has to be settled before the first proactive check is built.

Other tools and integrations are deferred until the Square gym, skill, and
composite tools show measurable reply quality.

None of the gym, the skill, the composite tools, owner-created skills, or the
proactive schedule exists yet.
