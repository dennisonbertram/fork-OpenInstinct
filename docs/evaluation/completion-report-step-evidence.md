# Plan 006 step evidence: required completion report (issue #156)

Verdict: **all four steps are satisfied on `main`/this branch, within Plan
006's declared scope.** No source change was needed to settle this issue.
Everything below cites `path:line` against the current worktree; where a step
depends on a real-model or paid-budget gate, that dependency is named rather
than treated as done.

## Step 1 — RED decision matrix (RP-01..RP-08)

All eight scenarios exist as behavioral assertions (asserting rejected calls,
thrown errors, and actual tool presence — not shape checks):

| Case  | Assertion                                                                                                                               | Location                                                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RP-01 | owed report forces exact `send_message` tool choice                                                                                     | `tests/agent/tools/messaging-report-policy.test.ts:130`                                                                                                                                                                                    |
| RP-02 | no owed report → tool choice `required`, no tool named; pending-cohort case (two-worker, one terminal) → no obligation, no partial send | `tests/agent/tools/messaging-report-policy.test.ts:140`; `tests/agent/lib/completion-obligations.test.ts` (CO-01); `tests/agent/tools/messaging-report-policy.test.ts:398` (RP-11, a still-running cohort is not bound by a final message) |
| RP-03 | resolver drops `react_to_message`, keeps `send_message`; a reaction called anyway (RP-03b) throws and names the summary                 | `tests/agent/tools/messaging-report-policy.test.ts:178`, `:185`                                                                                                                                                                            |
| RP-04 | non-final (RP-04a), link-only (RP-04b), attachment-only (RP-04c) all rejected with a specific message                                   | `tests/agent/tools/messaging-report-policy.test.ts:200`, `:213`, `:230`                                                                                                                                                                    |
| RP-05 | pre-provider composition failure produces one bounded truthful fallback, not a loop                                                     | `agent/lib/tests/completion-fallback.test.ts` (cases FB-01 through FB-13; FB-03 in particular proves no fallback once a provider attempt is unconfirmed, `:106`)                                                                           |
| RP-06 | later explicit summary answers from retained evidence, admits no new work, is not re-reported                                           | `agent/lib/tests/later-summary-request.test.ts:75`, `:99` (data-retention layer — see caveat below); `tests/agent/instructions/completion-evidence.test.ts:123` (CE-01, the actual production wiring — see Step 3/4)                       |
| RP-07 | with nothing owed, `react_to_message` is still offered and succeeds                                                                     | `tests/agent/tools/messaging-report-policy.test.ts:269`                                                                                                                                                                                    |
| RP-08 | owed report does not override a settled delivery, `scheduled-report` mode, or a non-interactive channel                                 | `tests/agent/tools/messaging-report-policy.test.ts:150`                                                                                                                                                                                    |

Caveat: `RP-05` and `RP-06` are not literally spelled "RP-05"/"RP-06" in every
file (the fallback file uses its own `FB-*` numbering, and
`later-summary-request.test.ts` reuses `RP-06` inside a comment that cites the
spec ID). The behavior each is supposed to pin is present and exercised
either way; this is a naming-convention observation, not a coverage gap.

## Step 2 — narrow report-only policy

Landed and tested as a live guard, not just a plan intent.

- `agent/tools/messaging.ts:260` — `resolveModeValue(... interactive: reportOwed ? sendOnly : interactive ...)`: when a report is owed, the resolved tool set for the `interactive` mode is `{ send_message }` only; `react_to_message` is not offered at all.
- `agent/tools/messaging.ts:95-131` — `assertCanSatisfyOwedReport` is the executor-side guard: it rejects a reaction (`:111`), a non-`message` kind (`:116`), empty/whitespace text (`:121`), and `final !== true` (`:126`), each with a distinct thrown message, checked live from `reportPolicyForTurn`, not from tools captured at an earlier step.
- Proven behaviorally by RP-03/RP-03b/RP-04a-c above, including the case (RP-03b) where the tool was resolved before the obligation existed and the executor still catches it at call time.

## Step 3 — grounded composition context and pre-send fallback (the disputed step)

**The independent review is correct against current source. The execution
record's "not built" claim is stale, not wrong for its own moment.**

- The composition context is `agent/lib/completion-evidence-context.ts`, and it is consumed on every turn by `agent/instructions/35-completion-evidence.ts:41` (`completionEvidenceContext(turnId)` → returned as instruction content for `interactive` and `scheduled-report` modes).
- `agent/instructions/*.ts` are auto-loaded, ordered root instruction modules per this repo's own docs: `docs/AGENT_GUIDE.md:60` ("root instructions, split into ordered `*.ts` modules"). This is not a file sitting unwired; it is the mechanism every other numbered instruction file in that directory uses.
- `agent/lib/situation-view.ts` genuinely has **no production caller**. `grep -rn "situation-view" agent/ src/` (excluding `tests/`) matches only comments in the two files above referencing it; the only importers of `situationView` itself are `agent/lib/tests/situation-view.test.ts` and `agent/lib/tests/later-summary-request.test.ts`. Confirmed dead in production.
- Timeline: `plans/JORY_COMPLETION_HANDOFF_2026-09-11.md:367` was last touched by commit `f968863` ("Record the live run on the reinstated activation (#213)"). The composition context was added by commit `104071a` ("Give the model per-claim provenance on later turns, not just the first"), which its own message says is "Slice B of plan 017," merged into `main` as part of PR #219 (`79cf7e6`), which post-dates `f968863` in the branch history (`git log --oneline main` places `79cf7e6` before/newer-of `f968863`). The handoff's claim was accurate when written and was overtaken by later work in the same day without the handoff being refreshed again.
- Does it satisfy step 3's bar ("only bounded trusted facts... must not expose raw browser text, secrets, or unverified worker claims as fact")? Yes, by construction and by test:
  - Per-claim provenance labels (`confirmed` / `reported by the worker, not confirmed` / `recorded with no stated source`) — `agent/lib/completion-evidence-context.ts:112-118`, proven by `tests/agent/instructions/completion-evidence.test.ts:214` (CE-02) and `:234` (CE-03, a worker's own text saying "verified" does not change its label).
  - A hostile claim cannot forge a heading or steal another claim's provenance — `agent/lib/completion-evidence-context.ts:104-106` (`sanitizeClaim`), proven by `tests/agent/instructions/completion-evidence.test.ts:327` (CE-08).
  - One shared 6000-character budget across the whole rendered block, whole-claims-or-none — `agent/lib/completion-evidence-context.ts:61-63`, `:275-284`, proven by `:264` (CE-05).
  - The pre-send fallback (`agent/lib/completion-fallback.ts:29`) composes only from recorded facts via `completionReportText`, never from a live model call, and refuses to compose once a request may have reached a provider (`hasUnconfirmedProviderAttempt`, `:34`, proven by FB-03).

## Step 4 — preserve later substantive requests

What is proven deterministically:

- **Retained evidence reaches the model on a later turn, correctly labelled as prior/delivered work, not the current turn's.** `tests/agent/instructions/completion-evidence.test.ts:123` (CE-01) settles a cohort, delivers its report, then resolves the instruction for a **different**, later turn (`turn_2`) and asserts the delivered claim's text and provenance appear under "Prior work already reported earlier in this session." This is the real production path (Step 3's wiring), independent of `situation-view.ts`.
- **A delivered/settled objective is never re-obligated merely because it is asked about again**, and no new task is created to answer it: `agent/lib/tests/later-summary-request.test.ts:75` and `:99` prove this at the `completion-obligations`/`situationView` data layer — `reportableCohorts()` stays empty and `taskRecords` stays at one across three repeated asks.
- **A later user-initiated turn is never forced into a specific tool.** `agent/lib/completion-report-policy.ts:80-83` filters "owed" cohorts to the current turn's own cohort whenever `intent === "user_request"`, so an unrelated new user message (or the explicit follow-up question itself) never trips `must_report`; `agent/lib/delivery-guard.ts:44-46`'s comment states this directly ("An owed report must not force `send_message` as the first and only action of a new user request; the debt stays owed and is discharged later"). Proven by RP-02/RP-07/RP-09 above (`tools/messaging-report-policy.test.ts:140`, `:269`, `:394`).

What is **not** proven deterministically, by the plan's own design:

- Nothing in the reachable code structurally prevents a reaction-only answer, or a new worker dispatch, on the specific turn where the user explicitly asks "what happened?" There is no `later-summary-request.ts` classifier module; the file with that name is a **test** exercising the (unused-in-production) `situationView`/`recoveryProgress` data layer, not a runtime decision module. Nothing named "later summary request" or "substantive" exists as production code — only `agent/agent.ts` and `agent/instructions/content/**` (both off-limits to this task) carry the model-facing instruction to answer in words rather than react, and `docs/evaluation/completion-summaries.md:165` (case CM-04) is the only place that guarantee is checked, gated behind a real model.
- Plan 006 itself defers this exact guarantee to a real-model eval rather than a deterministic classifier: "Add a real-model negative control for a lightweight 'thanks' turn... do not make a brittle exact-phrase classifier" (`plans/006-required-completion-report.md`, step 4), and its verification section states `eval:agent` "is not a merge prerequisite without its operator gate" and remains "Plan 009-blocked." `docs/evaluation/completion-summaries.md:169` names CM-01–CM-06 as requiring an operator-supplied paid budget that is explicitly **TBD**.
- This is a documented, intentional deferral, not a silent gap: building a deterministic classifier here to "close" it would contradict the plan's own instruction against a brittle exact-phrase rule, and touching `agent/agent.ts` or `agent/instructions/` content to add such logic is explicitly out of bounds for this task (paid Square eval gate).

Minor accuracy note (not a functional gap, not fixed here): `docs/evaluation/completion-summaries.md:62` cites `agent/lib/tests/later-summary-request.test.ts` as covering RP-06 "at the unit layer." That citation is correct for the data-retention half of RP-06 but the file it names exercises `situationView`, which has no production caller (see Step 3). The claim that matters for production — that a later turn actually receives the evidence — is proven by `tests/agent/instructions/completion-evidence.test.ts:123` (CE-01) instead, which the existing doc does not cite for RP-06.

## Summary

| Step | Requirement                             | Owning file                                                                                                                        | Pinning test                                              | Not covered                                                                                                                                                                 |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | RP-01..RP-08 exist and are behavioral   | `tests/agent/tools/messaging-report-policy.test.ts`, `agent/lib/tests/completion-fallback.test.ts`                                 | see table above                                           | —                                                                                                                                                                           |
| 2    | narrow report-only policy               | `agent/tools/messaging.ts:95-131,260`                                                                                              | RP-03/03b/04a-c                                           | —                                                                                                                                                                           |
| 3    | grounded composition context + fallback | `agent/lib/completion-evidence-context.ts`, `agent/instructions/35-completion-evidence.ts:41`, `agent/lib/completion-fallback.ts`  | CE-01..CE-13, FB-01..FB-13                                | secret/PII redaction upstream of `BoundedFact.claim` is a different module's responsibility, not re-verified here                                                           |
| 4    | preserve later substantive requests     | `agent/lib/completion-report-policy.ts:80-83`, `agent/lib/delivery-guard.ts:44-46`, `agent/instructions/35-completion-evidence.ts` | CE-01, `later-summary-request.test.ts:75,99`, RP-02/07/09 | deterministic "no reaction-only / no re-dispatch" on the explicit-ask turn itself — intentionally deferred to real-model case CM-04, blocked on Plan 009's paid-budget gate |
