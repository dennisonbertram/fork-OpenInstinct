# Plan 008: Preserve one native approval through resume, steering, and cancellation

GitHub: [#158](https://github.com/dennisonbertram/fork-OpenInstinct/issues/158).

> **Executor instructions:** Build on the completion contracts only after Plans 004–007. Keep Eve’s native approval as the sole authorization point for a material action. Remove duplicate prose approval only if a current authored instruction demonstrably asks the same question; do not expand what can be approved.
>
> **Drift check:** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/lib/completion-obligations.ts agent/subagents/browser-agent/tools/commit_browser_action.ts agent/instructions/content/worker-coordination.md agent/subagents/browser-agent/instructions.md agent/channels/linq.ts agent/channels/sendblue.ts tests/agent/lib/completion-obligations.test.ts tests/agent/subagents/browser-agent/tools/commit-browser-action.test.ts tests/agent/channels/linq-message-delivery.test.ts tests/agent/channels/sendblue-channel.test.ts tests/unit/agent-tool-boundaries.test.ts`

## Status

- **Priority:** P2
- **Effort:** M
- **Risk:** HIGH
- **Depends on:** Plans 005, 006, 007
- **Category:** bug
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11

## Why this matters

An approval may park a worker, a user may steer with a new message, and a structured response can resume the older request later. Completion state must distinguish those legitimate flows from stale output or an invalid material change. A cancellation must not claim a new goal completed, yet it must not hide a previously dispatched effect.

## Current state

- `node_modules/eve/docs/tools/human-in-the-loop.md:151-175` says descendant input requests proxy through the root and structured answers route by request ID.
- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md:159-175` says plain follow-up text starts a new ordinary turn while approvals remain pending; stale answers do not authorize the earlier tool.
- `node_modules/eve/docs/subagents/index.mdx:170-172` says cancellation cascades to active children and does not synthesize a completion result.
- Browser execution owns authorization/commit receipts; see `agent/subagents/browser-agent/tools/commit_browser_action.ts` before any fixture change. Existing approval policy remains authoritative.
- `agent/channels/sendblue.ts:498-517` and `agent/channels/linq.ts:712-724` own channel-specific pending-input lifecycle; do not replace them with root completion state.

## Scope

**In scope:** only `agent/lib/completion-obligations.ts` for task/cohort linkage; `agent/subagents/browser-agent/tools/commit_browser_action.ts` for deriving a safe fingerprint from its existing typed input; `agent/channels/linq.ts` and `agent/channels/sendblue.ts` only at their existing `input.requested`/structured-response bridge seams; optional minimal duplicate-prose edits in `agent/instructions/content/worker-coordination.md` and `agent/subagents/browser-agent/instructions.md`; and the five exact focused test files in the drift check. The channel change carries identity metadata through an existing gate; it must not create a new approval engine.

**Out of scope:** new approval types, approval UI redesign, provider-side cancellation, changing browser action policy, raw approval storage, scheduler changes, automatic approval, additional channels, or model/provider changes.

## Steps

### 1. Characterize native approval and steering as RED

Use a synthetic worker with a material action that reaches the existing native approval boundary. Test: request parks; a structured approval resumes exactly one worker; a plain new user summary/status turn does not consume approval; cancellation marks the matching task without a fake terminal result; and a stale structured answer cannot authorize a changed action.

### 2. Bind pending approval to task/cohort identity

Store only request ID plus Plan 005 task/cohort/objective identity and an allowed material-terms fingerprint. Derive that fingerprint in `commit_browser_action.ts` from the already-authorized `commitBrowserActionInputSchema` fields `action`, `terms`, `origin`, `target_ref`, and opaque `target_token`; exclude payment/vault fields, raw approval text, and all secret values. The fingerprint is compared, not displayed. The approval is a pending state, not terminal evidence and not a report obligation. Resume accepts only the matching task and unchanged terms. A material change requires a fresh native approval, not a prose confirmation.

### 3. Make cancellation and steering truthful

On cancellation, settle the cohort only from real task terminal/cancel signals. Retain executor receipt/observed evidence if dispatch happened. If a user requests status or the cohort’s policy makes a report useful, compose “cancelled after/without dispatch” or “outcome uncertain” from evidence; never assert rollback. A late terminal from the cancelled/superseded cohort cannot complete a newer user objective.

### 4. Remove duplicate prose only when demonstrated

Inspect the current instruction and a RED regression showing it asks an equivalent prose confirmation before the actual native gate. Then make one small authored instruction edit that directs preparation/preview directly to the native approval. If the questions cover distinct material terms, stop: do not collapse them.

## Test plan

| ID    | Scenario                                  | Expected result                                           |
| ----- | ----------------------------------------- | --------------------------------------------------------- |
| AR-01 | one native approval                       | one pending request, one resume, one executor attempt     |
| AR-02 | plain new question while approval pending | new normal turn; approval remains pending                 |
| AR-03 | stale approval after material term change | zero executor attempt; fresh approval required            |
| AR-04 | cancellation before dispatch              | terminal cancelled; no success claim                      |
| AR-05 | cancellation after receipt                | retained attempted evidence and truthful uncertain report |
| AR-06 | late worker terminal after steering       | cannot satisfy new objective                              |
| AR-07 | duplicate prose regression                | one native approval, no duplicate equivalent question     |

If this slice changes authored instructions, `pnpm eval:square` is required. A helper-only PR may merge only while activation remains inactive and all applicable deterministic/Square gates pass; a PR that activates completion behavior is blocked until Plan 009’s operator budget and native/browser evidence gates are met.

## Verification and done criteria

If the stated optional instruction file changes, also run `pnpm eval:square` and retain its `Results:` line. Run focused tests RED first, then `pnpm test:app -- tests/agent/lib/completion-obligations.test.ts tests/agent/subagents/browser-agent/tools/commit-browser-action.test.ts tests/agent/channels/linq-message-delivery.test.ts tests/agent/channels/sendblue-channel.test.ts tests/unit/agent-tool-boundaries.test.ts`, `pnpm eval:contract`, conditional `pnpm eval:agent --tag completion-summary` only after Plan 009 supplies operator-paid budget/model/fixture authorization, `pnpm check`, `pnpm build`, and `git diff --check`; expect exits 0. The deterministic inactive PR gate excludes the conditional paid eval; Plan 009 remains the activation gate. All action data is synthetic; no native provider or browser mutation is a test oracle.

STOP if an event cannot be matched to task/request/terms, a requested wording change changes terms, or the only way to bridge approval is to intercept raw input text. Preserve existing channel pending-input locks.

## Maintenance notes

Approval request IDs belong to Eve’s existing input lifecycle; completion state references them but does not own native channel locks. A later user message is not an approval response. If cancellation policy evolves, retain the distinction between prevented effects, attempted effects, verified effects, and unknown effects.

## STOP conditions

Stop if the existing approval request cannot bind material terms to the worker task, if a test needs an external action, if cancellation emits no safely matchable boundary, or if an instruction edit would hide a material difference between two questions. Do not make plain language approve an action or reinterpret a stale approval.

## Executor prompt

Implement only the approval/resume/cancellation integration after the identity and settlement plans are green. Start with AR-01–AR-07 using a synthetic parked worker. Keep one existing native approval, immutable term checks, current root/session ownership, and no automatic resubmit. Touch instructions only to remove a demonstrably duplicate question. Report every remaining unobserved native-provider behavior rather than inferring it from tests.
