# Plan 007: Claim each completion-report part durably before channel dispatch

GitHub: [#157](https://github.com/dennisonbertram/fork-OpenInstinct/issues/157).

> **Executor instructions:** This plan is a release-critical crash-window boundary. Do not claim restart exactly-once from a call ID, unit mock count, or provider API behavior. First prove whether Eve offers a durable pre-dispatch/checkpoint seam. If it does not, implement the small application report-attempt record specified here; it is limited to interactive completion reports and is not a task engine, outbox, or scheduler.
>
> **Drift check:** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/channels/eve.ts agent/channels/linq.ts agent/channels/sendblue.ts agent/lib/message-delivery.ts agent/lib/completion-report-attempts.ts db/schema/chats.ts db/schema/index.ts db/services/completion-report-attempts.ts db/migrations/0027_completion_report_attempts.sql db/migrations/meta db/tests/completion-report-attempts.test.ts tests/agent/channels/eve-message-delivery.test.ts tests/agent/channels/linq-message-delivery.test.ts tests/agent/channels/sendblue-channel.test.ts evals/contract/mount-harness/evals/linq-final-delivery.eval.ts`

## Status

- **Priority:** P1
- **Effort:** M with an existing durable seam; L only if the bounded application record is required
- **Risk:** HIGH
- **Depends on:** Plans 005, 006
- **Category:** bug
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11

## Why this matters

A composed report is not delivered merely because the root selected a tool. A process may crash before dispatch, after the provider accepts, or before Eve checkpoints the channel result. Current `finalDelivery` is per-session state and keyed by call ID, so it cannot prove a restart will not re-send; a model retry can have a different call ID. SendBlue currently has no demonstrated idempotency key for `messages.send`. The report claim must therefore precede a network call and use logical report identity.

## Current state

- `agent/lib/message-delivery.ts:26-71` tracks one exact `(turnId, callId)` final delivery and asks Eve to complete a turn only after `completed`. It is a same-session tool-loop guard, not a durable external-effect record.
- `agent/channels/eve.ts:73-100`, `agent/channels/linq.ts:275-485`, and `agent/channels/sendblue.ts:430-454` decide channel acceptance after the action result.
- `agent/channels/sendblue.ts:461-475` already suppresses its generic fallback for any final or uncertain delivery state. Preserve this uncertainty protection.
- `agent/channels/linq.ts:286-308` demonstrates a scheduled-report-only idempotency key. It is not evidence that SendBlue or interactive report sends are restart-idempotent.
- `agent/lib/schedules/report.ts:17-95` and `db/services/scheduled-agent-jobs.ts` own scheduled claims, leases, and sequences. They are an ownership pattern only; do not reuse their scheduler or table.
- `db/schema/chats.ts`, `db/schema/index.ts`, `db/services/*`, `db/tests/*`, and the current last migration `db/migrations/0026_sendblue_platform_line_provider.sql` are the existing application persistence/migration conventions.

## Supported seam probe and decision

Before implementation, create `tests/unit/completion-report-dispatch-boundary.test.ts` that starts a synthetic completion report and forcibly stops at: **DW-01** after durable `claimed` but before `markProviderAttempted`, and **DW-02** after durable `attempted` but before the adapter call/accepted checkpoint. Restore in a new process/session and assert the same logical report part is not dispatched twice. A separate **DW-03** stops after adapter acceptance but before the normal channel result/turn-completion checkpoint.

If Eve exposes a documented, tested durable “claim before dispatch plus recovery lookup” seam that passes all three fault cases, use it and document its exact API/version. If not, the application record below is required. A call ID, event ID, provider handle, or model-visible status is insufficient. If neither route can be made atomic enough to classify the crash window, the release gate is **BLOCKED/unknown**, not green.

## Bounded application record (conditional implementation)

Create only these new product-owned paths when the probe fails:

- `db/schema/chats.ts` — add `completion_report_attempts` scoped by workspace, root session, conversation channel/ID, and owner; add a unique logical identity index.
- `db/schema/index.ts` — export the table.
- `db/services/completion-report-attempts.ts` — transactional compare-and-swap `claim`, `markProviderAttempted`, and `markAccepted` operations with exact ownership/lease checks; no poller, queue, or retry scheduler.
- `db/migrations/0027_completion_report_attempts.sql` and generated `db/migrations/meta/*` — additive migration only, numbered after `0026`; use the repository migration generator and inspect generated output.
- `db/tests/completion-report-attempts.test.ts` — real Postgres contention and restore coverage.
- `agent/lib/completion-report-attempts.ts` — narrow conversion between Plan 005/006 obligation and service identity, not a second task schema.

The unique logical key is `{ cohortId, reportRevision, part }`. `part` is an ordinal/role for each physical side effect: text send, attachment send, media upload, and media send are separate parts. A media send cannot begin before its owned upload part is accepted. Store only a content digest, MIME/size/artifact identity where needed, state, safe provider handle if returned, lease/version, and timestamps; never raw text, provider body, phone, secret, or unbounded artifact data.

State is `claimed` → `attempted` → `accepted` (or `unconfirmed`). `claimed` has an owner lease/version but **has not dispatched**. `markProviderAttempted` is a durable CAS from the current live lease to `attempted` and happens **before** every network call. Only the same lease/version may make that transition and then dispatch; a stale owner must re-read and must not call the provider. If recovery sees `attempted` without accepted evidence, classify the part `unconfirmed`, never upload/send it automatically. A lease-expired `claimed` part may be safely claimed by a new owner only when the atomic CAS proves the old owner cannot still transition to `attempted`; otherwise classify it unknown rather than taking over.

## Scope

**In scope:** only the exact files listed in the drift check, including `tests/unit/completion-report-dispatch-boundary.test.ts`; optionally the bounded schema/service/migration/test set after DW-01/DW-02. It applies only to final interactive completion-report parts.

**Out of scope:** generic task persistence, general outbound messaging, SendBlue image upload implementation, provider credentials, retry queues, scheduled report leases, raw transcript storage, browser execution, and recipient receipt.

## Steps

### 1. Establish RED crash boundaries

Implement DW-01, DW-02, and DW-03 using a synthetic channel adapter with explicit process-boundary restore and persisted-state readback at each fault point. Add concurrent two-claimer and stale-owner tests. DW-01 proves the recovery CAS/lease prevents a paused original claimer from later marking attempted and dispatching; DW-02 proves pre-dispatch `attempted` is unconfirmed/no-retry even though the adapter may have received zero calls; DW-03 proves acceptance cannot cause a second call after checkpoint loss. The tests must prove a regenerated model call ID cannot dispatch the same `{cohortId, reportRevision, part}` twice. Existing unit mocks alone do not satisfy this step.

### 2. Claim and mark every physical part before dispatch

Bind Plan 006’s nonempty text report to `part: text`; bind each selected attachment/media physical side effect to `media-upload:[ordinal]` then `media-send:[ordinal]`, or the channel-equivalent explicit part names. Claim, then durably CAS mark `attempted`, then invoke exactly that adapter operation. An already `accepted` part is never resent. An `attempted`/unknown part is never automatically re-uploaded or resent, including an upload that may have succeeded. A known validation failure before `markProviderAttempted` has no attempted part and may permit the one bounded truthful fallback defined in Plan 006.

### 3. Settle only the matching report

Accepted adapter evidence marks the exact part accepted. The obligation is `delivered` only when every required part is accepted. Any `attempted` unknown part leaves the obligation `unconfirmed`; existing no-fallback/no-retry behavior applies. A callback for another cohort/revision/part cannot settle it. Provider acceptance is not recipient receipt.

### 4. Preserve scheduler and normal messages

Do not call the new service for non-obligation messages or scheduled reports. Keep `scheduledReportFromSession`, lease token, and sequence unmodified. A later user-directed message is a new report revision/ordinary message, not recovery of an uncertain old part unless an operator performs a separately designed reconciliation.

## Test plan

| ID    | Scenario                                         | Required oracle                                                                     |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| CS-01 | Eve accepted text part                           | one claim, one dispatch, accepted matching part                                     |
| CS-02 | Linq accepted multi-part report                  | each part claimed once; all accepted before delivered                               |
| CS-03 | SendBlue handle for text/media part              | one SDK call for claimed part; handle retained safely                               |
| CS-04 | known pre-dispatch rejection                     | no attempted part/no provider call; fallback eligibility only                       |
| CS-05 | timeout/no handle                                | `attempted` then obligation `unconfirmed`; no retry                                 |
| CS-06 | callback replay                                  | one durable part state; no second dispatch                                          |
| CS-07 | DW-01 after claim/before attempted               | lease/CAS recovery dispatches once; stale original cannot dispatch                  |
| CS-08 | DW-02 after attempted/before adapter call        | persisted `attempted` readback; unconfirmed and zero automatic dispatch             |
| CS-09 | DW-03 after adapter acceptance/before checkpoint | no automatic redispatch; accepted only with durable evidence, otherwise unconfirmed |
| CS-10 | concurrent claimers/stale owner                  | one current CAS winner; one provider call maximum                                   |
| CS-11 | upload or media-send part already attempted      | zero reupload/resend on recovery                                                    |
| CS-12 | scheduled report                                 | existing claim/lease/sequence behavior unchanged                                    |

Run `pnpm test:app -- db/tests/completion-report-attempts.test.ts tests/unit/completion-report-dispatch-boundary.test.ts tests/agent/channels/eve-message-delivery.test.ts tests/agent/channels/linq-message-delivery.test.ts tests/agent/channels/sendblue-channel.test.ts` before source edits for RED and after for green. Run `pnpm eval:contract -- --mount-only --timeout 30000`, `pnpm check`, `pnpm build`, and `git diff --check`; expect exit 0. The DB tests must use the repository’s disposable real-Postgres pattern, not SQLite or a mocked transaction.

## Activation and release staging

Plans 004–006 may add inactive typed helpers and deterministic tests, but **must not activate report forcing in production** until Plans 004–008 integrate and Plan 009 records its deterministic matrix, authorized selected paid-model trials, browser-visible/reload proof, and configured-native acceptance. Use no magic environment flag. A full end-to-end local test is necessary but insufficient for activation. If the paid budget, browser proof, or native authorization is absent, activation remains OPEN/BLOCKED. Until then, the milestone is implemented contract coverage, not a production completion fix.

## Done criteria and STOP conditions

- [ ] DW-01/DW-02/DW-03 and CS-01–CS-12 prove actual restart/concurrency behavior, not only in-process mock counts.
- [ ] Every physical report part is claimed and CAS-marked `attempted` by logical cohort/revision/part before its network dispatch.
- [ ] Unknown provider crossings are `unconfirmed` with zero automatic retry, reupload, or resend.
- [ ] Scheduled lease/report behavior and ordinary messaging do not use the new record.

STOP and mark the crash window unknown if no supported durable seam or bounded application record can prove it. Do not claim exactly-once recipient delivery; current goal is at-most-once automatic dispatch with explicit uncertainty.

## Executor prompt

Implement only this report-attempt boundary after Plans 005–006 are ready but inactive. Start by retaining DW-01/DW-02/DW-03 RED in real Postgres/process-restoration tests. Read the existing schedule and browser-image idempotency services for conventions, but do not copy their scheduler semantics. Coordinate with the operating-model owner so no parallel task schema is created. Use synthetic adapters and no external sends, migrations outside the stated additive migration, or provider payload logging. Hand off the raw crash-boundary and concurrency output, exact unknown classifications, and all unverified recipient evidence.
