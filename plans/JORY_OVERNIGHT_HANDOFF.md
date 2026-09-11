# Jory overnight handoff (proposed)

Status: **Proposed execution handoff**, dated 2026-09-11. This document is a
self-contained prompt for a fresh implementation agent. The copy/paste prompt
authorizes scoped implementation and normal commit, push, PR, CI, review, and
merge work under repository policy. It does not authorize new live provider
sends, Gmail access, secret changes, or paid budget beyond a separately scoped
operator decision.

## Copy/paste goal prompt

Start from [completion epic #152](https://github.com/dennisonbertram/fork-OpenInstinct/issues/152) and [operating-model epic #153](https://github.com/dennisonbertram/fork-OpenInstinct/issues/153). Their twelve child issues contain the full per-PR scope and acceptance criteria; the [execution map](README.md#github-execution-map) links every issue. First dependency-ready implementation: [typed terminal adapter #154](https://github.com/dennisonbertram/fork-OpenInstinct/issues/154).

Work only in `dennisonbertram/fork-OpenInstinct`. Start from the current main
checkout in a fresh linked worktree; use planned SHA
`c88b8e69325439d503374bf6796befd5f37a585f` as the drift baseline, not as an
instruction to revive an old branch. The goal is to implement dependency-ready PR-sized slices of Jory's truthful completion
reporting and agent operating model, in dependency order, while preserving
tenant, approval, channel, secret, and scheduled-run boundaries.

Start with Plan 004's public Eve terminal-boundary probe. Do not parse public
background-task prose, trust `meta.id` alone, or create root completion state
until a typed authenticated terminal result is proven. If the public surface
does not provide task identity, parent turn, child session, terminal status,
and typed output, stop and report the missing field. A narrow version-matched
Eve adapter may be drafted and tested through a normal PR review; do not merge
it until the required review and repository gates pass.

After 004 passes, implement 005 and 006 as the essential completion milestone:
persist trusted per-task evidence in the existing root session and require one
substantive native written report for a settled cohort. Continue through 007
and 008 only when each preceding contract is green. Plan 009 is the acceptance
and release gate. Plans 010–016 are a separate operating-model epic and may be
implemented in bounded slices after coordination; do not claim both epics fit
one night. Plans 004–006 alone are not a releasable completion fix; do not
activate the behavior before 007 settlement and the 008/009 gates. Future
estimates are engineering estimates in days, not a promise.

Use inexpensive agents by default: Luna for bounded implementation and review,
Terra only when lifecycle ambiguity, cross-module contracts, or a sensitive
boundary requires deeper reasoning. Use at most three agents in a wave. Check
the user usage instruction before and between waves; stop when approaching the
limit, record the current status, SHAs, paths, commands, remaining budget, and
reset state, and resume only after the usage window permits it. Do not pretend
that a host budget tool is available.

## Current failure and design contract

The dated synthetic live feedback observed actual images and one approved
synthetic submit. The automatic root response produced only a reaction; the
first explicit summary question also produced only a reaction; a second
explicit request using words produced a summary. This is a qualitative failure
example, not a success rate. A substantive completion obligation must not be
discharged by a reaction. A launch acknowledgment may say work is pending; a
settled cohort should produce one combined report, with evidence retained per
task. An explicit status request may return truthful current status.

The authoritative design is
[JORY_AGENT_OPERATING_MODEL.md](../docs/JORY_AGENT_OPERATING_MODEL.md). It
requires source-of-truth owners and bounded projections, separate execution,
verification, reporting, and delivery states, explicit evidence freshness, no
semantic guarantee from JSON or terminal labels, one native approval for exact
terms, no automatic resend after an uncertain write, and no model-authored
authority. Web chat, SendBlue, and future iOS are clients of the same
server-owned lifecycle; do not fork client-side task state.

The current implementation remains the authority for behavior. Hooks are
observe-only, dynamic instructions provide context, and Eve stream event IDs
are not replay-stable semantic idempotency keys. The public background terminal
event is a receipt until a typed authenticated accessor or reviewed adapter
proves otherwise.

## Waves, ownership, and dependencies

| Wave | Owner slice                                              | Required dependency      | Result                                                                                             |
| ---- | -------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| 0    | Fresh worktree, exact-head drift check, public Eve probe | None                     | Stop if identity or typed output is unavailable                                                    |
| 1    | Plan 004 terminal adapter                                | 003 contract             | Typed task, parent, child, status, and output evidence                                             |
| 2    | Plans 005–006 obligations and required report            | 004 green                | One cohort obligation, one substantive report, no reaction-only satisfaction                       |
| 3    | Plans 007–008 settlement and approval/steering           | 005–006 green            | Exact report binding, cancellation, resume, stale-result protection                                |
| 4    | Plan 009 acceptance                                      | 004–008 green            | Deterministic, runtime, model, UI, and operator evidence separated                                 |
| 5    | Plans 010–016 operating model                            | Coordinate independently | Situation view, capability readiness, affordances, recovery, reviewed learning, matched efficiency |

Each implementation slice owns one issue-linked PR and one narrow file set.
Reuse existing #67 infrastructure and relevant #69/#70/#72/#74/#80/#82
evidence. Reuse PR120 provenance and the existing conversation runner from
PR136 where useful; do not duplicate or automatically merge those open PRs.
PR138 remains negative no-speedup evidence only. Plan 008 owns the single
approval/cancellation/steering integration; do not create a generic approval
schema in another slice.

The new completion and operating-model epics are planned separately from the
older infrastructure epic. Link existing issues rather than reparenting them.
The missing bounded reviewer file `reviewers/surplus-astra.md` was not found
under the approved candidate paths; do not invent its requirements. Use normal
independent review until the lead supplies an authoritative copy.

## Required implementation and verification gates

Before any production source edit, write a meaningful behavioral RED at the
owning boundary. A compile failure, missing fixture, or harness setup failure
is not a RED. Keep positive, negative, failure, recovery, replay, stale
objective, and cross-scope controls. Preserve existing display compatibility
without fabricating verification for old records.

For every slice, run the narrow focused test first and preserve its raw output.
Before handoff, run the applicable deterministic five CI lanes and repository
gates:

- `pnpm check`
- `pnpm build`
- `pnpm eval:contract`
- `node scripts/test-real-postgres.ts` when database/concurrency scope applies
- `pnpm test:e2e` when route/browser behavior applies
- `git diff --check`

Run `pnpm eval:square` only when the changed paths trigger the repository's
Square gate. If an affected source PR has no approved paid budget, stop that
affected paid gate and report it blocked; never bypass it. Run paid
`pnpm eval:agent` only with an operator-supplied model, fixture, exact SHA, and
budget. The budget is TBD; invent no dollar amount.
Keep model-free, paid-model, browser-visible, channel-acceptance, and native
recipient evidence as separate claims. Do not merge red tests, bypass reviews,
or bypass unresolved review threads.

## What not to do

- Do not edit unrelated source, plans, docs, agent instructions, or UI files.
- Do not add a general database, event lake, scheduler, generic tool registry,
  autonomous skill marketplace, global done flag, or speculative abstraction.
  Plan 007 may add the smallest application-owned scoped completion-report
  attempt record or migration only if the Eve seam cannot durably claim each
  logical report revision and physical part before dispatch; it is not a task
  engine, outbox, scheduler, or universal exactly-once system.
- Do not use notification prose, raw page text, credentials, private payloads,
  provider handles, or model success labels as authority.
- Do not send live provider messages, connect Gmail, alter secret configuration,
  change tenant bindings, or run deployment as overnight defaults.
- Do not treat an existing live approval as blanket permission for new messages.
- Do not claim production readiness from local tests, health, a tool request, or
  provider HTTP acceptance.
- Do not force a completion report for the first unfinished member of a cohort.
- Do not automatically resend an action whose dispatch may have reached a
  provider, and do not use event IDs as action idempotency keys.

## Stop, recovery, rollback, and release

Stop and hand off when the worktree drifts incompatibly, ownership is
ambiguous, a required typed lifecycle field is unavailable, a cross-tenant
case is unclear, cleanup fails, a reviewer is unresolved, or a side effect
would exceed authorization. A red test or gate permits correcting the defect
within scope and rerunning the affected checks; preserve the original failure
and correction evidence. Do not retry paid or live trials until a lucky green
result, and never report only the best attempt. Record the exact command, raw
log path, SHA, changed paths, and remaining unknown.

Rollback is limited to the slice's own reversible code and documentation. Do
not reset or clean another agent's worktree. Preserve failed tests, abandoned
attempts, partial work, and evidence of uncertainty. Since main auto-deploys,
any future runtime merge must preserve the approved release hold or obtain
concrete release authorization from the lead; an overnight green CI run is not
deployment authorization.

## Handoff record required from each agent

Report the repository URL, planned and actual SHA, worktree/branch, changed
paths, issue/PR owner, exact RED and GREEN commands with raw log filenames,
five-lane CI results, conditional Square result, browser/provider/live status,
remaining unverified behavior, and rollback/cleanup state. State whether main
was untouched. The published issue map above is the coordination record; update it when a slice lands. The executor may commit, push, open, review, and merge its assigned PR
when required checks and reviews are green and the repository release policy is
satisfied.
