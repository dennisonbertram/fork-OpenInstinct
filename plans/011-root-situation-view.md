# Plan 011: Project a compact situation view from completion-owned task records

GitHub: [#160](https://github.com/dennisonbertram/fork-OpenInstinct/issues/160).

> **Executor instructions:** Build a read-only root projection of trusted records,
> not a task manager, cross-session database, or second work store. Completion
> Plan 005 owns per-task/cohort/obligation identity and minimal objective
> revision; Plan 006 owns report-delivery binding. Read their landed APIs first.
> Use a topic worktree and normal PR; run required CI/review and merge only when
> required checks are green. Do not use paid models, live providers, Gmail, or
> deployment without separately scoped authorization.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/agent.ts agent/lib agent/tools agent/instructions src/lib/worker-completion.ts tests/agent tests/unit evals/agent docs/agent-loop.html docs/JORY_AGENT_OPERATING_MODEL.md`
> STOP if Completion Plan 005 has not published a stable multi-task identity/
> objective-revision API, Plan 006 binding differs, or the excerpts below drift.

## Status

- **Priority:** P1
- **Effort:** M, approximately 2–3 engineering days
- **Risk:** MED
- **Depends on:** Completion Plans 005 and 006; coordinate with their owners
  and the current owner of `docs/JORY_AGENT_OPERATING_MODEL.md`.
- **Category:** DX, tests
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

Root instructions say to preserve constraints and treat new user input as
steering, but current facts are spread across history and owner records. A
short projection lets root and worker see current outcome, revision, relevant
constraints, observations, pending input, and report obligation without
reconstructing bookkeeping. It guides a plan; it never authorizes an action.

## Current state

- `agent/instructions/content/role/interactive.md:24-45,66-71` preserves
  constraints and coordinates steering but has no situation projection.
- `src/lib/worker-completion.ts:6-35` currently has only status/message/images;
  Plan 005 will own its compatible extension and durable obligation records.
- `agent/lib/message-delivery.ts:3-72` owns call/turn delivery state and is
  not task identity.
- Eve state is session-durable and child-isolated:
  `node_modules/eve/docs/concepts/state.md:47-80`; it must not duplicate
  Plan 005's multi-task durable records.
- `tests/unit/agent-tool-boundaries.test.ts:190-213` protects structured
  initial/resumed worker output.

## Commands you will need

| Purpose           | Command                                                                                                                                                                          | Expected result                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Projection units  | `pnpm exec vitest run tests/unit/agent-tool-boundaries.test.ts tests/unit/worker-input-bubbling.test.ts tests/agent/capabilities.test.ts agent/lib/tests/situation-view.test.ts` | exit 0                               |
| Runtime contract  | `pnpm eval:contract`                                                                                                                                                             | exit 0; model-free wiring only       |
| Optional behavior | `pnpm eval:agent --tag browser-agent`                                                                                                                                            | only with operator credential/budget |
| Handoff           | `pnpm check && pnpm build && git diff --check`                                                                                                                                   | exit 0                               |

## Scope

**In scope**

- New `agent/lib/situation-view.ts` and
  `agent/lib/tests/situation-view.test.ts`. The only permitted root
  integration is `agent/agent.ts`; change
  `agent/instructions/content/role/interactive.md` only when the landed
  Completion Plan 005/006 lifecycle seam requires rendered wording.
- A narrow existing `evals/agent/browser-agent.eval.ts` assertion if the
  fixture can exercise the projection without a model change.
- `docs/agent-loop.html` and the canonical document after coordination.

**Out of scope**

- New database/state store, completion schema changes, capability discovery,
  worker outcome ownership, channel/delivery change, UI projection, or generic
  task fields.

## Steps

### 1. Bind the source records and create a controlled RED journey

Record in the PR the exact Plan 005 task/cohort/obligation IDs, objective/source
IDs, revision, and Plan 006 report binding. Add a fixture representing an
existing stale steering journey: an older worker result follows a newer
objective revision and current root behavior has no bounded way to select the
correct record. Assert the projected current task uses the newer source/revision
and retains an unrelated task. Also assert user/model text cannot set approval.

**Verify:** `pnpm exec vitest run agent/lib/tests/situation-view.test.ts`
fails against pre-change behavior for stale-result/current-revision selection,
not for a missing import.

### 2. Implement one bounded projection

Create `agent/lib/situation-view.ts` that reads Plan 005 records and Plan 006
binding. It may use only a non-authoritative turn-local memo if needed. Render
bounded fields: trusted IDs/revision, objective summary, constraints tagged
user/policy/inferred, safe evidence references, pending input, selected route,
and report-obligation reference. No lifecycle mutation, free-form worker parse,
secret, raw page text, or independent identity is allowed. Pass only relevant
revision/constraints to the worker.

**Verify:** the controlled test turns green; unrelated/stale records remain
visible only as non-current evidence.

### 3. Document and verify the lifecycle

Document the source-of-truth boundary and revision handoff in the agent-loop
diagram and canonical doc. Inspect the edited diagram in a local browser after
automated checks; record that inspection separately from deterministic proof.

**Verify:** all commands above pass; no console error in the inspected diagram.

## Test plan and done criteria

- Normal: current direct constraint reaches the assigned worker.
- Failure: missing Plan 005 record renders unknown/actionable developer state,
  never a guessed objective.
- Replay: managed replay selects the same task/revision; stale result cannot
  render as current.
- Recovery: new steering preserves unrelated task records.
- [ ] RED output is saved before source edits; every named test,
      `pnpm eval:contract`, `pnpm check`, `pnpm build`, and diff check pass.
- [ ] Paid/live result is clearly run, blocked, or not requested.

## STOP, rollback, and maintenance

STOP if Plan 005 cannot safely identify multiple obligations, if source records
are unavailable at the root lifecycle seam, or if this requires persistence/
delivery changes. Revert the projection PR only; never delete or replace
completion-owned records. Add fields only when a named existing owner supplies
them.

## Independently executable prompt

“Implement Plan 011 only. Read Completion Plans 005/006 first and derive a
bounded root situation view from their records. Capture the stated stale-steering
RED journey before source edits, add only the named module/test, preserve all
approval and delivery boundaries, run the listed gates, then use the normal
worktree/PR/CI workflow. Do not run paid/live/release actions without scope.”

## Required Square gate

If implementation changes agent/agent.ts or agent/instructions, pnpm eval:square
is required before handoff. Record its Results line; an unavailable paid budget
blocks that source PR and does not waive or complete this gate.

## Exact integration files

The only root registration file permitted is agent/agent.ts, and the only
instruction file permitted is agent/instructions/content/role/interactive.md.
Modify either only when the landed Completion Plan 005/006 lifecycle seam
requires it; otherwise leave both unchanged.
