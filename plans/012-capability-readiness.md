# Plan 012: Report selected-route capability readiness from existing owners

GitHub: [#161](https://github.com/dennisonbertram/fork-OpenInstinct/issues/161).

> **Executor instructions:** Build a small read-only answer for one selected
> route, not a registry or account scan. It is advisory and must never replace
> authorization, scope, budget, origin/frame, idempotency, or approval checks in
> the executor. Use a topic worktree and normal PR; wait for required CI/review and merge when required checks are green. Paid/live/release actions need separate scope. Leave `plans/README.md` unchanged.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/agent.ts agent/tools agent/connections agent/lib src/env.ts db/services tests/agent evals/agent docs/agent-loop.html docs/JORY_AGENT_OPERATING_MODEL.md`
> STOP if Plan 011’s selected-route/task-revision API differs from this plan or
> if either chosen owner lacks a safe status read.

## Status

- **Priority:** P1
- **Effort:** M, approximately 1–2 engineering days
- **Risk:** MED
- **Depends on:** Plan 011
- **Category:** DX, tests
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

The root sees tool descriptors, but it often learns that a connection, browser
path, or vault prerequisite is unavailable only after choosing work. A compact
readiness result reduces avoidable worker launches and user questions while
keeping actual authorization at the owner. It must say what is safe to do next,
not expose account inventory or claim permission it cannot enforce.

## Current state

- Dynamic Eve capabilities are resolved from session/channel context:
  `node_modules/eve/docs/concepts/context-control.md:53-57`.
- Root retains `load_skill` and `connection_search`; Square is discovered
  through that path, not a global catalog: `docs/PLUGINS.md:98-112,161-165`.
- Browser execution is worker-only; `requireWorkerScope` and owned-browser
  checks remain authoritative: `docs/AGENT_GUIDE.md:100-124` and
  `agent/subagents/browser-agent/lib/access.ts:5-21`.
- `list_vault` returns safe metadata to the worker only:
  `agent/subagents/browser-agent/tools/list_vault.ts:6-20`.
- `db/services/connection-installations.ts:66-76` exposes scoped
  `findConnectionInstallation` metadata. Its active/revoked installation state
  is not proof that an OAuth grant remains valid; Square auth still owns that check.
- Current agent routing/ownership examples live in
  `evals/agent/routing.eval.ts`, `tests/agent/capabilities.test.ts`, and
  `tests/unit/agent-tool-boundaries.test.ts:20-117`.

## Commands you will need

| Purpose                   | Command                                                                                          | Expected result                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Focused checks            | `pnpm exec vitest run tests/agent/capabilities.test.ts tests/unit/agent-tool-boundaries.test.ts` | exit 0                                 |
| Deterministic route check | `pnpm eval:contract`                                                                             | exit 0                                 |
| Paid route judgement      | `pnpm eval:agent --tag routing`                                                                  | only with authorized credential/budget |
| Handoff                   | `pnpm check && pnpm build && git diff --check`                                                   | exit 0                                 |

## Scope

**In scope**

- Plan 011’s root projection, exactly two existing routes: browser preparation
  and Square. Use scoped `findConnectionInstallation` metadata only for
  installation presence/revocation; valid-grant readiness is `unknown` unless
  existing Square auth proves it without an OAuth call.
- New `agent/lib/capability-readiness.ts` and
  `agent/lib/tests/capability-readiness.test.ts`, registered only from
  `agent/agent.ts` when the selected route needs a root tool.
- Required diagram/canonical-doc wording after coordination.

**Out of scope**

- Enumerating all connectors/accounts, reading environment variables into model
  context, exposing IDs/tokens/vault metadata, account linking UI, new provider
  installs, a capabilities database, or executor authorization changes.

## Steps

### 1. Use two fixed safe owner reads and write RED cases

Before source edits, use the existing browser prerequisite owner and Square's
`findConnectionInstallation` metadata read. Return only `ready`,
`needs_authorization`, `needs_user_input`, `unsupported`, `unavailable`,
or `unknown`. Installation presence is not valid-grant readiness; report
`unknown` where OAuth-free proof is absent. Each result needs a safe reason,
source/observed time, and Plan 011 revision. RED cases must exercise the
current stale-readiness journey: a scoped installation is later revoked or the
route revision changes, while the old root path still treats its earlier result
as actionable.

**Verify:** the added journey assertion fails against the current behavior; no
provider call or credential is used.

### 2. Implement the narrow advisory projection

Resolve readiness only for the selected route, using server-derived scope and
existing owner reads. Return bounded safe text and a legal next action such as
“start worker,” “use existing authorization challenge,” or “ask for required
non-secret input.” Do not inspect every account. Expire/recheck time-sensitive
facts before an external action; execution still performs every native check.

**Verify:** tests show executor denial wins after state changes and no secret,
account identifier, or browser ID appears in the tool result.

### 3. Prove the root routes safely

Add deterministic routing assertions for ready, authorization-needed, and
unsupported outcomes. Preserve current public-research and browser delegation
routing. Update docs/agent-loop only where readiness becomes a modeled
lifecycle event, then inspect that diagram locally.

**Verify:** focused checks and `pnpm eval:contract` exit 0.

## Test plan and done criteria

- Positive: browser route and selected connector each return an accurate safe
  readiness state.
- Negative: wrong scope, revoked/absent authorization, unsupported route, and
  stale readiness cannot authorize an executor.
- Failure/recovery: surface only the owner’s legal next action; no automatic OAuth, account scan, provider retry, or new worker launch on unavailable state.
- Replay: the same revision may re-read readiness; a changed revision requires
  a fresh result.
- [ ] Focused RED was recorded before source edits; all named GREEN gates pass.
- [ ] `pnpm check`, `pnpm build`, and `git diff --check` pass.
- [ ] No live connector, Gmail, or browser action was used to validate this PR.

## STOP, rollback, and maintenance

STOP if the Square metadata cannot be safely scoped, if the path needs a broad
registry, or if readiness must query credentials/configuration directly. Mark
grant state unknown and keep existing tool-error behavior. Revert the readiness
projection without changing the underlying executor. Preflight cost is unknown
until measured; do not optimize or claim saved work in this PR.

## Independently executable prompt

“Implement Plan 012 only. Build selected-route readiness for browser and Square
using scoped installation metadata; distinguish installation presence from an
unproven valid grant. Capture the stale-readiness RED journey, run every named
check, and use normal worktree/PR/CI delivery. Do not start OAuth, scan
accounts, use paid/live services, or deploy without separate scope.”

## Required Square gate

If implementation changes agent/agent.ts or agent/instructions, pnpm eval:square
is required before handoff. Record its Results line; an unavailable paid budget
blocks that source PR and does not waive or complete this gate.
