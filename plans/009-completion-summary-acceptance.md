# Plan 009: Prove completion summaries across deterministic, model, web, and native paths

GitHub: [#159](https://github.com/dennisonbertram/fork-OpenInstinct/issues/159).

> **Executor instructions:** This is the final verification slice. It does not replace the unit/contract coverage in Plans 004–008, and it must not make a live send until a separate operator grants bounded approval. Record failures and unknowns; do not rerun until green or call mocked acceptance recipient proof.
>
> **Drift check:** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- evals/agent/conversation.eval.ts evals/contract/mount-harness/evals/linq-final-delivery.eval.ts tests/e2e/completion-summary.spec.ts tests/agent/lib/completion-obligations.test.ts tests/agent/tools/messaging-completion.test.ts tests/agent/channels/eve-message-delivery.test.ts docs/evaluation/completion-summaries.md`

## Status

- **Priority:** P1 verification and release gate
- **Effort:** M
- **Risk:** MED
- **Depends on:** Plans 004–008
- **Category:** tests
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11

## Why this matters

The defect crosses lifecycle data, tool selection, delivery adapters, and model judgment. A passing unit test cannot prove a real model writes a summary, a browser user sees it, or a native provider accepts it. This plan defines the smallest layered evidence set and keeps acceptance, visible rendering, and recipient receipt separate. Its deterministic portion may merge while production activation remains inactive; it cannot close the epic by authoring unrun cases.

## Current state

- `evals/README.md` separates agent behavioral evals, model-free contract evals, and browser benchmarks; `pnpm eval:agent` uses isolated synthetic services and writes artifacts under `.eve/evals/`.
- `evals/agent/conversation.eval.ts` is the existing root conversation family; extend it rather than adding a second generic runner.
- `tests/e2e/README.md` describes the fixture-model browser path, persisted history/reload, follow-up delivery, and its limits: it does not prove actual native receipt.
- `evals/contract/mount-harness/evals/linq-final-delivery.eval.ts` is the model-free final-delivery event-ordering harness.
- `docs/evaluation/completion-summaries.md` (created by this planning change) is the canonical scenario and evidence specification; keep IDs synchronized.

## Scope

**In scope:** deterministic unit/contract cases needed to close gaps, one real-model conversation family, one fixture-model browser journey, operator-ready native acceptance script/checklist, and evaluation documentation.

**Out of scope:** a new eval framework, production telemetry, new dashboards, changed model settings, budget values, production transcript capture, automatic live sends, or claims that recipient receipt follows from API acceptance.

## Steps

### 1. Implement the deterministic matrix first

Add the full scenario IDs CS-01 through CS-12 and AR-01 through AR-07 from Plans 007–008 at the owning unit/contract layers. Contract fixtures must assert tool calls, report identity, action result ordering, provider call counts, and absence of a duplicate call. Use the mounted supervisor; do not fabricate event state in runtime source.

### 2. Add real-model completion judgment cases

Implement CM-01 through CM-05 exactly as specified in `docs/evaluation/completion-summaries.md`, using the existing local fixture’s synthetic customer/comment fields and no external httpbin route. Each case has fixed user turns, hidden worker facts, an explicit branch, and a bounded termination condition. Require a written `send_message`, prohibit reaction-only and new worker/executor calls, and make factual correctness/no-action deterministic assertions. Judge only concise grounded composition as advisory evidence; do not invent a passing threshold. Run the selected trials only after an operator supplies budget, model configuration, and fixture authorization; baseline, cost, judge calibration, and outcome remain TBD until observed.

### 3. Exercise a visible browser journey

Add a fixture-model Playwright case: submit a synthetic user request, complete a fixed worker cohort through the typed adapter fixture, reload the chat, then send “What was the result? Please summarize it. Do not submit again.” Assert one visible text message with the expected fixture evidence, no reaction-only terminal response, no extra worker/executor call, and persisted history. Use `pnpm test:e2e`; no external browser provider.

### 4. Require bounded configured-native acceptance before activation

Prepare, but do not execute without separate operator authorization, a single synthetic SendBlue or Linq acceptance journey: verified operator-controlled recipient, one synthetic task, one approval if a material action is included, one report, metadata-only provider acceptance evidence, and a manually observed native text. Before running, document recipient, exact sender, budget, operator, and stop condition. Do not use opt-out words in approvals; do not test uncertainty by intentionally inducing provider failures. Recipient receipt remains a separate manual observation.

## Test plan and strongest oracle

| Layer             | IDs            | Strongest oracle                                    | It does not prove                        |
| ----------------- | -------------- | --------------------------------------------------- | ---------------------------------------- |
| unit              | TA, CO, RP     | state transition and call guard                     | model semantics or native display        |
| contract          | CS/AR ordering | actual mounted event sequence/provider-call absence | provider receipt                         |
| real model        | CM-01…CM-05    | ordered model tool calls + grounded message         | general reliability or recipient receipt |
| browser           | CU-01          | rendered message after reload                       | external channel acceptance              |
| native acceptance | CL-01          | provider acceptance plus manual native observation  | broad production success                 |

The canonical scenario table in `docs/evaluation/completion-summaries.md` owns fixture inputs, branches, prohibited actions, and artifacts. This plan names representative ownership; it does not claim that every scenario is implemented by this PR.

## Commands

| Purpose             | Command                                                                                                                                                            | Expected result                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| contract            | `pnpm eval:contract -- --mount-only --timeout 30000`                                                                                                               | exit 0 with all scoped cases                                  |
| model-free tests    | `pnpm test:app -- tests/agent/lib/completion-obligations.test.ts tests/agent/tools/messaging-completion.test.ts tests/agent/channels/eve-message-delivery.test.ts` | all scoped cases pass                                         |
| browser             | `pnpm test:e2e`                                                                                                                                                    | exit 0, synthetic fixture only                                |
| real-model behavior | `pnpm eval:agent --tag completion-summary`                                                                                                                         | only after budget/credentials approval; all attempts retained |
| final checks        | `pnpm check && pnpm build && git diff --check`                                                                                                                     | all exit 0                                                    |

## Done criteria

- [ ] Every deterministic scenario has a RED-first regression and stable call-count oracle.
- [ ] At least one browser visible/reload path passes with fixture-only data.
- [ ] The deterministic verification PR may merge only with production report forcing inactive and its activation test proving that state.
- [ ] Epic closure and production activation require recorded selected CM trials, CU-01 web-visible/reload evidence, and authorized CL-01 configured-native acceptance; if budget or authorization is absent, the release gate remains **OPEN/BLOCKED**, not done.
- [ ] Native evidence records provider acceptance and manual visibility separately; it does not claim recipient receipt without observation.
- [ ] Unknown delivery/cancellation cases have no automatic retry and no infinite model loop.

## STOP conditions

Stop and report if any test needs live credentials, a non-synthetic recipient, raw provider/body logs, a model budget not supplied by an operator, configured-native send authorization, a browser action outside existing approval policy, or a new general-purpose evaluation runner. If any of those gates remains unavailable, merge only the safe inactive deterministic work and label epic activation OPEN/BLOCKED. Do not weaken semantic/provenance assertions to stabilize a flaky real-model result.

## Maintenance notes

Keep deterministic behavior, real-model judgment, browser rendering, provider acceptance, and recipient observation as separate artifacts. A future scenario can reuse the IDs and reporting fields here, but must not turn an unobserved level into a pass. Preserve all failed trials and avoid replacing a failing scenario with an easier prompt.

## Executor prompt

Implement this verification slice only after Plans 004–008. Read `docs/evaluation/completion-summaries.md`, existing runner docs, and every cited owning test before adding a case. Begin with deterministic RED, use synthetic fixtures, retain all raw artifacts, and keep paid/live cases blocked until an operator gives explicit budget and send authorization. Do not add a new eval framework, change production model settings, inspect private provider payloads, or claim delivery beyond the evidence level observed.
