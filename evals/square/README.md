# Square eval gym

Twelve scored cases grade the agent's Square replies against a deterministic
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

The suite passes 12 of 12 with the Square skill (`agent/skills/square.md`).
See [`docs/SQUARE.md`](../../docs/SQUARE.md) for the red baseline runs, the
defects they exposed, and the green run.

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
