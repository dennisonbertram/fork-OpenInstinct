# Plan 014: Preserve partial progress and bound recovery effort

GitHub: [#163](https://github.com/dennisonbertram/fork-OpenInstinct/issues/163).

> **Executor instructions:** Consume Completion Plan 005's outcome envelope; do
> not create another worker-completion type or duplicate final delivery. The
> root may choose one bounded safe next step from trusted outcome evidence, but
> must never retry an uncertain write or re-deliver a final message automatically.
> Use a topic worktree, make one normal PR, wait for required CI/review, and
> merge only when the repository's required checks are green.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/lib agent/tools agent/instructions agent/subagents/browser-agent src/lib/worker-events.ts tests/agent tests/unit evals/agent docs/agent-loop.html docs/JORY_AGENT_OPERATING_MODEL.md`
> STOP if Completion Plan 005 has not exposed a compatible outcome/evidence
> envelope, or if any required recovery fact exists only in raw notification
> text.

## Status

- **Priority:** P1
- **Effort:** M, approximately 2–3 engineering days
- **Risk:** HIGH
- **Depends on:** Completion Plan 005 for typed outcome and durable
  task/cohort/obligation identity; Completion Plan 006 for report-selection/
  fallback binding; Plan 011 for the compact projection. Coordinate with the
  completion and delivery owners.
- **Category:** bug, DX, tests
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

A bare failure loses useful prepared work and makes the root guess whether it
may retry. It needs a small recovery projection: verified checkpoints, unknown
remainder, effort spent, and the single legal next step. A read retry can add
evidence; a write whose effect is uncertain cannot.

## Current state

- Completion is currently `success|failure`, message, and images in
  `src/lib/worker-completion.ts:6-35`; trace telemetry persists terminal
  status but does not define root recovery policy in
  `agent/subagents/browser-agent/hooks/trace-telemetry.ts:79-117`.
- Browser instructions permit one re-observation/correction for uncertain
  reversible preparation and forbid automatic resubmit after uncertain commit:
  `agent/subagents/browser-agent/instructions.md:28-31`.
- The commit boundary test proves uncertain navigation is redacted and not
  called a success: `tests/agent/subagents/browser-agent/tools/commit-browser-action.test.ts:246-285`.
- Final delivery blocks same-turn automatic resend:
  `agent/tools/messaging.ts:33-50` and
  `tests/agent/tools/messaging-completion.test.ts:65-115`.
- Eve can re-run an interrupted uncommitted tool; non-idempotent effects need
  idempotency/recording/approval:
  `node_modules/eve/docs/tools/overview.mdx:101-115`.

## Commands you will need

| Purpose           | Command                                                                                                                                                                                                                                                           | Expected result                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Recovery tests    | `pnpm exec vitest run tests/agent/subagents/browser-agent/tools/commit-browser-action.test.ts tests/agent/subagents/browser-agent/hooks/browser-trace-telemetry.test.ts tests/agent/tools/messaging-completion.test.ts agent/lib/tests/recovery-progress.test.ts` | exit 0                                            |
| Runtime contract  | `pnpm eval:contract`                                                                                                                                                                                                                                              | exit 0; model-free only                           |
| Optional judgment | `pnpm eval:agent --tag browser-agent`                                                                                                                                                                                                                             | run only with operator-approved credential/budget |
| Handoff           | `pnpm check && pnpm build && git diff --check`                                                                                                                                                                                                                    | exit 0                                            |

## Scope

**In scope**

- New `agent/lib/recovery-progress.ts` plus
  `agent/lib/tests/recovery-progress.test.ts`; root instructions/synthesis
  call sites that consume Plan 005 data; one focused root fixture test.
- Required `docs/agent-loop.html` and canonical-doc update after coordination.

**Out of scope**

- Replacing the completion outcome type, generic retry framework, provider/
  channel retry, scheduler changes, automatic final-message fallback, or a
  universal error taxonomy.

## Steps

### 1. Map Completion Plan 005 outcomes and write observable RED journeys

Map its actual bounded outcomes to only the root dispositions with two
consumers: verified success, blocked input, blocked approval, failed
precondition, transient read failure, permanent failure, and uncertain write.
Write a controlled root/worker fixture where current behavior drops partial
prepared evidence after a blocker, treats an uncertain write like a retryable
failure, or accepts an older revision's result. The test must observe existing
behavior, not merely fail because a new module is absent.

**Verify:** `pnpm exec vitest run agent/lib/tests/recovery-progress.test.ts`
fails against the pre-change implementation for the selected journey.

### 2. Add a bounded projection, not a second completion store

In `agent/lib/recovery-progress.ts`, derive task/revision-bound checkpoints,
remaining unknowns, last failure class, and finite effort count from Completion
Plan 005 records. Preserve only safe references/summaries. Permit one named
re-observation/read retry only where the outcome says a fresh read adds
evidence. Keep worker/browser state only where its existing contract is
resumable. An uncertain write sets stop/report and zero retry budget.

**Verify:** the new unit test turns green; a replay fixture proves counters and
checkpoints stay on the same task/revision and cannot cross to another task.

### 3. Route the report through the existing completion/delivery owner

Root synthesis must identify partial work, uncertainty, and exact user action.
It supplies the Completion Plan 006 report-selection/fallback path; it does
not call a provider, change final-delivery state, or add a resend branch.
Update instructions and the agent-loop diagram to show this bounded transition.

**Verify:** `pnpm exec vitest run tests/agent/tools/messaging-completion.test.ts agent/lib/tests/recovery-progress.test.ts`
passes and the fixture contains no second browser/message attempt after
`uncertain_write`.

## Test plan and done criteria

- Normal: verified completion closes recovery with one report obligation.
- Failure: input/approval blocker preserves checkpoint and parks/resumes only
  through existing mechanisms.
- Replay: one safe read retry; no loop; stale revision cannot update current
  task.
- Recovery: uncertain write stops and reports; automatic browser/provider/
  message retry count is zero.
- [ ] Record the RED output before source edits; all named tests,
      `pnpm eval:contract`, `pnpm check`, `pnpm build`, and
      `git diff --check` pass.
- [ ] Paid/browser/live checks are stated as run, blocked, or not requested.

## STOP, rollback, and maintenance

STOP if Plan 005 cannot distinguish read from write uncertainty, if recovery
needs a delivery-state change, or if it needs a new cross-session store outside
completion ownership. Revert only the recovery projection PR; leave completion
evidence and delivery state intact. Extend failure classes only after naming
two concrete consumers.

## Independently executable prompt

“Implement Plan 014 only. Read Completion Plans 005/006 first; derive recovery
from their typed task/outcome records rather than making another store. Capture
the named current RED journey before source edits, preserve all no-retry and
delivery boundaries, run each listed check, then open a normal PR and wait for
required CI/review. Do not use paid models, live browser/provider, Gmail, or
deployment without separate authorization.”

## Required Square gate

If implementation changes agent/instructions, pnpm eval:square is required
before handoff. Record its Results line; an unavailable paid budget blocks that
source PR and does not waive or complete this gate.
