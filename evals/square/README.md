# Square eval gym

Thirteen scored cases grade the agent's Square replies against a deterministic
fake Square server, backed by `evals/square/fake/fixture.json`: correctness
(facts derived from the fixture, never hand-typed), tool discipline (no write
tool called), cost, and iMessage bubble shape.

```sh
pnpm eval:square
```

The wrapper (`scripts/eval-square.ts`, U5) starts the fake on a loopback port,
sets `SQUARE_BASE_URL`, `SQUARE_SANDBOX_ACCESS_TOKEN`, and
`SQUARE_ENVIRONMENT=sandbox`, runs `eve eval square`, and stops the fake on
exit.

Cost is recorded per case and never fails a run; the shape gate does (over 3
bubbles, or a 5+ item list with no count and offer). Artifacts land in
`.eve/square-evals/<timestamp>.json` and `latest.json`; the on-demand GitHub
workflow (`square-evals.yml`) appends a cost and tool-call table to
`GITHUB_STEP_SUMMARY`.

Where an `expectTools` entry requires one of several equivalent read
operations (for example `SearchCustomers` or `ListCustomers`), the case
declares a group -- `[["square__SearchCustomers", "square__ListCustomers"]]`
-- and passes if any tool in the group was called.

The prior 12-case suite passed with the Square skill (`agent/skills/square.md`).
See [`docs/SQUARE.md`](../../docs/SQUARE.md) for its red baseline runs, the
defects they exposed, and the green run; the added time/location cases still
need their separately authorized paid evaluation.

## Fixture boundaries

The fake is deliberately narrow, not a Square emulator. Its fixture pins an
`asOf` clock of `2026-11-02T04:59:59.999Z` and `America/New_York` business
timezone; date-sensitive case prompts repeat those values so results do not
depend on the machine clock. It has two locations, completed/open/canceled
orders, completed refunds inside and outside the selected period, and boundary orders for both 2026 New York DST
transitions.

For the selected `SearchOrders` paths it supports `location_ids`,
`state_filter.states`, `date_time_filter.created_at`, and cursor pagination
with a deterministic two-record page by default. SearchOrders time ranges are
inclusive; local-day cases use the final millisecond before the next day.
`ListPayments` and `ListPaymentRefunds` support `location_id`, `begin_time`,
and `end_time` for the selected cases, comparing numeric `created_at` instants.
Unsupported Square filters and endpoints are not evidence of provider fidelity.

## Tier B: seeding the real sandbox

```sh
pnpm seed:square
```

`evals/square/seed.ts` reads `SQUARE_SEED_ACCESS_TOKEN`, refuses outside a
`connect.squareupsandbox.com` sandbox test account, deletes customers and
catalog objects marked `openinstinct-eval-seed`, and recreates the fixture's
data shape. Orders and payments cannot be deleted through the Square API, so
they accumulate across runs; the script prints the created ids and the seed
timestamp. See `docs/SQUARE.md` for the operator step (creating the `eval`
sandbox test account).

The seed path remains single-location and is not a live reproduction of the
date/location/refund fixture; live Square seeding is outside this fake-only
coverage slice.
