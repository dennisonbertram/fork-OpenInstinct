# Jory completion epic: session handoff, 2026-09-11

Status: **execution record**, written at the end of one overnight session. This
is what was implemented, verified, merged, and left undone. It is not a plan.

Repository: `dennisonbertram/fork-OpenInstinct`. Upstream was never touched.
Starting main: `ebcc0cc`. Ending main: `09937ea`.

## What merged

`main` at `5e04497`. Thirteen PRs, each with a red→green trail, mutation checks,
and five green CI lanes.

| PR   | Issue       | What                                                    |
| ---- | ----------- | ------------------------------------------------------- |
| #166 | —           | Planning documents for both epics                       |
| #167 | closes #154 | Plan 004: typed, authenticated background-task terminal |
| #168 | toward #155 | Root completion obligation records                      |
| #170 | closes #169 | Cohort membership, so a pending sibling is visible      |
| #171 | —           | Fix: never summarise a cohort whose task never reported |
| #172 | —           | Handoff correction                                      |
| #173 | toward #155 | Admission on what the root can actually know            |
| #174 | toward #155 | Registration at the root step boundary                  |
| #175 | toward #156 | Report forcing mechanism, inactive                      |
| #176 | toward #157 | Durable pre-dispatch claim for each report part         |
| #177 | toward #158 | Approval bound to the action it authorised              |
| #178 | toward #160 | Bounded situation view                                  |
| #179 | closes #162 | Truthful message for an undrivable control              |

### Nothing merged changes what a user sees, by design

No production code forces a report, binds a report to a channel, or reads the
situation view. `completionReportForcingActive()` returns false. The deployed
runtime differs only in carrying a few self-healing per-turn context projections
and holding an unused table.

Activation is blocked by the epic's own release policy until Plan 009 (#159) has
authorised paid, live-send, and browser evidence. **That authorisation is the
operator's and cannot be self-issued.** Flipping
`agent/lib/completion-report-activation.ts` is the whole activation switch.

All deployment statuses reported success. That is a successful deploy, not
evidence that any of this behaves correctly in a live session; nothing has
exercised it with real traffic.

## Where each issue actually stands

| Issue                           | State                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #154 typed terminal             | **closed**                                                                                                                                              |
| #155 obligations + registration | implementation complete across #168, #173, #174; open for the worker-field requirement                                                                  |
| #156 required report            | mechanism merged in #175, **inactive**; grounded composition and the real-model eval remain                                                             |
| #157 report claim               | record merged in #176; channel binding remains                                                                                                          |
| #158 approval                   | identity merged in #177; cancellation truthfulness, channel seams, and duplicate-prose removal remain                                                   |
| #159 acceptance                 | **not started** — needs authorised paid/live/browser evidence                                                                                           |
| #160 situation view             | **reopened**: five of seven declared fields shipped. Objective summary, pending input, and selected route are absent, each for want of an owner to read |
| #161 capability readiness       | **blocked by its own drift check** — it names Plan 011's selected-route API, which does not exist                                                       |
| #162 browser affordances        | **closed** by #179                                                                                                                                      |
| #163–#165                       | not started                                                                                                                                             |

## What review caught that tests did not

Five scoped outside reviews, one function at a time. A whole-file review of the
obligations module timed out and returned nothing, which is why the scoped form
is the one to use.

| Found                                                                                                   | Where                                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `retireCohort` summarised a cohort as completed while a task had never reported                         | fixed in #171                                                                     |
| The insert-race fallback called an accepted part uncertain                                              | fixed inside #176                                                                 |
| Four fingerprint collisions: delimiter forgery, absent vs empty token, number vs digits, lone surrogate | fixed inside #177                                                                 |
| `priorEvidence` was unattributable to its objective                                                     | fixed inside #178                                                                 |
| My own claim that the projection could not leak secrets was false                                       | corrected in #178: text is bounded, and the module says bounding is not redaction |

## Two failure modes worth carrying forward

**A mutation that does not apply looks exactly like one that was caught.** Twice,
perl patterns still matched a pre-rewrite shape and reported false survivors.
Re-target mutation scripts after any refactor, and treat an unexpected survivor
as "did it apply?" before "is it redundant?".

**An empty output file is not a clean review.** A waiter keyed on file
non-emptiness fired while an unrelated line was the only content. Wait on process
liveness.

## What is open

| Branch / PR | State                                  |
| ----------- | -------------------------------------- |
| —           | Nothing open. All thirteen PRs merged. |

Worktree `.claude/worktrees/admission-contract` holds the working checkout; all
earlier worktrees were removed.

## Plan 004, as built

The public Eve surface could not provide a typed terminal result. Recorded
against a clean `npm pack eve@0.49.0`: `eve/context` exports only `defineState`,
nothing under `dist/src/public/` mentions task terminal state, and
`defineState("eve.tasks")` throws on the reserved prefix. The typed index exists
but lives on `HarnessSession.state`, which authored code cannot reach, and the
only public signal is the runtime's rendered `[Task state]` prose — which the
plan forbids parsing.

So the conditional patch route was taken. The registered `eve@0.49.0` boundary
went from eleven files to fourteen:

- `dist/src/tasks/terminal-projection.{js,d.ts}` (new) — the projection and
  `readBackgroundTaskTerminals()`.
- `dist/src/execution/workflow-steps.js` — one added call where `turnStep`
  already derives task-delivery context from the same session state.
- `dist/src/public/context/index.{js,d.ts}` — the re-export.

It publishes no `taskInboxToken`, no child stream history, and changes no task
delivery prompt, retry, approval, tenant, or channel behaviour. It is a per-turn
projection, not storage: a framework-only process that deserializes without
loading authored code drops its copy and the next turn re-derives it.
`docs/EVE_PATCHES.md` records the row, the dated RED, and that property.

An outside review found the projection handed back the framework's own
`lastOutput.data` object, so a caller could mutate durable session state through
a read-only evidence API. Fixed at the application boundary in `6941ba0`: the
adapter clones the output, pinned by a regression.

## Plan 005, as built and as stopped

`agent/lib/completion-obligations.ts` keeps, in the root session only, which
tasks were admitted to which cohort, what each terminally produced, and whether
one summary is owed. RED `408c09c` (`29 failed | 6 passed`), green `a76f6a0`
(`36 passed`). Five mutations were applied and reverted; four were caught, and
the fifth proved a "first terminal" replay flag was dead code, so it was deleted
— the cohort phase guard alone makes promotion once-only.

It stopped short of the root registration because of
[#169](https://github.com/dennisonbertram/fork-OpenInstinct/issues/169): the
Plan 004 projection omitted entries without a `terminalView`, so it showed
settled tasks only. A root reading it could not see that a sibling was still
running, and so could not tell "one of two finished" from "the only one
finished" — CR-01/CO-01, the case that must not produce a premature report. It
also could not admit a task before dispatch, because a task was invisible until
it settled.

Wiring the state machine to a projection that cannot answer that question would
have produced exactly the premature report this epic exists to prevent, so the
slice was split instead. #170 then closed that gap, so the registration is
unblocked.

One bug escaped into #168 and is fixed in #171: `retireCohort` computed its
outcome from the tasks that had reported, ignoring any that had not, so a
delivered cohort holding an unsettled member retired as `completed` and dropped
the detail. A scoped outside review of that one function found it; a whole-file
review of the same module had timed out and returned nothing, which is why the
scoped pass was worth running. Review the module one function at a time.

## Exact next steps

1. **#159 is the gate everything waits on, and it needs you.** Authorised paid
   model, live-send, and browser evidence. Without it the completion behaviour
   stays inactive no matter how much machinery exists, because the epic forbids
   activating before that evidence. Nothing below changes that.
2. **#157's channel binding.** Bind a composed report to exact channel settlement
   through the merged `completion_report_attempts` record: claim the part, CAS to
   `attempted` before the provider call, record acceptance after. Touches
   `agent/channels/linq.ts` and `agent/channels/sendblue.ts` at their existing
   seams, and triggers the Square gate.
3. **#158 steps 3–4.** Cancellation truthfulness ("cancelled after dispatch" vs
   "without dispatch" vs "outcome uncertain") read from that record, then the
   duplicate-prose removal — which requires _first_ demonstrating with a failing
   test that an instruction asks an equivalent prose confirmation. Do not edit an
   instruction without that demonstration.
4. **#160's three missing fields**, each of which needs an owner first: pending
   input lives in the channel lifecycles, selected route has no owner at all, and
   an objective summary must not be authored by the projection.
5. **#161 stays blocked** until #160 gains a selected-route field with a real
   owner, or the plan is rebased onto whatever records route selection.
6. **#163–#165** are unstarted. #163's own STOP conditions do not trip: Plan 005
   exposes a typed outcome envelope with per-fact provenance, and no recovery fact
   depends on notification text.

## Gates, and what each one actually proves

Every slice ran `pnpm check`, `pnpm build`, `pnpm eval:contract`, and
`git diff --check`, all green, plus its own focused suite and a mutation check.
CI ran all five lanes on #167 green.

`pnpm eval:square` was **not triggered** by either PR — no changed path is in the
repository's Square gate list. The authorisation for that paid run is unused and
carries forward to step 2 above.

Nothing here is live evidence. Every case is deterministic and synthetic. No
provider message was sent, no Gmail connected, no secret changed, no paid model
eval run. The projection's behaviour under a genuine background dispatch, and
under an interrupted-step retry in the live runtime, remains unproven by
anything but the framework's own index schema and these fixtures. Plan 009 is
still the acceptance gate.

## Two environment notes for the next session

- A worktree created with `git worktree add` rather than `EnterWorktree` gets no
  `.env.local`, and `pnpm build` then fails inside `src/lib/application-origin.ts`
  and `src/env.ts` rather than on anything you changed. Copy `.env.local` from the
  main checkout.
- `pnpm test:app -- <path>` does not filter to one file; it runs the whole suite.
  Use `pnpm exec vitest run <path>`.
