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
