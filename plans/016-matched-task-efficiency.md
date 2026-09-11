# Plan 016: Measure matched whole-task efficiency in existing eval paths

GitHub: [#165](https://github.com/dennisonbertram/fork-OpenInstinct/issues/165).

> **Executor instructions:** Add only metrics required to compare a matched
> requested task through existing runners. Do not create a new benchmark,
> reporter, dashboard, global budget, or performance claim. A lower cost or
> duration is not an improvement unless task success, verification, and
> delivery criterion are equivalent. Use a topic worktree and normal PR, wait
> for required CI/review, and merge when required checks are green. Do not edit
> `plans/README.md`.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- src/lib/worker-events.ts src/lib/tests/worker-events.test.ts evals/browser/benchmark-reporter.ts evals/browser/benchmark-schema.ts evals/agent/conversation.eval.ts docs/evaluation/README.md`
> STOP if current active PR ownership already supplies the same metric, or if a
> baseline uses mismatched model, fixture, task, verification, or delivery
> criteria.

## Status

- **Priority:** P2
- **Effort:** M, approximately 2–3 engineering days
- **Risk:** MED
- **Depends on:** no need to wait for every 011–015 slice; coordinate with
  active PR #138 lightweight-path, PR #120 provenance, and PR #136 conversation
  work before editing shared eval/reporter files.
- **Category:** perf, tests, direction
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

The proposed situation and recovery improvements should be judged by useful
whole-task completion, not by fewer prompt tokens or a faster isolated tool
call. The repository already measures worker event steps/tokens/cost/duration
and has separate contract, paid root-agent, browser, and live-provider layers.
This plan adds a small matched record to those owners while preserving what
each layer can and cannot prove.

## Current state

- `src/lib/worker-events.ts:23-84` derives model steps, optional
  input/output tokens, optional cost completeness/cost, and duration from
  worker events.
- Browser benchmark schemas already model `costComplete`, `costUsd`, and
  `durationMs`: `evals/browser/benchmark-schema.ts:1-40`.
- `evals/README.md:1-62` separates paid root-agent evals from slower
  end-to-end browser benchmarks and documents their credentials/limits.
- Eve evals run real session HTTP surfaces but deterministic fixtures do not
  establish real-model judgment or recipient delivery:
  `node_modules/eve/docs/evals/overview.mdx:6-8,61-97,114-144`.
- The evaluation specification explicitly labels baseline cost/latency and
  judge agreement TBD: `docs/evaluation/README.md:1-7,66-71`.
- PR #138 is a coordination dependency, not a source citation in this plan.
  Before editing shared measurement code, inspect its commit/diff and record the
  exact provenance, task fixture, and result; if it owns the metric, stop.

## Commands you will need

| Purpose                   | Command                                                    | Expected result                                                       |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| List without model calls  | `pnpm eval:list`                                           | exits 0 and lists cases                                               |
| Focused measurement tests | `pnpm exec vitest run src/lib/tests/worker-events.test.ts` | exit 0; add this new owner-local test only if instrumentation changes |
| Deterministic contract    | `pnpm eval:contract`                                       | exit 0; no paid/live proof                                            |
| Paid root behavior        | `pnpm eval:agent --tag conversation`                       | only with explicit operator credential/budget                         |
| Browser benchmark         | `pnpm bench:browser`                                       | only with explicit local Kernel/site authorization                    |
| Handoff                   | `pnpm check && pnpm build && git diff --check`             | exit 0                                                                |

## Scope

**In scope**

- `src/lib/worker-events.ts`, new
  `src/lib/tests/worker-events.test.ts`,
  `evals/browser/benchmark-reporter.ts`,
  `evals/browser/benchmark-schema.ts`, one selected
  `evals/agent/conversation.eval.ts` scenario, and
  `docs/evaluation/README.md` only when its field definitions change.
- No UI/dashboard unless an already-owned displayed result must render a new
  required schema field.

**Out of scope**

- New test runner, paid budget amount, model upgrade, global budget enforcement,
  synthetic performance win, benchmark website change, live provider send, or
  merge/import of active PRs.

## Steps

### 1. Reconcile active owners and record the baseline contract

Before code, inspect the actual commits/diffs for PR #138/#120/#136 and record
commit provenance in the PR. Choose the existing `conversation`-tagged scenario
in `evals/agent/conversation.eval.ts` and freeze its prompt, fixture/environment,
model/version, requested goal, verification rule, delivery criterion, and
reporting window before collecting either trial. The deterministic recorder
check is exactly three baseline/candidate pairs, alternating order by pair;
record all six attempts even when a field is unknown. Paid or browser trials
need separate scope and use the same paired protocol; without it, record no
comparison or performance result. Never compare result subsets.

**Verify:** `pnpm eval:list` identifies the exact existing family; the PR
description cites the inspected commit and names why no active reporter metric is duplicated.

### 2. Write RED matched-record assertions in the owner test file

In the new exact owner test `src/lib/tests/worker-events.test.ts`, add
deterministic assertions that one compact record contains: task/case
identifier; requested-goal result; verification state; final delivery state
where that layer can observe it; constraint/recovery/duplicate counts; model
steps/tokens/cost completeness/cost; duration; and explicit `null/unknown`
rather than fabricated values. RED must fail for omitted outcome or a metric
from a different task.

**Verify:** the focused worker-events test fails before instrumentation changes.

### 3. Instrument only the existing owner

Extend `measureWorkerTask` in `src/lib/worker-events.ts` and, only if
that owner cannot represent a browser field, the named browser reporter/schema
files without creating a parallel telemetry stream. Keep workspace budgets authoritative in
their existing services; runtime measurement only informs the evaluation
record. Add a slice scenario when its implementation lands, and preserve
provider/live receipt as a separate unproven field until actually observed.

**Verify:** focused tests and `pnpm eval:contract` exit 0; no production
provider/browser action is performed.

### 4. Publish an honest baseline procedure

Document how to run one deterministic baseline and the separately authorized
paid/browser/live layers. A comparison may say “no measured improvement” or
“unknown”; it may not claim speed/cost gains from absent/mismatched evidence.

**Verify:** `pnpm check && pnpm build && git diff --check` exits 0.

## Test plan and done criteria

- Positive: record one matched successful fixture with all available fields.
- Negative: missing cost/delivery/verification is `null/unknown`, never zero
  or successful by default; mismatched case/configuration comparison rejects.
- Failure/recovery: aborted, partial, uncertain-write, and duplicate attempts
  remain distinct from successful whole-task completion.
- Replay: repeated emitted events do not double-count a stable logical attempt
  when the existing owner already exposes its identity; otherwise STOP rather
  than invent event-ID dedupe.
- [ ] RED/GREEN and existing gates pass; paid/browser/live checks are clearly
      marked run, blocked, or not requested.
- [ ] No metric creates a performance claim without matched evidence.

## STOP, rollback, and maintenance

STOP if required logical action identity is absent, if active PRs already own
the metric, or if metric collection needs secrets/live side effects/new event
storage. Revert only this measurement PR; do not change budgets or agent
behavior. Review future comparisons for equal task, equal verification, equal
delivery criterion, sample count, all attempts, and unknown fields.

## Independently executable prompt

“Implement Plan 016 only. Inspect and cite the actual PR138/120/136 commits
before touching shared measurement code. Freeze one named matched scenario and
trial protocol, write owner-local RED assertions, and reuse existing reporters.
Never claim a gain without equivalent verified task and delivery results. Follow
normal worktree/PR/CI delivery; paid/browser/live runs require separate scope.”
