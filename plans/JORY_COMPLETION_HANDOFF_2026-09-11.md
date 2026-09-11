# Jory completion epic: session handoff, 2026-09-11

Status: **execution record**, rewritten at the end of the second session of the
day. This is what was implemented, verified, merged, and left undone. It is not
a plan.

Repository: `dennisonbertram/fork-OpenInstinct`. Upstream was never touched.
Starting main for the day: `ebcc0cc`. The earlier version of this file recorded
the first thirteen PRs and ended at `09937ea`; that account is superseded here
rather than appended to, because several of its conclusions turned out to be
wrong.

## The one thing to read first

**Forcing was activated, it failed in production, and it was reverted.** That
is the most important fact in this file and it is what the rest of it is about.

The activation merged at `0474ab3` and deployed. One real iMessage turn later,
the log showed the guard doing exactly what it was built to do -- refusing a
non-final message while a summary was owed -- and the message that actually
reached the phone was:

> i'm checking a public time source for Tokyo now.

It reported nothing about the settled work. It described work that had never
started: no `browser-agent` call appears in that turn or the next. And
`final: true` on it closed the turn, so a statement the records did not support
stood in for the completion report.

Reverted in #203. `completionReportForcingActive()` returns false again.

The lesson is not that the mechanism was wrong. The obligations, the durable
claim, the channel binding and the settlement all held. The lesson is that a
**shape** check -- kind, non-empty text, `final` -- cannot establish that a
summary was delivered, and handing the model grounded facts does not upgrade
that guarantee. An outside review put it exactly: the model was certifying its
own compliance. #204 takes that decision away from it.

**Nothing on `main` now changes what a user sees.**
`agent/lib/completion-report-activation.ts` returns `false`.
`reportPolicyForTurn()` therefore returns `none` for every real turn, no
obligation is ever bound, no claim is ever written, and no channel calls any of
it. That is deliberate: #159 forbids activating before its paid-model,
browser-visible, and native acceptance evidence exists, and that evidence needs
operator authorisation nobody has given.

So the milestone reached is **implemented contract coverage**, not a working
completion fix. Anyone reading the PR list as evidence that Jory now reports
truthfully would be reading it wrong.

## What merged today

Twenty-eight PRs across both sessions. The first thirteen (#166–#179) are in
git history; the later ones:

| PR   | What                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| #180 | Handoff refresh against what had landed                                        |
| #181 | One legal next step after background work stops short                          |
| #182 | Tell the worker how its result will be recorded                                |
| #183 | One reviewed procedure, and what its promotion must not erode                  |
| #184 | The reachable deterministic acceptance IDs, and which are not                  |
| #185 | Claim, record, then dispatch — the ordering a caller can get wrong             |
| #186 | Postgres healthcheck `start_period`, which unblocked two release gates         |
| #187 | The crash window through a synthetic adapter, call count as oracle             |
| #188 | `situationView` looked a cohort up by the wrong key                            |
| #189 | The report policy follows the obligation; settlement binds and settles         |
| #190 | `recoveryProgress` had the same wrong-key defect                               |
| #191 | A report revision, and the durable identity of one physical effect             |
| #192 | One place that owns claim-then-record-then-dispatch                            |
| #193 | A parked native approval, projected as this turn's pending input               |
| #194 | What exists between the records and a provider, and where it stops             |
| #195 | One truthful fallback when a summary could not be composed                     |
| #196 | The words a cancellation account may not use                                   |
| #197 | Settle from the call, not the delivery record; stop the fallback over-claiming |

Every one ran `pnpm check`, `git diff --check`, its own focused suite, and a
mutation check, with five green CI lanes. Two Square eval runs were authorised
and run for the `agent/agent.ts` change: `13 passed (13 total)` and `12 passed,
1 scored (13 total)`, **113 gates passed in both**.

## What exists between the records and a provider

Working outward from the database. `docs/evaluation/completion-summaries.md`
carries the same table with its owning files.

1. A durable claim with a transactional compare-and-swap, proven against real
   Postgres including contention and restart readback.
2. The ordering that must hold around it: claim, durably record the attempt,
   then dispatch. Holding a claim is not permission.
3. The crash window at each of the three fault points, driven through a
   synthetic channel adapter whose call count is the oracle.
4. Which cohort a final message answers, bound to its exact turn and call, and
   settled from that call when a provider result arrives.
5. Which attempt it is, as a revision a later turn cannot collide with.
6. The durable identity of one physical effect of one report.
7. One helper that owns the ordering, so no channel branch can forget it.
8. A parked native approval, and this turn's pending input.
9. One truthful fallback when the summary could not be composed at all.

**The last link is missing: no channel calls any of it.** `sendblue.ts` and
`linq.ts` dispatch exactly as they did before. That is #157 step 2, and it is
what CS-01 to CS-06 and AR-01 wait on, because those assert provider-call counts
and ordering at a mounted channel.

## What outside review caught that the tests did not

This is the part most worth carrying forward. Independent reviews found
**eleven real defects** in code written during these sessions, and the pattern is
consistent: not broken logic, but a label or sentence claiming more than the
records establish — several of them inside the functions written to prevent
exactly that.

In the approval store (#193):

- The record was kept by reference, so a caller could change **which action was
  authorised** after a person had been asked about a different one. `readonly`
  is a promise about a parameter's type, not about the caller's object.
- Extra properties survived, because a TypeScript interface does not strip them
  at runtime — a `secretToken` alongside the declared fields went into session
  state and back out through the accessors.
- Two tasks could share one request id, and then an authorised answer for one
  **retired the other task's unanswered question**.
- `NaN`, `Infinity` and `-Infinity` all encode as `null` in JSON, so three
  different terms produced one fingerprint. A serialisation collision, fatal to
  the one thing a fingerprint is for.

In the fallback and the delivery settlement (#197):

- Settlement read the per-turn delivery record, which `beginFinalDelivery`
  replaces unconditionally — so a provider result arriving after a later turn
  began left its obligation at `delivery_pending` forever: not delivered, not
  owed, invisible.
- The fallback's single allowance was spent at composition rather than delivery,
  so a caller that composed and abandoned delivery left settled work with no
  report and no way to produce one.
- "I have not tried again" asserted a retry history nothing inspected.
- An unknown-provenance fact was introduced as "Reported by the worker", which
  invents a source.
- The fact budget was per section, allowing six facts under a ceiling of three.

And two latent defects found by looking for a repeated pattern rather than by
review: `situationView` (#188) and `recoveryProgress` (#190) both looked a
cohort up by `objectiveRevision` when cohorts are keyed by parent turn. In
`recoveryProgress` every disposition collapsed to `awaiting`, so a root whose
work had finished and gone wrong would have been told to keep waiting.

Both were unreachable in production for the same reason everything here is:
`reconcileBackgroundTasks` currently passes `objectiveRevision:
member.parentTurnId`, so the two identifiers are equal today. They diverge as
soon as #158's steering work supplies a distinct revision.

## What the live run taught that no test had

Three things, none of which any deterministic suite had surfaced.

**A shape check invites the model to satisfy the shape.** Every case in the
matrix asserted the guard rejected the wrong shapes. None asked what the model
would send once it learned which shape was accepted. It sent a progress note
with `final: true`.

**Reading a log is not observing a behaviour.** The trace showed a rejection
followed by an accepted send and I reported the activation as working. The
operator's screenshot showed what had actually been delivered. The log recorded
that a message was accepted, never what it said -- the same blind spot as the
guard, one layer up.

**Activation surfaces a backlog.** A summary was still owed on the next turn.
Several cohorts can be owed at once and each turn discharges at most one, so a
session with accumulated settled work will be forced to report on every turn
until the backlog drains. Defensible in principle; hostile in practice, and
nobody had looked at it because no test runs two turns of a real session.

## Three process lessons, paid for

**A mutation that does not apply looks exactly like one that was caught.**
Several mutation runs reported a survivor that was really a patch that never
matched. Verify the file changed before believing a result.

**Weak assertions pass for the wrong reason.** `expect(text).toContain("no")`
is satisfied by the word "not". A length ceiling is satisfied by a per-item
bound while an unbounded _count_ slips through. Two of my own cases passed
without testing what they were named for.

**`git add -A` puts the implementation in the RED commit.** It happened twice
and both histories had to be rewritten. Stage the files the commit is about.

## Where each issue actually stands

| Issue | State                                                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #154  | closed, legitimately: typed authenticated terminal                                                                                                                    |
| #155  | open; records and registration landed, nothing consumes them                                                                                                          |
| #156  | open; steps 1, 2 and the step 3 fallback landed. The grounded composition context is not built, and doing so would duplicate `situationView` rather than add anything |
| #157  | open; step 1 landed (#187), every piece of step 2 exists except the channel call sites                                                                                |
| #158  | open; step 2's storage landed, step 3 was already correct and is now pinned, **step 4 is not applicable** — see below                                                 |
| #159  | open; the deterministic portion landed. Steps 2 and 4 need operator authorisation                                                                                     |
| #160  | open; `pendingInput` now has an owner (#193). The objective summary and the selected route do not                                                                     |
| #161  | open; **both of its own STOP conditions trip** — see below                                                                                                            |
| #162  | closed                                                                                                                                                                |
| #163  | open; `recoveryProgress` exists and is correct. Step 3 needs a caller                                                                                                 |
| #164  | closed                                                                                                                                                                |
| #165  | open; **its STOP condition trips on #136** — see below                                                                                                                |

### #158 step 4 is not applicable

It asks to remove a duplicate prose confirmation after demonstrating one exists.
It does not exist. The instructions forbid one in three places and send
preparation straight to the native gate: `execution-safety.md:5`,
`interactive.md:20`, `interactive.md:40`, `interactive.md:57`. The step's own
text says to stop rather than collapse questions that were never duplicated.
#198 guards those directives against silent removal instead.

### #161's STOP conditions both trip

_"STOP if Plan 011's selected-route/task-revision API differs from this plan or
if either chosen owner lacks a safe status read."_

`situationView` has no selected-route field, and — the fatal half — there is no
root-readable browser prerequisite status. `requireWorkerScope` is an
authorization gate that throws unless the caller is a delegated worker, not a
readiness read, and creating a root-readable one would mean a root browser
connection, which `AGENTS.md` forbids. The Square owner read
(`findConnectionInstallation`) does exist and is root-callable.

### #165's STOP condition trips on #136

Not because of file overlap — that is almost nothing (#120 and #138 touch none
of this issue's files; #136 touches one). It is the other clause: #136, open and
green since 2026-09-05, supplies the whole conversation evaluation harness and
already records per-turn tool calls, step counts, elapsed time and
request-limit overruns. Its baseline is also pinned to a specific model with an
uncalibrated judge, which is the mismatched-criteria case the issue forbids
measuring against. Sequencing #136 is the decision, not implementation here.

## What needs the operator, not more code

**A second native run, before any reactivation.** The recipient, sender, budget
and stop rule are recorded in `docs/evaluation/native-acceptance-journey.md`,
along with the result of the first run. The operator has authorised repeated use
of their own number.

**#159 step 2** — the paid CM-01 to CM-06 trials still need a local synthetic
fixture that does not exist. The cases specify "the existing local fixture's
synthetic customer/comment fields"; the browser evals run against real sites.
Building that fixture is real work, not a run, so a budget alone does not
unblock it.

**A decision on #205** — whether always-available tools for routine lookups are
the answer to Jory announcing work it never started, or whether a structural
check is. That is a product decision.

**A decision on #136** — sequencing it unblocks #165.

## The browser gate: what is actually blocking it

Plan 009 step 3 needs a settled worker cohort in the end-to-end environment,
and the obstacle turned out to be structural rather than a matter of effort. It
was worth finding out by building the thing rather than by reasoning about it.

The Playwright harness itself works. `tests/e2e/` already runs the real app with
`EVAL_CONTRACT_FIXTURE=1` and `KERNEL_API_KEY` set, and a journey spec drives it
end to end. Use `PLAYWRIGHT_PORT` if something already holds 3000.

Three routes are closed:

**The mount harness runs its own agent.** `evals/contract/mount-harness/agent/`
is a separate minimal agent, not Jory's, so a contract eval cannot exercise the
real root delegating to the real worker.

**A subagent's model cannot be swapped inside its resolver.** Attempting it
produced, at runtime: `Dynamic model selection returned a provider object, but
durable model selections must be serializable.` The subagent is then omitted
from the model-visible surface entirely, silently. This was merged as #206 and
reverted in #208.

**`step.started` is not available to fix it.** The runtime error suggests that
resolver, but `node_modules/eve/docs/subagents/index.mdx` says resolvers run at
`session.started` or `turn.started` and "step.started is not supported for
subagents". The root works because it is not a subagent.

One route remains open, and it has a real cost:

**A static agent config may hold a direct provider.**
`node_modules/eve/docs/agent-config.md` says a config containing a
direct-provider `LanguageModel` "remains a runtime entry because eve must
resolve that authored value while the agent runs". The serialization constraint
applies to configs a _resolver returns_, not to authored static ones. So a
browser-agent whose model is set statically could hold the fixture.

The cost is that `agent/subagents/browser-agent/agent.ts` currently builds its
`defineAgent` inside a `turn.started` resolver in order to gate the worker by
mode through `resolveModeValue`, and `model` is required in that returned
config. Taking the model out means restructuring how the worker is defined and
moving the mode gating somewhere else -- a change to production delegation made
to suit a test. That is a design decision, not a mechanical edit, and it should
be made deliberately rather than at the end of a long session.

If that restructure is unattractive, the other direction worth considering is
settling a cohort in end-to-end without a live worker at all. Note that Plan 009
step 1 forbids fabricating event state in runtime source, so a test-only route
that admits a synthetic task is not a way around this.

## Exact next steps

1. **Do not reactivate until the browser journey exists.** Forcing was switched
   on once today on the strength of a deterministic matrix and a green log, and
   the first real turn produced a false completion report. The matrix did not
   catch it because no case asked what the model would send once it learned
   which shape was accepted.
2. **Finish the browser journey.** #206 removed the blocker: the worker now runs
   on the contract fixture under `EVAL_CONTRACT_FIXTURE`, so a cohort can settle
   without a paid model or a live browser. Two pieces remain. First, a fixture
   path where the root delegates and the worker settles -- no contract eval
   delegates to a worker today, so `call browser-agent {...}` is unproven.
   Second, the Playwright case: submit a request, settle the cohort, reload, ask
   "What was the result? Please summarize it. Do not submit again.", and assert
   one visible text message, no reaction-only terminal response, no extra worker
   call, and persisted history.
3. **Then repeat the native run** against the fixed renderer and read what
   arrives on the phone, not what the log says was accepted.
4. **Then, and only then, reactivate** -- the change is one function, and #201
   is the shape of it.
5. **Look at the multi-cohort backlog before reactivating.** Several owed
   cohorts force a report on every turn until they drain. Nobody has decided
   whether that is right.
6. Leave #161 and #165 alone until their sequencing decisions are made.

## Two environment notes

- The Compose healthcheck had no `start_period`, so both supervised database
  lanes failed locally on a cold volume while Postgres was still running
  `initdb`. Fixed in #186. If they fail again, read the container log before
  concluding the database is broken.
- `pnpm test:app -- <path>` does not filter to one file; it runs the whole
  suite. Use `pnpm exec vitest run <path>`.
