# Square eval gym

Thirteen scored cases grade the agent's Square replies against a deterministic
fake Square server, backed by `evals/square/fake/fixture.json`: correctness
(facts derived from the fixture, never hand-typed), tool discipline (no write
tool called), cost, and iMessage bubble shape.

```sh
pnpm eval:square --max-cost-usd 1
```

The wrapper (`scripts/eval-square.ts`, U5) starts the fake on a loopback port,
sets `SQUARE_BASE_URL`, `SQUARE_SANDBOX_ACCESS_TOKEN`, and
`SQUARE_ENVIRONMENT=sandbox`, runs `eve eval square`, and stops the fake on
exit.

The model call is paid, so `--max-cost-usd <USD>` is required and one attempt
is the default. Use `--repetitions <1-5>` only when a repeated measurement is
needed; the wrapper preserves every attempted run in its manifest and returns
failure if any attempt failed. It stops before a later repetition when reported
cost reaches the supplied ceiling, or when a provider leaves cost unknown. The
ceiling cannot preempt an in-flight call because there is no provider price
service and cost arrives after completion. Pass `--timeout <ms>` through to
Eve for the per-case bound.

To test a selected model without altering product defaults, run an isolated
database and seed only its workspace setting:

```sh
pnpm eval:square --with-database --max-cost-usd 1 --model openai/gpt-5.6-sol-fast
```

Each command writes `.eve/eval-runs/` provenance beside the existing Square
artifact. The manifest uses `step.started` model IDs as the actual selection
evidence; requested model, configured reasoning, and judge are configuration.
It also copies the fake fixture's pinned `clock.asOf` and `clock.timezone` into
the artifact, so relative-date cases can be reproduced against the same clock.
Reasoning application and delivery acknowledgement are
`not-observable-from-eve-events`, and unreported costs remain `unknown` rather
than being estimated.

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
with a deterministic two-record page by default or after a larger requested
limit (a client may receive fewer results than its limit). SearchOrders time
ranges are inclusive; local-day cases use the final millisecond before the next
day.
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
