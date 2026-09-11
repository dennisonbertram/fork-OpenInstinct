# Plan 003: Deliver one truthful completion summary for each settled interactive task cohort

GitHub: [#152](https://github.com/dennisonbertram/fork-OpenInstinct/issues/152).

> **Executor instructions:** This is the coordination plan for Plans 004–009. Do not implement this plan as a standalone runtime change. Read the dependent plan in full, perform its drift check, preserve its stop conditions, and keep the completion vocabulary below exact.
>
> **Drift check:** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent agent/channels src/lib/worker-events.ts tests evals docs/evaluation`

## Status

- **Priority:** P1
- **Effort:** L, delivered as six small PRs
- **Risk:** HIGH until Plan 004 proves the lifecycle seam
- **Depends on:** none
- **Category:** direction
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11
- **Related work:** reuse, do not reparent, #69, #70, #72, #74, #80, #82; inspect PR120, PR136, and PR138 for overlap before each slice.

## Outcome and non-goals

An interactive Jory request that delegates background work must eventually produce one concise native written summary when its authenticated worker cohort settles, unless the user has already received an exact accepted report for that obligation. A provider acceptance is distinct from recipient receipt; a worker result is evidence, not a verified claim; a cancellation does not erase an effect already dispatched.

This epic does **not** create a general task database, event lake, scheduler, prompt marketplace, model upgrade, or delivery retry system. Plan 007 alone may add its narrowly scoped, application-owned completion-report attempt record when its durable-seam probe fails; it is not a general task store. It does not alter scheduled-run leases, move browser tools, expand approval authority, or treat a reaction as a completion summary. It is runtime work planned here only; this document authorizes no source change or live message.

## Evidence at the planned revision

- `agent/agent.ts:17-70` enables Eve tasks and resolves the root model per `step.started`; it currently passes only same-turn final-delivery status to the delivery guard.
- `agent/tools/messaging.ts:19-121` currently exposes both `send_message` and `react_to_message` on an open interactive step. The native tool is the only user-visible textual delivery path.
- `agent/lib/message-delivery.ts:3-71` records a single exact `(turnId, callId)` final delivery as `pending`, `completed`, or `unconfirmed`; it intentionally blocks duplicate final attempts only in that turn.
- `node_modules/eve/docs/subagents/index.mdx:170-172` says the parent stream exposes control-plane child events and cascades parent cancellation. `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md:137-147` says interrupted step retries re-emit new event IDs for the same logical coordinates.
- The Eve runtime currently emits a framework-authored task cohort context in `node_modules/.pnpm/eve@*/node_modules/eve/dist/src/tasks/delivery-context.js:1-20`: initiating work gets a launch acknowledgement; a pending cohort explicitly suppresses partial reporting; a settled cohort asks for one combined response. Preserve this cohort behavior.

## Completion vocabulary and authority

| Dimension    | Meaning                                                             | Authority                                                    | Never infer from                   |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| execution    | an action was prepared, attempted, blocked, cancelled, or completed | executor/tool receipt and authenticated task terminal result | model prose alone                  |
| verification | trusted evidence supports a claim                                   | scoped observation/commit evidence                           | valid worker JSON or success label |
| reporting    | one completion summary is owed, blocked, delivered, or unconfirmed  | root durable obligation state                                | provider receipt                   |
| transport    | the channel accepted a specific report attempt                      | channel `action.result` bound to report call                 | recipient read receipt             |

A cohort is every background task authenticated as created by the same root parent turn. A receipt records only an accepted task identity. A terminal result may update that task only when its typed task/call/session identity matches. A cohort becomes reportable only when all registered members settle; a user’s later substantive status/summary request is a separate current turn and may report known evidence without restarting work. A cancelled cohort can still owe a truthful report of already dispatched effects or uncertainty.

## Required shared contract (proposed, not implemented)

```ts
type CompletionTask = {
  taskId: string;
  workerCallId: string;
  workerSessionId: string;
  parentTurnId: string;
  objectiveRevision: string;
  terminal?: TrustedTerminalEvidence;
};

type CompletionObligation = {
  cohortId: string;
  rootSessionId: string;
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

The proposal is scoped to root interactive `channel:eve`, `channel:linq`, and `channel:sendblue` sessions. `defineState` is root-session durable state, not child-shared or cross-session storage. Multiple cohorts and multiple task outcomes must remain separate. A user-supplied `Background task … Result:` string and `meta.id` alone are never lifecycle authority.

## Execution order

1. **004** proves or exposes the typed terminal adapter. Stop if the public Eve API cannot authenticate terminal task identity and output.
2. **005** adds compatibility-preserving task/cohort evidence and durable root obligations after 004.
3. **006** makes an owed report deterministic: only a final native text delivery can satisfy it.
4. **007** binds the report to exact channel settlement and preserves unknown-send no-retry semantics and scheduled leases.
5. **008** integrates one approval, cancellation, steering, continuation, and stale worker boundaries.
6. **009** adds deterministic, runtime, model, UI, and operator acceptance proof. It is the release gate, not evidence that a mocked unit test is live success.

## Global regression matrix

| ID    | Scenario                                         | Required oracle                                                                         |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| CR-01 | two workers, first terminal while second pending | zero native report until cohort settles                                                 |
| CR-02 | two terminal results                             | one report containing only grounded combined facts                                      |
| CR-03 | terminal replay/restart                          | one obligation transition and no duplicate send                                         |
| CR-04 | late old objective after steering                | no claim for the new objective; retained effect evidence remains reportable when useful |
| CR-05 | provider timeout/no handle                       | `unconfirmed`; zero automatic retry/fallback                                            |
| CR-06 | later explicit summary request                   | one new substantive native report; zero resubmission                                    |
| CR-07 | scheduled report                                 | existing claim/lease/sequence behavior unchanged                                        |
| CR-08 | approval cancelled after external dispatch       | no new execution; truthful attempted/uncertain statement if reporting is owed           |

All synthetic cases use designated fixtures only. Paid model budget and live-send budget remain **TBD** and require separate operator authorization.

## Definition of done for the epic

- [ ] Plans 004–009 land in dependency order with their RED-first evidence retained.
- [ ] Cohort settlement, task identity, evidence provenance, report attempt, and channel acceptance are independently inspectable in deterministic tests.
- [ ] A real-model regression proves the model cannot choose a reaction when a substantive completion report is owed.
- [ ] Browser-visible and authorised native-channel acceptance evidence are recorded separately from provider acceptance and recipient receipt.
- [ ] `pnpm check`, `pnpm build`, `pnpm eval:contract`, applicable `pnpm eval:agent`, and `git diff --check` pass for each implementation PR; Square is run only if its stated file gate is triggered.

## Program stop conditions

Stop the affected slice and report rather than inventing behavior if Eve cannot expose a typed terminal result, output must be scraped from notification prose, an identity cannot link the terminal result to root/cohort/objective revision, a proposed storage span exceeds a root session **except the narrowly scoped Plan 007 report-attempt record**, or a change would weaken approval, tenant, root-session, secret, or provider boundaries.

## Executor prompt

Implement **only when assigned through the documented handoff** the next dependency-ready plan from this epic in an isolated worktree. Start by reading that plan, `AGENTS.md`, `docs/AGENT_GUIDE.md`, and the cited Eve documentation. Preserve task cohort semantics and existing channel/approval boundaries. Obtain its named behavioral RED before source edits; use synthetic data; do not send messages, deploy, add dependencies, or change unrelated state. Report changed paths, exact command outputs, scenario IDs, unverified evidence levels, and STOP conditions to the lead. Follow the repository release policy for normal commits, PR, CI, review, and merge once the assigned slice is complete; this document itself is planning only and authorizes no runtime implementation.
