# Plan 006: Require one grounded native text report when a cohort is reportable

GitHub: [#156](https://github.com/dennisonbertram/fork-OpenInstinct/issues/156).

> **Executor instructions:** This plan consumes Plan 005’s `must_report` state. It must force the exact native `send_message` tool and reject reactions or non-final sends as satisfaction. It must not force a report while the Eve cohort is pending, and it must not resubmit external work.
>
> **Drift check:** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/agent.ts agent/lib/delivery-guard.ts agent/tools/messaging.ts agent/instructions/content/role/interactive.md agent/lib/message-delivery.ts tests/agent/lib/completion-obligations.test.ts tests/agent/tools/messaging-completion.test.ts agent/lib/tests/delivery-guard.test.ts evals/agent/conversation.eval.ts`

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Depends on:** Plan 005
- **Category:** bug
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11

## Why this matters

The live symptom was a root choosing `react_to_message` after worker completion and again after an explicit summary question. Both tools were available, and instructions alone were advisory. A substantive report obligation needs a structural policy and executor guard, while ordinary lightweight reactions remain ergonomic when no obligation exists.

## Current state

- `agent/tools/messaging.ts:62-88` provides `send_message`; `final: true` begins the existing final delivery state.
- `agent/tools/messaging.ts:90-121` also provides reactions; adding a reaction begins final delivery for provider channels.
- `agent/lib/delivery-guard.ts:12-27` currently returns generic `{ type: "required" }`, which permits either tool.
- `agent/agent.ts:37-65` applies dynamic tool choice per step.
- `agent/instructions/content/role/interactive.md:53-61` says reactions may alone answer lightweight turns and worker results should be user-facing; preserve this ordinary path.
- AI SDK local type declarations support named tool choice; verify the installed version before coding rather than assuming a different SDK’s union shape.

## Scope

**In scope:** root dynamic context/policy, delivery guard, messaging executor validation, a minimal authored instruction clarification if needed, unit and agent-eval cases.

**Out of scope:** model/provider selection, task registration, channel posting, browser worker/tool behavior, approval rules, generic prompt rewriting, scheduled reports, and any rule that blocks a later user-directed normal message.

## Steps

### 1. Write the decision matrix as RED tests

Create a resolver/executor test matrix for: open ordinary conversation (both tools); `awaiting_terminal` cohort (normal task policy, no partial message); `must_report` (only final `send_message`); `delivery_pending`, `delivered`, and `unconfirmed` exact prior report states (no same-turn resend); and a later explicit summary turn (valid final text send). Assert actual tool presence and actual rejected executor call, not only a non-null tool choice.

### 2. Add a narrow report-only policy

Have Plan 005 provide a typed policy input, not prose. For `must_report`, use the installed SDK’s exact named-tool option if supported, or hide reactions from the resolver and make `send_message` the only tool. The executor must require `kind: "message"`, nonempty trimmed text, and `final: true`; link-only or attachment-only calls cannot satisfy a written completion summary. Bind the attempted report to current obligation/call/turn identity and reject stale task results. Do not declare success before the channel settles it in Plan 007.

### 3. Supply grounded composition context and a pre-send fallback

Give the model only bounded trusted facts, user-stated goal, objective revision, and known uncertainty. The composition must say outcome, material evidence/artifact, unresolved uncertainty, and any necessary next action. It must not expose raw browser text, secrets, or unverified worker claims as fact. If composition/model execution fails **before a provider attempt**, create one bounded truthful fallback native text (for example, that Jory could not prepare the completion summary and what evidence remains). Limit to one fallback attempt; once sending reaches a provider, Plan 007’s unconfirmed path forbids automatic retry.

### 4. Preserve later substantive requests

An explicit later substantive summary/status question is a current turn. Classify only supported structured channel/context signals plus a conservative semantic rule: when uncertain, require words rather than allow a reaction. Add a real-model negative control for a lightweight “thanks” turn that may still react; do not make a brittle exact-phrase classifier. When retained evidence exists, expose `send_message`, answer with it, and do not call a worker/executor or reaction-only path. This is recovery, not reopening the old final report.

## Test plan

| ID    | Scenario                                                       | Oracle                                                                   |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| RP-01 | settled cohort                                                 | exact `send_message` selected; reaction absent/rejected                  |
| RP-02 | two-worker pending cohort                                      | zero report tool forcing and zero partial send                           |
| RP-03 | reaction call against owed report                              | executor rejects; zero provider call                                     |
| RP-04 | final false, link-only, or attachment-only against owed report | executor rejects; zero provider call                                     |
| RP-05 | pre-provider composition failure                               | one bounded truthful fallback, then no loop                              |
| RP-06 | later explicit summary                                         | one valid textual send, zero worker/external resubmit                    |
| RP-07 | ordinary lightweight “thanks”                                  | existing reaction-only behavior remains in a real-model negative control |
| RP-08 | stale completion policy/call                                   | rejected; no delivery state mutation                                     |

Use deterministic fixtures for RP-01–08. Add one `evals/agent/conversation.eval.ts` real-model case with synthetic result evidence and an exact prohibition on reaction-only or new worker work; semantic quality is judged separately from exact tool choice.

If this slice changes `agent/agent.ts` or authored instructions, `pnpm eval:square` is required. A helper-only PR may merge only while production forcing remains inactive and every applicable deterministic/Square gate passes; a forcing or activation PR is blocked until Plan 009’s budgeted/authorized evidence exists.

## Verification and done criteria

If the stated optional instruction file changes, also run `pnpm eval:square` and retain its `Results:` line. Run focus tests RED first, then `pnpm test:app -- tests/agent/lib/completion-obligations.test.ts tests/agent/tools/messaging-completion.test.ts agent/lib/tests/delivery-guard.test.ts`, `pnpm eval:contract -- --mount-only --timeout 30000`, conditional `pnpm eval:agent --tag completion-summary` only after the Plan 009 operator-provided paid budget/model/fixture gate, `pnpm check`, `pnpm build`, and `git diff --check`. The deterministic inactive PR gate is the focused tests, contract, applicable Square result, check, build, and diff check; `eval:agent` is not a merge prerequisite without its operator gate. Activation remains Plan 009-blocked. A reviewer must see provider-call absence for RP-03/RP-04 and one valid next-turn send for RP-06.

STOP if the installed AI SDK cannot enforce a named tool or resolver cannot remove reactions without changing unrelated modes. Report the exact type/API limitation; do not substitute instructions alone or globally remove reactions.

## Maintenance notes

The guard is a protocol check, not a replacement for ordinary instructions. Keep `react_to_message` available in ordinary lightweight turns and keep exact final-delivery blocking independent of cohort state. A future report formatter may improve wording, but it may not promote unknown evidence or issue a provider retry.

## STOP conditions

Stop and report if Plan 005 does not distinguish reportable from merely terminal, if no installed tool-choice form can name `send_message`, if the executor cannot validate `final: true` with the obligation identity, or if the fallback would happen after a provider request. Do not solve these limits by changing the selected model or by a global instruction that removes reactions.

## Executor prompt

Implement only the deterministic report-only policy after Plan 005, but leave activation inactive as Plan 007 specifies. Read the installed AI SDK type declarations and existing dynamic resolver tests. Capture RP-01–RP-08 RED first. Preserve normal reaction ergonomics, pending-cohort silence, approval boundaries, and later user-directed summarization. Use synthetic evidence only; do not invoke a provider, worker, or real model while developing. Hand off exact tool/call-count proof and any SDK limitation.
