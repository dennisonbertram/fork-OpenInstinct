# Square eval gym

Twelve scored cases grade the agent's Square replies against a deterministic
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
`.eve/square-evals/<timestamp>.json` and `latest.json`; CI appends a cost and
tool-call table to `GITHUB_STEP_SUMMARY`.

Where an `expectTools` entry requires one of several equivalent read
operations (for example `SearchCustomers` or `ListCustomers`), the case
declares a group -- `[["square__SearchCustomers", "square__ListCustomers"]]`
-- and passes if any tool in the group was called.

The suite is red on the current agent: 3 of 12 cases pass. See
[`docs/SQUARE.md`](../../docs/SQUARE.md) for the baseline table and the
defects it exposed.

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
