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

**Nothing merged today changes what a user sees.**
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

**#159 step 2** — a paid-run budget with model and fixture authorisation for
CM-01 to CM-06.

**#159 step 4** — bounded operator approval for one synthetic native acceptance
journey, with a named recipient, sender, budget and stop condition.

Without both, activation stays blocked however much machinery exists. Nothing
below the line changes that, and no amount of deterministic coverage substitutes
for it.

## Exact next steps

1. **#157 step 2: the channel call sites.** Everything it needs exists.
   `reportPartIdentityFor` gives the identity (undefined for ordinary messages,
   which is the ordinary case), `dispatchReportPart` owns the ordering, and each
   call site becomes a single wrap. Physical effects in SendBlue:
   `postSendblueReply` is `text`, `uploadSendblueFile` is a `media-upload` part,
   `adapter.getSdk().messages.send` is a `media-send` part whose provider handle
   is `response.message_handle`. `ReportPart` needs widening to carry ordinals
   for multiple media items. A media send must not begin before its upload part
   is accepted. This triggers the Square gate via `agent/channels/linq.ts`.
2. **Then CS-01 to CS-06 and AR-01**, which need those call sites to exist
   because they assert provider-call counts and ordering at a mounted channel.
3. **#163 step 3** — route the report through the existing completion/delivery
   owner. `recoveryProgress` is correct and has no caller.
4. **#156's grounded composition context** — read the existing projections
   first. A third projection over the same records would be a parallel
   representation, which `AGENTS.md` warns against.
5. Leave #161 and #165 alone until their sequencing decisions are made.

## Two environment notes

- The Compose healthcheck had no `start_period`, so both supervised database
  lanes failed locally on a cold volume while Postgres was still running
  `initdb`. Fixed in #186. If they fail again, read the container log before
  concluding the database is broken.
- `pnpm test:app -- <path>` does not filter to one file; it runs the whole
  suite. Use `pnpm exec vitest run <path>`.
