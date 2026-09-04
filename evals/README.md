# Agent evals

The eval tree has two intentionally separate tiers:

- `agent/` is the behavioral regression suite for the root coordinator. It
  covers conversation quality, tool routing, safety and approval boundaries,
  memory isolation, personal information, scheduled execution and reporting,
  and worker orchestration.
- `browser/` is the slower end-to-end browser benchmark. It exercises real
  sites and records benchmark-specific timing, cost, and completion artifacts.

Directories are the grouping and filtering boundary. Each `.eval.ts` file owns
one behavior family, and array cases within a file share the same setup without
hiding their individual descriptions in the runner output.

## Running the suites

List every discovered case without making model calls:

```sh
pnpm eval:list
```

Run the root-agent suite locally, including soft judge thresholds as failures:

```sh
pnpm eval:agent --max-cost-usd 1 --estimated-cost-usd 1
```

Run one family while iterating:

```sh
pnpm eval:agent --max-cost-usd 1 --estimated-cost-usd 1 --tag safety
pnpm eval:agent --max-cost-usd 1 --estimated-cost-usd 1 --tag routing
```

Produce JUnit output for CI:

```sh
pnpm eval:ci --max-cost-usd 1 --estimated-cost-usd 1
```

The agent command loads `.env.local`, starts an isolated Docker Compose
PostgreSQL service, runs migrations, executes the suite, and then stops the
service. It requires `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; the behavior
suite forces an unusable Kernel placeholder because browser work belongs in the
separate benchmark. Its Kernel and application callback origins are pinned to an
unreachable loopback address so worker-routing evals cannot reach the external
browser service and background callbacks cannot escape the isolated target.
Agent cases run serially so memory cases cannot leak state into a concurrently
executing case, and memory cases remove their canaries.
Judge-backed cases use the judge model in `evals.config.ts`. Full
event streams and assertion details are written to `.eve/evals/`.

## Paid-run manifest and limits

Real-model supervisors require explicit `--max-cost-usd <USD>` and caller-supplied
`--estimated-cost-usd <USD>` values before they
start. The estimate is reserved before any eval child starts; it is an
operator-approved preflight bound for the attempt series, not a provider
price lookup or enforceable provider billing cap. No price service is
consulted. One attempt is the
default; `--repetitions <1-5>` is opt-in. Each attempt reserves the supplied
all-in estimate before launch; a known actor overshoot replaces that attempt's
reservation conservatively. The supervisor stops before another one when the
next reservation exceeds the ceiling or an actor attempt is incomplete or
unaccountable. Unobservable judge billing leaves the total labeled `unknown`,
but does not by itself prevent an explicitly reserved repetition. A single
attempt can still exceed the supplied value because providers report cost only
after a call completes.

Each supervisor writes `.eve/eval-runs/<timestamp>-<mode>-<id>.json` before it
starts work. The manifest records exact Git SHA/dirty state, Node, Eve, and
lockfile identity, a content hash and paths for the case tree, fixture clock
context when present, wall-clock mode, requested filters/model, configured
reasoning/judge, effective timeout/concurrency, reserved estimate, all
attempts, verdict counts, and per-case observed `step.started` model IDs.
The `aggregate` block retains pass/fail/error/skip counts from every attempt
and p50/p95 whole-eval duration; it never filters failed repetitions out of a
successful-looking summary.
Observed actor model IDs are the evidence of the concrete model actually selected;
the requested setting is retained only as configuration. Eve 0.49 does not
emit applied reasoning effort or message-channel delivery acknowledgement in
eval events, so those fields are explicitly `not-observable-from-eve-events`
rather than guessed. Costs retain known partial actor spend but mark the total
`unknown` for an incomplete step or a judge call, whose spend Eve does not
report.

Use the normal workspace model resolver without changing product defaults:

```sh
pnpm eval:agent --max-cost-usd 1 --estimated-cost-usd 1 --model openai/gpt-5.6-sol-fast --tag smoke
```

The selected model is written only to the isolated Compose workspace through
the existing settings service. Review the manifest's observed IDs after the
run; a requested model name alone is not proof of provider selection.

For a one-off hosted reproduction, manually dispatch `square-evals.yml` with
the `agent-smoke` target. It executes exactly the selected-model command above
with one 1 USD estimated reservation and one repetition; the `square` target
remains the default and is mutually exclusive, so a dispatch cannot launch
both paid commands. The workflow artifact is named `paid-eval-<target>` and
retains `.eve/evals/` plus `.eve/eval-runs/`; the estimate ceiling is not a
provider billing cap.

Run the browser benchmark separately because it uses Kernel, real websites,
and a longer completion loop:

```sh
pnpm bench:browser
```

See `browser/README.md` for benchmark suites, repetitions, A/B runs, and its
dashboard.

## What should be a gate

Use deterministic gates for observable contracts: the selected tool, a pending
approval, an absent secret canary, a required delivery, or a worker boundary.
Use the judge only for qualities that cannot be expressed safely as an exact
match, such as decisiveness, concise wording, or whether a free-form answer
actually satisfies the request. Judge thresholds are soft in Eve, so run this
suite with `--strict` when regressions should fail the command.

When a production failure appears, add the smallest sanitized reproduction to
the owning family. Add a new family only when it represents a genuinely new
contract. Avoid examples that can send, purchase, delete, or otherwise mutate
external state; approval evals should stop while the action is still pending.
