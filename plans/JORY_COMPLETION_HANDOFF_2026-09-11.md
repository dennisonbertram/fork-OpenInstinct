# Jory completion epic: session handoff, 2026-09-11

Status: **execution record**, written at the end of one overnight session. This
is what was implemented, verified, merged, and left undone. It is not a plan.

Repository: `dennisonbertram/fork-OpenInstinct`. Upstream was never touched.
Starting main: `ebcc0cc`. Ending main: `09937ea`.

## What merged

| PR                                                                    | Issue                                                                          | Merged at | What it does                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------- |
| [#166](https://github.com/dennisonbertram/fork-OpenInstinct/pull/166) | —                                                                              | `ebcc0cc` | The planning documents for both epics (docs only)                   |
| [#167](https://github.com/dennisonbertram/fork-OpenInstinct/pull/167) | closes [#154](https://github.com/dennisonbertram/fork-OpenInstinct/issues/154) | `09937ea` | Plan 004: a typed, authenticated background-task terminal result    |
| [#168](https://github.com/dennisonbertram/fork-OpenInstinct/pull/168) | toward [#155](https://github.com/dennisonbertram/fork-OpenInstinct/issues/155) | `e2559ab` | Plan 005's root completion state machine. **Does not close #155**   |
| [#170](https://github.com/dennisonbertram/fork-OpenInstinct/pull/170) | closes [#169](https://github.com/dennisonbertram/fork-OpenInstinct/issues/169) | `0b60921` | Cohort membership, so the root can see a task that has not finished |

`main` auto-deploys, and the operator authorised the release explicitly. All
deployment statuses reported success. That is a successful deploy, not evidence
that any of this behaves correctly in a live session; nothing exercised it with
real traffic.

Nothing merged so far changes Jory's behaviour. No production code imports
`completion-obligations` or `backgroundTaskMembers` yet. What the deployed runtime
does differently is carry two extra durable context keys per turn for a
tasks-enabled agent, each a self-healing per-turn projection.

## What is open

| PR                                                                    | State                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#171](https://github.com/dennisonbertram/fork-OpenInstinct/pull/171) | Fixes a real bug in #168's merged code: `retireCohort` would summarise a cohort as `completed` while one of its tasks had never reported, then drop the records proving it. Found by a scoped outside review, reachability confirmed against the code. |

Worktrees `.claude/worktrees/plan-004-terminal-adapter`,
`.claude/worktrees/plan-005-obligations`, and
`.claude/worktrees/pending-members` are spent once #171 lands and can be removed.

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

1. ~~#169 first.~~ Done in #170: `backgroundTaskMembers()` now reports every task
   the root owns and whether it has settled.
2. **#155's second half, the next real slice.** Register at `agent/agent.ts`'s existing
   `defineDynamic` `step.started` boundary: admit pending members, record
   terminals through `recordTerminal`, classify facts with
   `factsFromWorkerCompletion`. Require the compatible worker fields in
   `agent/subagents/browser-agent/instructions.md` and
   `agent/instructions/content/worker-coordination.md`. This slice **does**
   trigger `pnpm eval:square`; the operator has authorised that paid run, so
   include its `Results:` line.
3. **Then #156** (one required grounded native text report), which consumes only
   `reportableCohorts()` and must not mutate task evidence.
4. Plans 007–009 after that, in order. **Do not activate report forcing before
   007's settlement binding and the 008/009 gates.**

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
