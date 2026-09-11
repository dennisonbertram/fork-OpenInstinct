# Plan 010: Deliver the agent operating-model epic through six bounded PRs

GitHub: [#153](https://github.com/dennisonbertram/fork-OpenInstinct/issues/153).

> **Executor instructions:** This is an epic plan, not authorization to implement all
> slices at once. Read the selected child plan in full, use a dedicated worktree,
> and leave `plans/README.md` alone; the planning lead owns the index. Default
> delivery is one PR with its focused checks. Do not run live browser, paid-model,
> Gmail, provider-send, or deployment without separate scope. Normal worktree,
> PR, and CI actions are expected.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent src db docs evals tests package.json`
> Compare the excerpts in the chosen child plan to current source. If a named
> owner or lifecycle seam changed, stop and ask the plan owner to rebase it.

## Status

- **Priority:** P1
- **Effort:** L, approximately 12–20 engineering days across the six PRs; each
  estimate excludes paid-model and live-provider gates.
- **Risk:** MED
- **Depends on:** none. This is an umbrella; each child owns its own explicit
  prerequisite and can proceed when that prerequisite is available.
- **Category:** direction, DX, tests
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

The root already has scoped identity, dynamic Eve capabilities, a protected
browser worker, approvals, traces, memory, and delivery guards. It lacks a
small shared representation of the current objective, relevant constraints,
facts, readiness, and bounded recovery. The result is avoidable model
bookkeeping and ambiguous handoffs, not a mandate for a new runtime or generic
orchestration service.

The operating-model hierarchy is: verified scope/policy → objective and
revision → source-tagged observations/readiness → permitted action and
preconditions → verification/recovery → report obligation/delivery → reviewed
procedure. Lower layers constrain higher layers. A model interpretation, user
chat text, or retrieved page content never becomes authority, approval, or
trusted fact by itself.

## Verified starting points

- Root model selection derives scope from Eve session auth in
  `agent/agent.ts:24-67`; worker access verifies both worker and root
  ownership in `agent/subagents/browser-agent/lib/access.ts:5-21`.
- Eve `defineState` is durable per session but never crosses a subagent
  boundary: `node_modules/eve/docs/concepts/state.md:6-19,66-80`.
- The worker receives a bounded assignment but currently returns only
  `status/message/images`: `agent/subagents/browser-agent/agent.ts:11-24`
  and `src/lib/worker-completion.ts:4-35`.
- Final delivery already has its own exact turn/call state:
  `agent/lib/message-delivery.ts:3-72`. This epic consumes that interface;
  it does not replace, retry, or generalize it.
- Existing test layers are focused Vitest, `pnpm eval:contract`,
  `pnpm eval:agent`, then browser/live gates; see
  `docs/AGENT_GUIDE.md:147-212` and `evals/README.md:1-62`.

## PR sequence

| Plan | One PR outcome                                                       | Depends on                                                         | Approx. effort and risk |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| 011  | Root situation view projected from Plan 005 task/obligation identity | Completion Plans 005/006                                           | 2–3 days, MED           |
| 012  | Selected-route readiness for browser plus one existing connector     | 011                                                                | 1–2 days, MED           |
| 013  | Truthful unsupported browser-control recovery; no arbitrary clicks   | none; coordinate 014 interface                                     | 1–2 days, MED           |
| 014  | Bounded recovery counters and partial-progress preservation          | completion outcome envelope + 011                                  | 2–3 days, HIGH          |
| 015  | Reviewed improvement loop around one current procedure               | none                                                               | 1–2 days, LOW           |
| 016  | Matched whole-task measurement added to existing eval paths          | any landed candidate with a frozen baseline; does not wait for all | 2–3 days, MED           |

## Shared scope and exclusions

Every child plan may update its owned implementation/tests plus
`docs/agent-loop.html` and the Luna-owned
`docs/JORY_AGENT_OPERATING_MODEL.md` **only after coordinating with that
document owner**. It must inspect any changed diagram in a browser as required
by `AGENTS.md`.

No child plan may add a central task manager, global capability registry, new
MCP server, scheduler, memory provider, model-written policy, broad browser
click API, or delivery retry loop. User/model text may describe constraints but
is not executable approval authority; executor policy and Eve native approval
remain decisive.

## Existing commands and evidence levels

| Purpose            | Command                                         | Expected result / limit                                                |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Focused unit tests | `pnpm exec vitest run <named test files>`       | exit 0; mocked/deterministic evidence only                             |
| Contract runtime   | `pnpm eval:contract`                            | exit 0; no paid model/provider delivery proof                          |
| Root behavior      | `pnpm eval:agent --tag <tag>`                   | requires configured model credential; do not run without scoped budget |
| Repository gate    | `pnpm check && pnpm build && git diff --check`  | exit 0 before handoff                                                  |
| Browser/UI path    | `pnpm test:e2e` or the targeted documented path | required only for affected rendered UI; inspect local result           |

## Acceptance and stop conditions

The epic is not “done” merely because six PRs merge. Each slice must show its
focused RED before implementation, GREEN checks, and a clear statement of
which claims remain unproved. Whole-task efficiency is only comparable for
the same task, verified result, and final delivery criterion; unknown costs
stay unknown.

For Plans 011, 012, and 014, stop if Completion Plan 005's stable identity or
Plan 006's report binding is absent or changes. Plans 013 and 015 have no
completion prerequisite; Plan 016 may run after any landed candidate has an
identical frozen baseline. Every child still stops if an owner needs a
persistence/migration surface outside its scope, a change would alter delivery
state, or testing needs unapproved live credentials/side effects. Roll back a
slice by reverting only its PR; state/schema changes must use an additive,
compatibility-preserving retirement path approved by their owner.

## Independently executable prompt

“Implement only Plan 0NN from `plans/`. Start with its drift check and RED
test. Keep all stated boundaries, do not touch another plan’s owner files
without coordination, run each named deterministic check, and stop on any STOP
condition. Open a normal PR only after the plan’s full gates are green; do not
send messages, connect accounts, deploy, or claim live proof.”
