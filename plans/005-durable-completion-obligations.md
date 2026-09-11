# Plan 005: Persist trusted per-task evidence and bounded root completion obligations

GitHub: [#155](https://github.com/dennisonbertram/fork-OpenInstinct/issues/155).

> **Executor instructions:** Implement only after Plan 004 has a tested typed terminal adapter. Keep all state in the root Eve session. Do not treat worker prose, parsed UI notifications, model claims, or provider acceptance as verification. Preserve legacy worker-completion display paths without inventing facts for old records.
>
> **Drift check:** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/lib/completion-obligations.ts agent/agent.ts agent/subagents/browser-agent/agent.ts agent/subagents/browser-agent/instructions.md agent/instructions/content/worker-coordination.md src/lib/worker-completion.ts tests/agent/lib/completion-obligations.test.ts tests/unit/agent-tool-boundaries.test.ts`

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** HIGH
- **Depends on:** Plan 004
- **Category:** tech-debt
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11
- **PR boundary:** one cohesive root-session envelope, compatible worker schema, and its focused tests. Cross-session persistence or a generic evidence store is explicitly deferred.

## Why this matters

A root needs durable, scoped facts about each worker before it can decide what report is owed. Today a final-delivery slot tracks one send attempt, not multiple worker results, their objective revision, or whether the cohort is still pending. This plan adds the smallest root-session envelope that keeps execution, verification, reporting, and transport separate.

## Current state and constraints

- `src/lib/worker-completion.ts:4-35` is the existing browser worker completion contract. Extend it compatibly; existing records must remain displayable and may remain `unknown` verification.
- `agent/lib/message-delivery.ts:3-71` stores a single exact final delivery. Reuse its exact `turnId`/`callId` rule for report binding later, but do not overload it as task lifecycle state.
- `agent/agent.ts:37-65` can resolve only channel/session/turn context during a root step.
- `node_modules/eve/docs/subagents/index.mdx:146` says child and root `defineState` are never shared. `node_modules/eve/docs/tutorial/remember-definitions.mdx:8-19` makes root `defineState` durable across steps and turns in one session.
- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md:159-175` says a structured approval response can resume an older request after intervening turns. Any state must bind a result to its original objective rather than the newest prose.

## Proposed state (not an executor-created public API)

```ts
type EvidenceKind =
  "observed" | "executor_receipt" | "worker_assertion" | "unknown";
type TaskTerminal = {
  status: "completed" | "failed" | "cancelled";
  facts: BoundedFact[];
};
type TaskRecord = {
  taskId: string;
  workerCallId: string;
  workerSessionId: string;
  parentTurnId: string;
  objectiveRevision: string;
  terminal?: TaskTerminal;
};
type CohortRecord = {
  cohortId: string;
  taskIds: string[];
  phase:
    | "awaiting_terminal"
    | "must_report"
    | "delivery_pending"
    | "delivered"
    | "unconfirmed"
    | "blocked"
    | "cancelled"
    | "superseded";
  report?: { turnId: string; callId: string };
};
```

`BoundedFact` needs claim text, evidence kind, safe scoped reference, and explicitly `unknown` where corroboration is absent. Do not retain raw page text, credentials, or full child history. A worker “submitted” label is always `worker_assertion`; a root/worker code path may mark it `executor_receipt` or `observed` only after it matches an exact typed call/result reference and the referenced artifact is owned by the current root session/scope. Free-string references and model-authored provenance labels never corroborate a claim.

Retention is deliberately bounded: at most **8 open cohorts** per root session, **8 tasks per cohort**, **8 facts per task**, and **32 retired summary references**. At admission, reject a ninth live cohort/task **before launching another worker or external dispatch** with a truthful `blocked` reason; never silently omit a task that already ran. When a cohort is resolved, independently verified where required, and its report is accepted, retire its detailed facts to one bounded summary reference containing cohort/objective identity, outcome class, report identity/state, and evidence digests. That reference preserves later summary provenance without retaining raw worker/page content.

Never retire `must_report`, `delivery_pending`, `unconfirmed`, `blocked`, or a task whose dispatched effect remains unresolved. A dispatched effect that is verified and whose report is accepted may retire under the preceding rule. If all active capacity is protected, stop new external-task admission rather than evict it. When a task produces a ninth fact, preserve terminal/task identity and an explicit bounded `truncated_unknown` marker; do not infer the omitted facts. At the retired-summary cap, evict only the oldest resolved and fully reported summary reference. A later request for evicted evidence must report that the retained evidence is unavailable; it must not invent a result or rerun the action. Test capacity recovery after more than 32 resolved cohorts, factual uncertainty after eviction, and preservation of every unresolved obligation.

## Scope

**In scope:** `agent/lib/completion-obligations.ts`; `agent/agent.ts` (the only root lifecycle registration that consumes Plan 004’s typed adapter); `src/lib/worker-completion.ts`; `agent/subagents/browser-agent/agent.ts`; `agent/subagents/browser-agent/instructions.md`; `agent/instructions/content/worker-coordination.md`; `tests/agent/lib/completion-obligations.test.ts`; and `tests/unit/agent-tool-boundaries.test.ts`. Plan 004’s adapter is an imported producer, registered at `agent/agent.ts`’s existing `defineDynamic` root event boundary; no hook or stream parser is allowed.

**Out of scope:** database tables, cross-session sharing, new telemetry, channel send behavior, public trace parsing, browser tools, scheduled jobs, model changes, or a generic workflow engine. Worker instructions are in scope only because they must require the compatible emitted fields; any instruction edit triggers `pnpm eval:square` and its `Results:` line.

## Steps

### 1. Preserve a behavioral RED before code

Write tests that drive two typed task receipts and terminals through the same `agent/agent.ts` root registration boundary used in production, then for the same parent turn, settle one, then settle the second. Assert no `must_report` transition after the first terminal and one transition only after all members settle. Add a different parent turn and a different objective revision. It must remain independent even if task output text matches.

### 2. Add root-only task and cohort records

Use `defineState` in one dedicated module. Store records keyed by stable task/cohort identity, not stream event ID. Registration accepts only Plan 004 typed receipt identity; terminal promotion accepts only a matching typed terminal. Make transitions monotonic: `delivered` cannot downgrade due to a late failure; `superseded` cannot become a new-goal completion; `unconfirmed` remains a reporting/transport outcome rather than execution success.

### 3. Classify evidence and legacy data

Extend the existing worker completion parser/schema with optional bounded facts and provenance. Old payloads parse to an explicit unknown/legacy representation. Never infer verified success from valid JSON. Tests should show an executor receipt may support “attempted,” an observed response may support “observed,” and an unsupported worker claim is reported as unverified/uncertain.

### 4. Handle cancellation, steering, and parallel cohorts

A cancellation marks only matching active tasks/cohorts. If an action had an executor receipt, retain that evidence and produce a truthful attempted/uncertain report when the cohort becomes reportable. A late terminal for a superseded objective may update its own historical task record but cannot satisfy a newer objective. A new user turn may independently ask for status without reopening an old send attempt.

## Test plan

| ID    | Scenario                               | Expected result                                                                                          |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| CO-01 | first of two task terminals            | cohort remains `awaiting_terminal`; zero report obligation                                               |
| CO-02 | second terminal                        | exactly one `must_report` transition                                                                     |
| CO-03 | multiple concurrent parent cohorts     | independent task lists and obligations                                                                   |
| CO-04 | typed terminal wrong task/call/session | ignored/rejected; state unchanged                                                                        |
| CO-05 | legacy payload                         | display-compatible `unknown`, no invented verification                                                   |
| CO-06 | cancel after executor receipt          | retained attempted evidence; truthful report eligibility                                                 |
| CO-07 | steering + late old terminal           | no completion for new objective                                                                          |
| CO-08 | restart/replay                         | same semantic identities, no duplicate promotion                                                         |
| CO-09 | ninth cohort/task/fact                 | reject new dispatch before mutation; keep terminal identity and `truncated_unknown` where facts overflow |
| CO-10 | verified accepted cohort retirement    | one bounded summary reference supports recovery; protected records remain                                |
| CO-11 | protected capacity full                | truthful admission blocker; zero new worker/external dispatch                                            |

Follow `tests/agent/tools/messaging-completion.test.ts` state mocking style, but do not add production reset APIs. Exercise state using separate `defineState` keys so module state cannot leak between cases.

The stated worker instruction and `agent/agent.ts` scope triggers `pnpm eval:square`; retain its `Results:` line. An inactive helper PR may merge only with this gate green. Any PR that activates report forcing remains blocked on Plan 009’s authorized paid/browser/native evidence when that budget or authorization is missing.

## Verification

Run the new focused tests first (RED), then after implementation: `pnpm test:app -- tests/agent/lib/completion-obligations.test.ts tests/unit/agent-tool-boundaries.test.ts`, `pnpm eval:contract -- --mount-only --timeout 30000`, `pnpm eval:square` (expect a `Results:` line because worker instructions change), `pnpm check`, `pnpm build`, and `git diff --check`; expect exit 0. Do not report a real-model or native recipient result from this plan.

## Done criteria and STOP conditions

- [ ] CO-01–CO-11 pass and prove multiple tasks, objective binding, provenance, replay, cancellation, and retention behavior.
- [ ] No record is derived from notification text or event ID alone.
- [ ] Legacy data is explicit unknown, never upgraded to verified by parsing.
- [ ] Scheduled report state/leases remain untouched.

STOP if Plan 004 does not expose a typed identity, state would cross root session boundaries, an existing completion schema has consumers requiring an unbounded raw result, or a reviewer requests a shared system-agent task schema. Coordinate that consumer; do not duplicate ownership.

## Maintenance notes

Reviewers should inspect every transition for monotonicity and exact task/cohort/objective identity. Plan 006 consumes only the reportability output; it must not directly mutate task evidence. If future workers need new evidence fields, add bounded typed fields with provenance rather than appending raw outputs. A root session ending is an explicit ownership boundary; cross-session recovery requires a separately planned application-owned artifact.

## Executor prompt

Implement the root-only envelope after Plan 004 has green typed-terminal proof. Touch only the stated completion contracts and focused tests. Establish CO-01–CO-11 RED first, keep worker assertions distinct from trusted evidence, and preserve legacy records as unknown. Do not add a database, event store, scheduler, cross-session state, or model-written policy. Report any incompatibility with the existing worker-completion schema before changing consumers.
