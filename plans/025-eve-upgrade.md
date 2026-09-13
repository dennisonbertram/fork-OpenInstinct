# Plan 025: Upgrade Eve from patched 0.49.0 to a probed 0.54.x target

GitHub: [#248](https://github.com/dennisonbertram/fork-OpenInstinct/issues/248).
Related: #214 (lost wake, open), #246 (child-delivers, open, blocked),
#218 (closed), PR #221 (closed).

> **Executor instructions:** This is a dependency upgrade with a security
> patch that must survive it. It is **not** the product fix for "the user
> never hears back after browser work". Codex Astra's idea review and a
> tarball probe of `eve@0.54.3` agree: the lost-wake path is unchanged from
> 0.49.0, and none of the three seams this repository added to `eve/context`
> and `eve/tools` exist unpatched. The target also changes the on-disk task
> index format and throws on the old shape, so the bump has a live-session
> migration question that must be answered before it merges. Treat every
> changelog line as a claim until Slice 0 confirms it against an installed,
> unpatched target. Do not combine the bump (Slice 1) with a
> completion-obligation redesign or with child-delivers (#246). Slice 4 is
> blocked and is not implemented in this plan. Use a topic worktree and one
> PR per slice; wait for required CI and merge when green. Do not edit
> `plans/README.md` here; index it in a follow-up. Never publish exploit
> details for the auth hunk.

> **Drift check (run first):**
> `git diff --stat 798cdd8..HEAD -- package.json pnpm-workspace.yaml pnpm-lock.yaml patches/ docs/EVE_PATCHES.md tests/unit/eve-patch-boundary.test.ts tests/unit/eve-dynamic-rebind.test.ts tests/unit/eve-stream-cancellation.test.ts tests/unit/eve-turn-completion.test.ts tests/unit/eve-turn-origin.test.ts tests/unit/conversation-deployment-continuity.test.ts tests/agent/channels/eve-channel-auth.test.ts evals/contract/fixtures/demo-extension/package.json evals/contract/mount-harness/package.json agent/agent.ts agent/lib/background-task-terminal.ts agent/lib/completion-obligations.ts agent/lib/completion-report-policy.ts agent/lib/message-delivery.ts`
> and `npm view eve version dist-tags.latest`.
> STOP and re-run Slice 0 if `patches/eve@0.49.0.patch` is gone or renamed,
> if the selected target's published tarball digest changed, or if any
> `agent/lib` file above changed the symbols it imports from `eve/context` or
> `eve/tools`. A newer npm `latest` triggers review; it does not automatically
> invalidate recorded probe evidence.

## Status

- **Priority:** P1. The completion epic's browser path is capped by the
  framework (`plans/README.md:138-147`), and every framework fix, upstream or
  ours, lands on a release newer than 0.49.0.
- **Effort:** M–L across five slices. Slice 0 is half a day. Slice 1 is one to
  two days because three hunks need re-derivation, not a mechanical rebase.
  Slices 2–5 are each a day or less.
- **Risk:** MED. The patch touches minified `dist/` files whose anchors moved
  (`harness/tool-loop.js`, `execution/workflow-steps.js`) or whose file was
  renamed (the Workflow framed-stream chunk). The auth hunk is a fail-closed
  security control and must not lapse for a single commit.
- **Depends on:** nothing merged. Slice 4 depends on the #246 decision
  (child-delivers) already taken on 2026-09-13.
- **Category:** dependency, security patch, tests, docs, investigation
- **Planned at:** commit `798cdd8`, 2026-09-13. Tarball probe run the same day
  against `npm pack eve@0.54.3` and `npm pack eve@0.49.0` extracted outside
  the repository.

## Why this matters

After Jory delegates browser work, the user often never hears back. The
investigation at `docs/investigations/background-task-settlement.md` proved
from 0.49.0 source that a child's terminal reaches the parent through exactly
one at-most-once wake (`wakeTaskParentStep` → `resumeSessionInbox`), that Eve
swallows a gone target with a warning and no retry, and that authored code can
read only the cached projection this repository patched in. #218 found no
public seam to wake a turn that owes a report. #246 chose child-delivers and
then STOP'd because 0.49.0 offers no child-posts-to-user seam either.

Upgrading is the only way any framework change reaches this product, and the
patch register (`docs/EVE_PATCHES.md`) already says every hunk is a temporary
exception with a removal gate against "a fresh unpatched install". But the
upgrade must be judged on two separate outcomes, and this plan keeps them
apart:

- **Outcome A — a more reliable parent wake.** Verdict from source: **not
  delivered by 0.54.3.** See "What the tarball probe found". For an upgrade
  to close #214, Astra's idea review required all four of: the terminal
  result survives independently of the notification; a lost notification can
  be retried or recovered even when the original inbox token is dead;
  recovery persists into the state authored code reads; and recovery starts
  delivery without another user message. 0.54.3 satisfies none of those.
  Slice 2 still measures production, because two changelog entries could
  matter in a deployed environment that source alone cannot rule in or out.
  The 2026-09-12 investigation also could not prove the #214 incident lost
  its wake versus failing before commit or hitting admission refusal; do not
  treat that incident as a closed causal proof.
- **Outcome B — a seam for child-delivers.** Verdict from source and docs:
  **unchanged.** 0.54.3 still has no framework API for a child to post to
  the user's conversation; its own guidance for "post without a model turn"
  is to call the provider API from application code with an application-owned
  outbox (`docs/patterns/durable-cross-channel-notifications.md` in the
  package). The child still inherits `initiatorAuth`, exactly as in 0.49.0.
  So #246's blocker is a repository question about conversation identity, not
  a version question, and Slice 4 keeps it out of the bump. `task.postMessage()`
  is an explicit **parent wake**, not an outbound user post.

## Current state

### What exists (files opened and confirmed at `798cdd8`)

| Concern                     | Owner                                                                                                                                                                                                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pin                         | `package.json:37` `"eve": "^0.49.0"`; `pnpm-workspace.yaml:33` `eve@0.49.0: patches/eve@0.49.0.patch`; lock records `patch_hash=eb8df92f…`                                                                                                                                        | Peer `ai` is `^7.0.79` in `package.json:28`, `7.0.83` in the lock. 0.54.3 declares peer `ai: ^7.0.93`, so the bump pulls an `ai` bump with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Installed copy              | main checkout `node_modules/eve/package.json` = `0.49.0`; this planning worktree has no `node_modules`                                                                                                                                                                            | Every install-level probe below needs `pnpm install --frozen-lockfile` in an implementation worktree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Patch                       | `patches/eve@0.49.0.patch`, 288 lines, 20 `diff --git` entries                                                                                                                                                                                                                    | File list pinned by `tests/unit/eve-patch-boundary.test.ts:11-72`, which also asserts the auth wrappers, the export redirects, `u.has(e.resolverSlug)`, `requestTurnCompletion`, `consumeTurnCompletionRequest`, `readBackgroundTaskTerminals`, `readBackgroundTaskMembers`, `setSessionTaskTerminals(l,c.state)`, `DynamicTurnOrigin`, `TurnTaskDeliveryKey`.                                                                                                                                                                                                                                                                                                                                                                                            |
| Register                    | `docs/EVE_PATCHES.md`                                                                                                                                                                                                                                                             | Seven named eve rows: route auth, Linq/Chat compiled exports (three files), Workflow framed-stream cancellation, dynamic callback rebind, final-delivery completion request, task-terminal projection, typed turn origin. Each names its proof test and removal gate. Says the security fix "should be disclosed to Eve's maintainers through a private channel before an upgrade". **The inventory is incomplete:** the same patch also preserves unknown durable context (`setOpaque` in `dist/src/context/container.js` / `serialize.js`) instead of dropping it. `docs/EVE_PATCHES.md:87-90` still says unknown keys are dropped; that paragraph is stale. Active proof is `tests/unit/conversation-deployment-continuity.test.ts` CDC-01 and CDC-02. |
| Contract pins               | `evals/contract/fixtures/demo-extension/package.json:35` and `evals/contract/mount-harness/package.json:9` both pin `"eve": "0.49.0"`                                                                                                                                             | Updating only the root manifest leaves the contract system on the old runtime. Slice 1 owns these pins and must rebuild the artifacts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Policy                      | `SYNC.md:40-41`                                                                                                                                                                                                                                                                   | "Eve package upgrades are a separate dependency change. Review `docs/EVE_PATCHES.md` on every Eve upgrade."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Agent config                | `agent/agent.ts:24-27` `experimental: { instrumentationProviders: true, tasks: true }`                                                                                                                                                                                            | The `step.started` resolver calls `reconcileBackgroundTasks` and reads `ctx.turn?.origin` (`agent/agent.ts:47-58`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Authored consumers of hunks | `agent/lib/background-task-terminal.ts:2-3` (`readBackgroundTaskMembers`, `readBackgroundTaskTerminals` from `eve/context`); `agent/lib/message-delivery.ts:1,137` (`requestTurnCompletion`); `agent/lib/completion-report-policy.ts:2,68` (`DynamicTurnOrigin` from `eve/tools`) | The repository does not compile against an unpatched Eve of any version: these imports do not exist upstream. This is why the bump PR must carry re-homed hunks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Removed-API exposure        | grep of `agent/`, `src/`, `scripts/`, `evals/`, `tests/` for `delegated(`, `task.send(`, `execution: "background"`, `TaskExec`, `task_update`                                                                                                                                     | No authored caller. Only Eve's own dispatch used `task.delegated()`, so its removal in 0.52.0 does not break authored code. `subagent.completed` consumers (`agent/hooks/scheduled-run-completion.ts:64`, `src/app/_lib/subagent-sessions.ts:28`, `src/app/(authenticated)/chat/[sessionId]/_lib/trace-view.ts:76`) keep reading `backgroundTask` as the dispatch receipt.                                                                                                                                                                                                                                                                                                                                                                                |
| Removal-gate tests          | `tests/unit/eve-stream-cancellation.test.ts`, `eve-dynamic-rebind.test.ts`, `eve-turn-completion.test.ts`, `eve-turn-origin.test.ts`, `eve-patch-boundary.test.ts`, `tests/agent/channels/eve-channel-auth.test.ts`                                                               | All except the auth suite import `node_modules/eve/dist/src/...` paths directly. The stream test hardcodes `compiled/_chunks/workflow/wait-until-BtySPYD0.js` and the `function mc(` / `const hc=` markers (`:5-16`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Verification lanes          | `scripts/verification/lanes.ts`: `checks`, `build`, `real-postgres`, `contract-evals`, `e2e`; `pnpm verify`                                                                                                                                                                       | `evals/contract/gateway-final-turn-red.eval.ts` is the "gateway final-delivery contract eval" the register names as the delivery gate for the completion hunk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Extensions                  | no `agent/extensions/` directory; `@vercel/connect@2.0.0` peer `eve >=0.13.7`; `evlog@2.27.1` peer `eve >=0.30.0`                                                                                                                                                                 | 0.50.0 says extensions built against older capability contracts "must be rebuilt and republished". Whether `@vercel/connect/eve` counts is open question 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Published releases (npm, read 2026-09-13)

`latest` is `0.54.3` (2026-09-11). Sixteen releases sit between it and
`0.49.0` (2026-09-02): 0.49.1, 0.50.0, 0.51.0, 0.51.1, 0.52.0–0.52.5, 0.53.0,
0.53.1, 0.54.0, 0.54.2, 0.54.3. The register already records that 0.52.2 still
had the rebind path (`docs/EVE_PATCHES.md`, "Eve `0.52.2` still contains…").

### What the tarball probe found (0.54.3 vs 0.49.0, source, not an install)

Each row was confirmed by opening the extracted `dist/src` files. Items marked
**install** need Slice 0 because they depend on bundling, lint, or tests.

| Question                                            | 0.54.3 answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Consequence                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the lost wake fixed?                             | **No.** `execution/tasks/child/steps.js` `wakeTaskParentStep` is textually the same as 0.49.0: `try { await resumeSessionInbox(token, …) } catch (t) { if (isTaskWorkflowTargetGone(t)) { log.warn("task wake target is gone; the parent session already ended", …); return } throw t }`. No retry, no durable fallback.                                                                                                                                                                                                                                                                                                                                         | Outcome A is not delivered by source. The "gone" branch is still a swallowed warning.                                                                                                                                                                                                                                                                                  |
| Does anything reconcile the cached terminal view?   | **No.** `recordTerminalTaskViewsStep` (`execution/tasks/parent/hitl-proxy-steps.js`) is still the only caller of `cacheTerminalTaskView`, still reached only from `execution/route-child-delivery.js`; `execution/workflow-steps.js` does not call `readLatestTaskView`.                                                                                                                                                                                                                                                                                                                                                                                         | The investigation's recommended framework fix (refresh missing terminals from the task-run store at turn start) has not landed upstream.                                                                                                                                                                                                                               |
| Does `eve/context` expose task terminals unpatched? | **No.** `public/context/index.js` is one line: `export { defineState }`. Zero hits anywhere in `dist/` for `readBackgroundTaskTerminals`, `readBackgroundTaskMembers`, `TaskTerminalsKey`, `setSessionTaskTerminals`.                                                                                                                                                                                                                                                                                                                                                                                                                                            | The task-terminal projection hunk must be re-homed. Its 0.49.0 anchor `f && setSessionTaskTerminals(l, c.state)` in `turnStep` used the tasks flag `f`, which no longer exists (see below).                                                                                                                                                                            |
| Does `requestTurnCompletion` exist unpatched?       | **No.** Zero hits for `requestTurnCompletion`, `consumeTurnCompletionRequest`, or `context/turn-completion.*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Must be re-homed. **The tool-loop anchor moved:** 0.54.3 `harness/tool-loop.js` has `finishConversationTurn` and `hasDeferredStepInput` but no `getSessionTaskIndex(...)` and no ``execution===`background` `` check; the 0.49.0 hunk keyed on both. Re-derive, do not rebase.                                                                                         |
| Does a typed `turn.origin` exist unpatched?         | **No.** `context/dynamic-resolve-context.js` `buildResolveContext` returns `{ session, channel, messages }` with no `turn`. `DynamicTurnOrigin` has zero hits. `TurnTaskDeliveryKey` still exists (`context/keys.js`, `execution/workflow-steps.js`, `harness/tool-loop.js`) and `turnStep` still sets it to `none`, `initiating`, `pending`, or `settled`.                                                                                                                                                                                                                                                                                                      | Re-home on the same key; the hunk body should apply nearly verbatim. See open question 2 for a possible replacement via message provenance.                                                                                                                                                                                                                            |
| Is the auth hunk still needed?                      | **Yes.** `eve-channel/index.js` registers `GET/POST(EVE_CONNECTION_CALLBACK_ROUTE_PATTERN, handleConnectionCallbackRequest)` and the legacy, session-callback, and task-input routes **without** `routeAuth`; `routeAuth(request, config.auth)` is applied inline only to the info, session, cancel, and compact routes. Handler names are unchanged.                                                                                                                                                                                                                                                                                                            | Re-home the `withRouteAuth(...)` wrappers onto the four registrations. `tests/agent/channels/eve-channel-auth.test.ts:106-136` must stay green (403, not 400).                                                                                                                                                                                                         |
| Compiled Linq/Chat export redirects                 | Files exist with the same unpatched shape (`export { createLinqAdapter } from "./adapter.js"`; chat `index.d.ts` re-exports letter-aliased types). 0.54.3 bundles `chat 4.34.0` and `@linqapp/chat-sdk-adapter ^0.5.1`, the same versions the repository pins (`package.json:10,30`).                                                                                                                                                                                                                                                                                                                                                                            | The three hunks re-apply mechanically. Whether they are still needed is the **install**-level `pnpm lint:app` gate the register names.                                                                                                                                                                                                                                 |
| Workflow framed-stream cancellation                 | `compiled/_chunks/workflow/wait-until-BtySPYD0.js` **does not exist**. The reader's marker string (`Byte-stream chunk of`) now appears in `attribute-changes-C6H-fRVP.js`; `run-BM2OFphk.js` also carries `tailIndex`. Bundled `@workflow/core` is `5.0.0-beta.50`.                                                                                                                                                                                                                                                                                                                                                                                              | **Install:** run `eve-stream-cancellation.test.ts` against the new chunk with the `bundleUrl` and `mc`/`hc` markers re-pointed. Drop the hunk if the unpatched reader passes; otherwise re-home.                                                                                                                                                                       |
| Dynamic callback rebind                             | `rebindMissingCompiledDynamicToolCallbacks` still exists in `context/dynamic-tool-lifecycle.js` but now calls `hasUnregisteredDurableDynamicCallbacks([t], { sessionId, scope: "turn" })`, a different signature from 0.49.0. The patched selection (`u.has(e.resolverSlug)`) is absent, as expected for an unpatched file.                                                                                                                                                                                                                                                                                                                                      | **Install:** run `eve-dynamic-rebind.test.ts` unpatched. The changed signature means the test's fixture may need updating before it can even fail for the right reason.                                                                                                                                                                                                |
| `experimental.tasks`                                | Still typed (`shared/agent-definition.d.ts:195` `readonly tasks?: boolean`) but **runtime normalization rejects it**. Astra's plan-review probe of the 0.54.3 authored-definition validator returned `Unknown key "tasks"`; removing the key passed. Zero hits for `experimental?.tasks` in `dist/`; `TasksEnabledKey`, `createBackgroundSubagentHarnessDefinition`, and `createHarnessDelegationToolDefinition` are gone. Docs: "Every declared local or remote subagent runs as a durable background task."                                                                                                                                                    | Slice 1 **must** remove `experimental.tasks` from `agent/agent.ts` in the same PR as the bump. Removing it on 0.49.0 first would change dispatch. Prove after the bump that `browser-agent` is still a durable background task. Slice 0 re-confirms the rejection on an installed copy.                                                                                |
| `task.delegated()` removed (0.52.0)                 | Confirmed: zero hits for `delegated(`. `tools/task.d.ts` now offers `TaskExec.postMessage(message)` as a yieldable descriptor; `binding` and `send` are `@deprecated`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | No authored caller in this repository. Nothing to migrate.                                                                                                                                                                                                                                                                                                             |
| Sibling batching (0.52.4, 0.54.1)                   | Parent-side, not child-side. The child still sends one `wakeTaskParentStep` per view. The parent's `execution/parked-delivery-wait.js` `takeBufferedTurnDelivery` holds any buffered `…:ready:completed` delivery while a same-cohort member (from `tasks/session-task-cohorts.js`, keyed by the new per-entry `cohortId`) is unsettled, not itself buffered, and not cancelled; failed and cancelled deliveries are not held. The hold lives in the run's in-memory `bufferedDeliveries`. Docs: "Partial completions do not invoke the parent model."                                                                                                           | One lost wake now holds every sibling's successful result indefinitely, not just its own. The repository's `completion-obligations.ts` cohort (one per parent turn, `awaiting_terminal` until all members settle) now overlaps a framework cohort. Slice 3's subject; open question 1 asks what happens to the held buffer on a parent restart.                        |
| **Task index format change**                        | `tasks/session-index.js`: the `eve.tasks` state is now `{ tasks, version: 2 }` with an optional per-entry `cohortId`; `getSessionTaskIndex` **throws** `Unsupported task index version …` when `version !== 2`. Astra's plan-review probes found more than a missing version: adding `version: 2` still rejected legacy `operationId`; legacy terminal executors containing `childSessionId`, `childTurnId`, or `lifecycle` were rejected; the 0.49.0 reader rejects a version-2 index because `version` is an unknown key; `getSessionTaskCohorts` checks the version independently. No migration code was found (zero hits for `migrat`, `legacy`, `upgrade`). | **A live session carrying a 0.49.0 index would throw on its first turn after deploy.** A version-only compatibility hunk is not a sufficient migration. Rollback by restoring the old pin is unsafe after a version-2 index has been written. Slice 0 question 8; Slice 1 STOPs until both readers, field shape, first-resume-without-write, and rollback are handled. |
| Forced-silence instruction removed (0.52.5)         | Confirmed: `TASK_DELIVERY_PENDING_INSTRUCTION` has zero hits. `TASK_DELIVERY_SETTLED_INSTRUCTION` remains and now says "Do not reply with `<eve-empty-delivery/>`. Send one user-facing response that combines their useful results."                                                                                                                                                                                                                                                                                                                                                                                                                            | The boundary test's `not.toContain` assertions on both names stay valid. The repository's delivery guard and `report_only` policy were written against the 0.49.0 prompt; Slice 3 re-reads them.                                                                                                                                                                       |
| Provenance `execution.background_task` (0.54.0)     | `harness/messages.d.ts`: `FrameworkMessageKind` includes `execution.background_task`; every user-role history message carries `kind`. `buildResolveContext` passes `messages` through unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Whether `kind` survives into the resolver's `messages` is open question 2. If it does, the turn-origin hunk could shrink, but PR #221 showed position-based reads are unreliable, so keep the typed origin unless a probe proves `kind` is authoritative.                                                                                                              |
| Callback-failure logging (0.52.1)                   | Changelog only: "Failed session and task callback attempts now emit error-level logs … Workflow retries are unchanged."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Visibility, not recovery. Useful for Slice 2's evidence.                                                                                                                                                                                                                                                                                                               |
| `/eve/v1` callback path fix (0.52.0, `248d1b1`)     | Changelog only: "Fix remote-agent progress and completion callbacks for Vercel services mounted at `/eve/v1` … caused callback 404s and left parent agents waiting without an answer."                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The only entry describing a parent left waiting. It names remote agents; `browser-agent` is local. Whether production's wake path crosses that route is open question 3 and needs production logs, not source.                                                                                                                                                         |
| Unknown durable-context preservation                | 0.49.0 unpatched `deserializeContext` logs `dropping unknown context key during deserialization` and continues. The fork patch calls `setOpaque(t,a)` instead. CDC-01/CDC-02 require that opaque value to survive a revision handoff and then be replaced by a hydrated update. 0.54.3 tarball still contains the drop-and-warn path (`dist/src/context/serialize.js`).                                                                                                                                                                                                                                                                                          | **Eighth behavior, omitted from the register.** Re-home with the bump unless Slice 0 shows the target already preserves unknown keys. Include `tests/unit/conversation-deployment-continuity.test.ts` in the gate list.                                                                                                                                                |

## Commands you will need

| Purpose                        | Command                                                                                                                                                                                  | Expected result                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Patch boundary                 | `pnpm exec vitest run tests/unit/eve-patch-boundary.test.ts`                                                                                                                             | exit 0; file list matches the registered patch    |
| Auth removal gate              | `pnpm exec vitest run tests/agent/channels/eve-channel-auth.test.ts`                                                                                                                     | exit 0; callback and task-input routes return 403 |
| Compat removal gates           | `pnpm exec vitest run tests/unit/eve-stream-cancellation.test.ts tests/unit/eve-dynamic-rebind.test.ts`                                                                                  | exit 0 patched; recorded RED or GREEN unpatched   |
| Seam removal gates             | `pnpm exec vitest run tests/unit/eve-turn-completion.test.ts tests/unit/eve-turn-origin.test.ts tests/unit/background-task-terminal-adapter.test.ts`                                     | exit 0                                            |
| Authored consumers             | `pnpm exec vitest run tests/agent/lib/completion-obligations.test.ts tests/agent/message-delivery-completion.test.ts tests/integration/sendblue-report-recovery.test.ts agent/lib/tests` | exit 0                                            |
| Lint gate for export redirects | `pnpm lint:app`                                                                                                                                                                          | exit 0                                            |
| Full deterministic gate        | `pnpm verify`                                                                                                                                                                            | all five lanes green                              |
| Contract evals                 | `pnpm eval:contract`                                                                                                                                                                     | exit 0; includes `gateway-final-turn-red`         |
| Square evals                   | `pnpm eval:square`                                                                                                                                                                       | `Results:` line pasted into the PR                |
| Handoff                        | `pnpm check && pnpm build && git diff --check`                                                                                                                                           | exit 0                                            |
| Throwaway unpatched install    | in a scratch worktree: remove the `eve@…` line from `patchedDependencies`, set `"eve": "0.54.3"`, `pnpm install` (lockfile will change; do not commit it), then run the gates above      | records which gates fail unpatched                |

`node_modules` is not installed in this planning worktree. The tarball probe
used `npm pack eve@0.54.3` extracted to a temporary directory outside the
repository; nothing from it was copied in.

## Scope

**In scope**

- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/eve@<target>.patch`.
- `evals/contract/fixtures/demo-extension/package.json`,
  `evals/contract/mount-harness/package.json`.
- `docs/EVE_PATCHES.md`, `tests/unit/eve-patch-boundary.test.ts`, the five
  removal-gate tests, `tests/agent/channels/eve-channel-auth.test.ts`,
  `tests/unit/conversation-deployment-continuity.test.ts`.
- A dated probe record under `docs/investigations/`.
- Slice 1 may edit `agent/agent.ts` only to remove `experimental.tasks`.
- Slice 3 only: files a RED test on the merged bump names. No cohort redesign.

**Out of scope**

- Any change to `agent/instructions/`, Square, Linq, or SendBlue channel code
  in Slices 0–2.
- Implementing the framework-side wake retry or terminal refresh. That is an
  upstream issue to file (Slice 5), not a patch hunk: it changes retry
  semantics, which the register's admission policy reserves for security or
  compatibility. Astra's idea review: more logging, a visible task result in
  the prompt, or a completed child session proves none of the four #214
  properties.
- Flipping `experimental.tasks` (inert on the target anyway).
- Targeting `Merit-Systems/OpenInstinct` or any upstream repository with a PR.

## Steps

### Slice 0 — Probe an unpatched target install and pick the target

**Owns:** new `docs/investigations/eve-upgrade-probe.md`; one tracking line in
`docs/EVE_PATCHES.md` under the existing "Eve `0.52.2` still contains…" note.
No `package.json`, lock, or patch change lands in this PR.
**Prerequisites:** none.

In a scratch worktree that is never pushed, install `eve@0.54.3` with the
`eve@0.49.0` line removed from `patchedDependencies`. Expect the type check to
fail at the three authored import sites; that is the point. Then answer, with
quoted source or a pasted test result, each of these:

1. Which of the six removal-gate suites fail unpatched, and how. For
   `eve-stream-cancellation.test.ts`, first re-point `bundleUrl` at the chunk
   that contains `Byte-stream chunk of` and confirm the `mc`/`hc` markers
   still bracket the reader; if they do not, find the reader by its
   `streams.get` / `getInfo` calls and record the new markers. For
   `eve-dynamic-rebind.test.ts`, note that the unpatched function now takes a
   `{ sessionId, scope }` argument; update the fixture only as far as needed
   to make the test run, and say whether it fails for the original reason.
2. Whether `pnpm lint:app` still fails without the three compiled export
   redirects (the register's stated gate).
3. Whether `eve build` (`pnpm build:eve`) accepts `experimental.tasks: true`
   silently, warns, or rejects.
4. Whether a batched cohort wake (0.54.1) carries every settled task's view in
   one `task.views` delivery, by reading `execution/tasks/child/workflow.js`
   and `execution/tasks/parent/*` in the installed copy, and whether the
   batch is delivered by one `resumeSessionInbox` call (one lost wake, one
   lost cohort).
5. Whether `kind` on framework-authored user messages reaches a dynamic
   resolver's `messages` array (open question 2).
6. Whether `@vercel/connect/eve` 2.0.0 works against the target without a
   republished build. `tests/agent/lib/square*` does not exist. The Square
   auth tests (`agent/lib/square/tests/auth.test.ts`) mock
   `@vercel/connect/eve`; `evals/contract/square-connection-found.eval.ts`
   only discovers Square; the contract runner can take a static sandbox
   token and bypass Connect. Record the real command that invokes the
   installed Connect adapter against the target, or mark this
   “could not determine” with an explicit effect on target selection. Also
   run `agent/lib/google-workspace/tests`.
7. Whether any release between 0.49.1 and 0.54.3 is a safer target. The
   tarball probe covered 0.54.3 only. If 0.53.0's workflow-tool delegation
   change or 0.54.1's batching makes the completion refit (Slice 3) larger
   than the bump, say so and propose the pin; do not pick 0.54.3 as gospel.
8. **Task index migration.** Grep the installed `dist/` for every writer of
   `SESSION_TASKS_STATE_VERSION` and every reader that tolerates a missing
   `version`; find which release introduced `version: 2` (bisect the tarballs
   by `npm pack`). Then determine whether live production sessions can be
   queried for an `eve.tasks` key in their durable state (`db/services/sessions`
   and the Workflow world) and how many carry the 0.49.0 shape. If a migration
   exists upstream, quote it. If none exists, write down the two options for
   Slice 1: a compatibility hunk in `getSessionTaskIndex` that accepts a
   version-less `{ tasks }` and rewrites it as version 2 on the next
   `recordSessionTask` or `cacheTerminalTaskView` (meets the register's
   admission policy as a compatibility exception with a removal test), or an
   operator cutover that resets affected sessions. Do not choose here.
9. **Unknown durable context.** Run CDC-01 and CDC-02 against the unpatched
   target. If they fail, the opaque-preservation hunk is still required and
   Slice 1 must re-home it and correct `docs/EVE_PATCHES.md:87-90`.
10. **Contract fixtures.** After the throwaway install, confirm
    `evals/contract/fixtures/demo-extension` and `evals/contract/mount-harness`
    still pin `0.49.0` until Slice 1 bumps them, and record whether
    `pnpm eval:contract` can even start if only the root pin moves.

Record each answer under a heading that names the question, with the installed
version, date, and the exact command. Add to `docs/EVE_PATCHES.md` one dated
line per hunk stating "still required on <target>" or "gate passes unpatched
on <target>".

**Verify:** `pnpm exec vitest run tests/unit/eve-patch-boundary.test.ts` in
the real worktree is unchanged and green (the probe changes no patch). The
probe document lists all ten questions with a source-backed answer or an
explicit "could not determine" plus what would determine it.

**STOP** if the unpatched install cannot complete `pnpm install` on the
target because of a peer conflict this repository cannot resolve by bumping
`ai` (record the conflict and the nearest version that installs). STOP if the
auth removal gate passes unpatched on the target: that means the routes are
authenticated some other way, and Slice 1 must find and cite that mechanism
before dropping the hunk rather than assuming it.

### Slice 1 — Bump to the target with every still-required hunk re-homed

**Owns:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
`patches/eve@<target>.patch` (replacing `patches/eve@0.49.0.patch`),
`evals/contract/fixtures/demo-extension/package.json`,
`evals/contract/mount-harness/package.json`,
`tests/unit/eve-patch-boundary.test.ts`, `tests/unit/eve-stream-cancellation.test.ts`
(`bundleUrl` and markers), `tests/unit/conversation-deployment-continuity.test.ts`
(only if its import paths or markers must follow the new chunk),
`docs/EVE_PATCHES.md`, and `agent/lib/*` **only
for import-path or type-name changes the target forces**, with no behavior
change. If a behavior change in `agent/lib` is required for the bump to
compile or to keep existing delivery/auth contracts, **Slice 1 owns that
narrow fix**. Do not defer it to Slice 3: that would be an incomplete
upgrade. Slice 3 is only post-merge improvements proved by a RED test.
The bump and the load-bearing hunks (auth, turn origin, terminal projection,
final-delivery, opaque context, and any still-RED compat hunks) are **one
PR**, because authored imports from `eve/context` and `eve/tools` do not exist
on an unpatched target. That is a documented merge constraint, not a license
to also rewrite completion obligations or implement child-delivers here.
**Prerequisites:** Slice 0 merged. The register says the auth issue should be
disclosed privately to Eve's maintainers before an upgrade; confirm with the
owner that this has happened or is waived before opening this PR. No exploit
details in the PR, the patch commentary, or the register. Slice 0 question 8
answered: the PR must state how sessions carrying a 0.49.0 `{ tasks }` index
survive the first post-deploy turn, either by an upstream migration quoted
from the installed source, by a compatibility hunk with its own RED test
(`tests/unit/eve-task-index-migration.test.ts`, feeding a version-less index
to the installed `getSessionTaskIndex` and asserting it reads and rewrites
rather than throws), or by an operator cutover recorded in
`docs/operations/VERCEL.md`.

Bump `eve` to the Slice 0 target and `ai` to satisfy its peer range. Use
`pnpm patch eve@<target>` to re-create the patch from a clean extraction, one
hunk at a time, in this order:

1. **Route auth.** Wrap the four `GET/POST` registrations in
   `dist/src/eve-channel/index.js` with the same `withRouteAuth(...)` helper
   the 0.49.0 hunk defines. Run the auth suite before touching anything else.
2. **Typed turn origin.** Re-apply the `buildResolveContext` change on
   `TurnTaskDeliveryKey` in `context/dynamic-resolve-context.js` and the
   `turn.origin` declaration in `dynamic/definition.d.ts`.
3. **Task-terminal projection.** Re-add `tasks/terminal-projection.{js,d.ts}`
   and the `eve/context` export. Re-home the seed in `turnStep`
   (`execution/workflow-steps.js`): the old anchor `f && …` used a tasks flag
   the target no longer computes, so seed unconditionally after
   `readDurableSession`. Keep the boundary test's assertions on
   `settled:e.terminalView!==void 0` and the absence of `taskInboxToken`.
4. **Final-delivery completion request.** Re-add `context/turn-completion.*`
   and the `eve/context` export, then re-derive the tool-loop seam: the
   target decides whether to advance or finish at the
   `finishConversationTurn` / `finishTaskTurn` branch after
   `hasDeferredStepInput(N)`. Insert the consume-once check there, guarded by
   "no task index entry is still unsettled" using whichever session-index
   read the target's tool loop already has in scope; if none is in scope,
   import `getSessionTaskIndex` from `#tasks/session-index.js` as 0.49.0 did.
   `tests/unit/eve-turn-completion.test.ts` and `evals/contract/gateway-final-turn-red.eval.ts`
   are the gates.
5. **Unknown durable-context preservation.** Re-apply `setOpaque` in
   `context/container.js` and `deserializeContext` in `context/serialize.js`
   unless Slice 0 question 9 passed unpatched. Keep CDC-01 and CDC-02 green.
   Rewrite the stale "dropping unknown context key" paragraph in
   `docs/EVE_PATCHES.md`.
6. **Compiled export redirects** if Slice 0's lint probe still needs them.
7. **Stream cancellation** and **dynamic rebind** only if Slice 0 recorded
   RED unpatched; otherwise delete their rows from the register under a dated
   "Removed on" heading like the existing 2026-09-04 entry.
   Bump the two contract-package Eve pins in the same PR and rebuild those
   artifacts so `pnpm eval:contract` is evidence against the target, not the
   old harness.

Update the boundary test's file list to the exact new set, and its `patchUrl`
to the new patch name. Rewrite the register's eve rows to name the target and
the re-homed anchors, and add an **eighth formal row** for unknown
durable-context preservation (rationale, owner, CDC RED, removal gate).
Correct the stale "dropping unknown" paragraph. In the same PR, remove
`experimental.tasks` from `agent/agent.ts` and prove `browser-agent` is
still dispatched as a durable background task. Also bump the mount
harness `ai` pin (`evals/contract/mount-harness/package.json:8`, currently
`7.0.83`) to satisfy the target's peer range.

The current terminal projection reads
`terminalView.executor.childSessionId/childTurnId`. The target's
`TaskView.executor` contains only an optional `binding`
(`dist/src/tasks/types.d.ts`). TA-01 requires the projected child
identity. Re-home only if those fields still exist somewhere the
projection can read; otherwise STOP. Do not drop TA-01 to make the bump
compile.

**Verify:** `pnpm verify` green (all five lanes); `pnpm eval:contract`;
`pnpm eval:square` with its `Results:` line in the PR, because the bump
changes the framework-authored task prompt the model sees even though no
instruction file changes; `pnpm exec vitest run tests/unit/conversation-deployment-continuity.test.ts`;
`git diff --check`. In the PR, list each registered behavior as re-homed,
dropped with its passing gate, or blocked.

**STOP the entire bump and keep the working 0.49.0 pin and patch** if any of
the following is true. Do not land a partial upgrade and schedule Slice 3
to repair it.

- The tool-loop completion seam cannot be re-derived so that
  `eve-turn-completion.test.ts` and `evals/contract/gateway-final-turn-red.eval.ts`
  pass without weakening an assertion. Preserve every existing guard, not
  just "no unsettled task": outstanding tasks, same-step delegation, failed
  tools, pending approval/input, structured child output, cancellation, and
  replay.
- TA-01 cannot project `childSessionId` / `childTurnId` from the target's
  terminal executor shape.
- The auth suite is not green at every commit.
- CDC-01/02 cannot execute meaningfully, fail, or are weakened to a missing
  import. They simulate missing registrations on one installed serializer;
  they are not proof of a real old-process to new-process Workflow handoff.
- There is no verified transition for live sessions: both index readers,
  changed fields (`operationId`, executor identity, `lifecycle`), a first
  resumed turn that performs no subsequent task-index write, and rollback
  (old code consuming the resulting durable state, or a release strategy
  that prevents that write). `db/services/sessions.ts` records ownership; it
  does not expose the durable Eve task index.
- Old-session routing is unknown: which Workflow world serves an existing
  conversation is not the same fact as the current web deployment SHA
  (`docs/AGENT_DEVELOPMENT.md:109-120`). MULTITENANCY's proposed
  revision-pinning (`docs/MULTITENANCY.md:104-106`) is not an implemented
  guarantee.
- An "operator cutover" that resets conversations is proposed without a
  disposition for pending workers, approvals, owed reports, uncertain
  provider attempts, and conversation bindings.
- `experimental.tasks` remains in `agent/agent.ts` on a target that rejects
  the key, or removing it changes `browser-agent` from a background task.

### Slice 2 — Measure the parent wake in production on the new version

**Owns:** a dated section in `docs/investigations/eve-upgrade-probe.md` and,
if a claim in `docs/investigations/background-task-settlement.md` §8 is
resolved, a dated addendum there. No product code. This is operator
evidence, not an obligatory engineering PR, and it does not gate Slice 3.
**Prerequisites:** Slice 1 deployed to production on the measured revision.

Run the completion-report acceptance journey from #214 (root delegates to
`browser-agent`; wait for the child to settle) at least five times on web
chat and on each configured native channel. For each run record, without
message text, four separate outcomes plus ids:

- child completion (child session reached a terminal status)
- parent receipt (task-correlated log or index evidence that the parent
  received the view, not "terminals nonempty on the next root step" — a
  lost wake prevents that step)
- report attempt (a `completion_report_attempts` row, if any)
- accepted delivery (provider acceptance and recipient-visible evidence)

Use a bounded observation window, channel-specific denominators, and the
deployment id plus eve version. Also record whether logs show
`task wake target is gone` (logger `execution.tasks.run`) or a 0.52.1
error-level callback failure, and whether any wake travels through
`/eve/v1` (open question 3).

Do not describe the wake as fixed on the strength of green runs alone; the
incident in #214 was one lost delivery in a session that had already
reported successfully once. Slice 2 detects damage after auto-deploy; it
does not replace Slice 1's pre-merge transition gate.

**Verify:** the record exists with M ≥ 5 per measured channel and names the
deployment id and eve version; `git diff --check`.

**STOP** if production still runs a different eve version than the bump
(investigation §8, "deployed version parity"); record it and do not measure.
Before the first run, check production logs for `Unsupported task index
version` since the deploy; if it appears, that is a Slice 1 regression to fix
first, and every affected session id goes in the record.

### Slice 3 — Bounded compatibility assessment after the bump

**Owns:** a dated addendum in `docs/investigations/eve-upgrade-probe.md`, and
only the `agent/lib` files a RED test on the merged Slice 1 names.
**Prerequisites:** Slice 1 merged. Independent of Slice 2.

This is **not** a completion-obligation redesign. Application cohorts are
keyed by the originating parent turn (`admitTask` in
`completion-obligations.ts:167`). Target framework cohorts can include
overlapping work launched in later turns
(`eve/docs/subagents/index.mdx` on the target). A single delivery batch
does not define a single application objective. Preserve that distinction
unless a later product decision, outside this plan, changes it.

Do:

1. Re-read `reportPolicyForTurn`, `delivery-guard.ts`, and the settled
   task instruction against the target prompt. Record whether two replies
   or a refusal loop actually occur. The delivery guard still enforces
   delivery tools and protects new user requests from older reporting
   obligations; a changed framework prompt does not make those
   responsibilities obsolete.
2. Add observation-only, reason-coded `admitTask` refusal and unmatched-
   terminal counters if a test on Slice 1 proves they are still discarded.
   That authored defect survives the bump. Counters do not adopt framework
   cohort membership.
3. Change production behavior only where a RED test on the merged Slice 1
   proves a defect. Each such fix is its own small PR.

**Verify:** the named suites plus `pnpm eval:contract`; `pnpm eval:square`
if `agent/agent.ts` or instructions change; `pnpm check && pnpm build &&
git diff --check`.

**STOP** if a change here needs a new patch hunk (Slice 1 follow-up) or
collapses application cohorts into framework batches without a separate
product decision.

### Slice 4 — Child-delivers remains blocked (#246)

**Owns:** nothing in this upgrade epic. Keep #246 as the child-delivers
issue; do not implement it as part of Plan 025.
**Prerequisites:** a design that supplies conversation identity for web and
native, duplicate suppression against a later parent wake, and a report
identity that does not collide with cohort-scoped `ReportPartIdentity`.
The bump does not provide those. Independence from Slice 3 is unproven
because report identity lives on the same obligation contract.

The version bump does not create a child-posts-to-user seam.
`task.postMessage()` is a parent wake. Phone auth already carries a
conversation id (`agent/channels/sendblue.ts:251`); web auth sets
`conversationChannel: "eve"` without one (`agent/channels/eve.ts:30`). Web
chat also needs delivery into the root conversation, not a provider post.
`dispatchReportPart` does not retry uncertain sends.
`ReportPartIdentity` is cohort-scoped.

**Verify:** none in this plan. Work continues on #246 only after a design
issue records a conversation-identity and duplicate-suppression contract.

**STOP:** do not implement child-delivers in any Plan 025 PR.

### Slice 5 — Draft upstream requests (in-repo)

**Owns:** `docs/investigations/eve-upstream-requests.md`. Hunk retirement
already happens in Slice 1 when a removal gate passes; do not duplicate it
here. Filing on Eve's public tracker is an operator action outside this
repository.
**Prerequisites:** Slice 0's source quotes. Does not need five production
runs.

Write two reviewed drafts: lost-wake retry / terminal reconcile, and a
public typed terminal accessor that includes child identity. Do not file
the auth issue publicly. Private disclosure/waiver is a Slice 1 operator
prerequisite.

**Verify:** the drafts contain no exploit details and say they are not yet
filed.

## Test plan and done criteria

- [ ] Slice 0 document answers all ten probe questions with source or a
      pasted result, and names the target version.
- [ ] Slice 1 lands as one complete compatibility PR: auth suite green at
      every commit, `experimental.tasks` removed with background-dispatch
      proof, eighth register row present, task-index transition and rollback
      verified, TA-01 still projects child identity, `pnpm verify` green,
      Square `Results:` line in the PR. No later repair slice required.
- [ ] Slice 2 records four separate outcomes (child completion, parent
      receipt, report attempt, accepted delivery) per channel. A green count
      does not close #214.
- [ ] Slice 3 changes only what a RED test on Slice 1 proved, and does not
      collapse application cohorts into framework batches.
- [ ] Slice 4 is not implemented here; #246 remains the blocked issue.
- [ ] Slice 5 links two public upstream filings and a private auth
      disclosure, with no exploit details.

## What the reviews changed

Codex Astra (`gpt-6-astra`, xhigh, read-only at `798cdd8`) reviewed the
**idea** before this plan was synthesized. Fable 5.1 wrote the slices and
probed the `eve@0.54.3` tarball. This document is the synthesis. A second Codex Astra pass reviewed this synthesized plan (read-only,
`gpt-6-astra`, xhigh, worktree `/tmp/fable-eve-upgrade`). Applied below.

Applied from the idea review (each claim re-opened and confirmed):

- Treat the upgrade as a candidate dependency change, not as the product
  fix. Closing #214 needs retry/reconcile/no-user-prompt recovery; 0.54.3
  source still swallows `task wake target is gone` in `wakeTaskParentStep`.
- Register an eighth patch behavior: unknown durable-context preservation
  (`setOpaque`). `docs/EVE_PATCHES.md:87-90` is stale. CDC-01/CDC-02 are
  upgrade gates.
- Bump `evals/contract/fixtures/demo-extension` and
  `evals/contract/mount-harness` with the root pin, or contract evals stay
  on 0.49.0.
- Keep child-delivers as its own slice. `task.postMessage()` is a parent
  wake. `dispatchReportPart` is not exactly-once. `ReportPartIdentity` is
  cohort-scoped.
- `admitTask` refusal discard is authored and survives the bump.
- Do not serialize Slice 3 behind live production measurement.

Rejected or already covered:

- "Do not pick 0.54.3 before a probe" — already Slice 0, including an
  intermediate-version question.
- "node_modules/eve is absent from the Astra worktree, so the wake path
  cannot be re-verified" — Fable extracted `npm pack eve@0.54.3` and this
  synthesis re-opened `dist/src/execution/tasks/child/steps.js`,
  `public/context/index.js`, and `tasks/session-index.js`.
- Inventing an authored `task.delegated()` migration — no callers in
  `agent/`, `src/`, `evals/`, or `tests/`.

Applied from the epic-decomposition review:

- Slice 1 owns narrowly necessary `agent/lib` compatibility fixes; Slice 3
  is post-merge only (no cycle).
- Slice 1 owns the task-index decision, migration test, VERCEL.md runbook,
  target-native child-identity proof, and new completion-seam runtime cases.
- Slice 0 Connect probe uses real paths; mocked Square tests are not
  evidence.
- Slice 2 measures fresh target sessions with an `unknown` outcome.
- Slice 5 delivers in-repo filing drafts; operator files them. Disclosure
  is a Slice 1 operator prerequisite.

Applied from the plan review:

- `experimental.tasks` is rejected at runtime on 0.54.3 (`Unknown key
"tasks"`). Remove it in the bump PR; prove background dispatch remains.
- Task-index migration is larger than `version: 2`: `operationId`, executor
  identity fields, both readers, and rollback-unsafe new state.
- Terminal projection would drop `childSessionId`/`childTurnId`; TA-01
  STOPs the bump rather than weakening.
- No partial landing of the completion hunk.
- Slice 3 is a bounded assessment, not a cohort redesign. Slice 4 stays
  #246 (blocked). Slice 5 is upstream filing only.
- Slice 2 is operator evidence with four separate outcomes.
- Eighth register **row**, not only a paragraph fix. Mount-harness `ai`
  pin. Drift check matches the Eve patch file, not `patches/`.

## Open questions

1. **Held-cohort durability.** The parent holds sibling completions in the
   run's in-memory `bufferedDeliveries` (`execution/parked-delivery-wait.js`)
   until the cohort settles. If a member's wake is lost, the held siblings
   never release; and if the parent run restarts while holding them, it is
   not known from source whether the buffered deliveries are replayed from
   the inbox or dropped. Slice 0, question 4.
2. **Message provenance as an origin signal.** `UserModelMessage.kind`
   (`harness/messages.d.ts`) marks framework-authored history as
   `execution.background_task`, but `buildResolveContext` passes `messages`
   through untyped. If `kind` reaches resolvers, the turn-origin hunk could be
   replaced by authored code; if not, it stays. Slice 0, question 5.
3. **Does production's wake cross the `/eve/v1` callback route?** 0.52.0's
   `248d1b1` fixed callback 404s "for Vercel services mounted at `/eve/v1`"
   that "left parent agents waiting". It names remote agents; `browser-agent`
   is local. Only production logs from the #214 window can say whether the
   swallowed "gone" target was a 404 on that route. Slice 2.
4. **`@vercel/connect/eve` and the 0.50.0 capability-contract rebuild.** The
   package declares peer `eve >=0.13.7` and was not rebuilt for 0.50.0 as far
   as the lock shows. Whether its connection capability still loads is Slice
   0, question 6.
5. **Unpatched compat gates.** Whether `eve-stream-cancellation.test.ts` and
   `eve-dynamic-rebind.test.ts` fail on the target for their original reasons
   cannot be known from tarballs; the reader chunk moved and the rebind
   signature changed. Slice 0, question 1.
6. **Reader markers.** The `function mc(` / `const hc=` markers the stream
   test slices on are minifier-assigned names and may not survive the new
   bundle. Slice 0 records the replacement.
7. **`experimental.tasks` on the target.** Typed but unread. Whether `eve
build` warns, and whether leaving it set has any effect, is Slice 0,
   question 3. This plan leaves `agent/agent.ts` alone in the bump.
8. **Deployed version parity.** The investigation could not confirm production
   runs 0.49.0. Slice 2 STOPs if it does not run the bumped version.
9. **`ai` peer bump side effects.** 0.54.3 needs `ai ^7.0.93`; the lock has
   `7.0.83`. Whether that changes gateway or reasoning behavior is why Slice 1
   runs the Square evals even though no instruction file changes.
10. **Intermediate target.** The tarball probe covered only 0.54.3. Slice 0,
    question 7 decides whether a lower pin is safer.
11. **Private disclosure status.** The register says the auth fix should be
    disclosed privately before an upgrade. Whether that has happened is not
    recorded anywhere in the repository; Slice 1 treats owner confirmation as
    a prerequisite.
12. **Task index migration.** 0.54.3 rejects the 0.49.0 `{ tasks }` shape
    with a thrown error and the index module has no migration. Which release
    introduced `version: 2`, whether any other module migrates on read, and
    how many live sessions carry the old shape are all unknown. Slice 0,
    question 8. Until answered, a merged bump is a production incident
    waiting for the next turn of any session that ever delegated.
13. **Old-deployment pinning.** `docs/AGENT_DEVELOPMENT.md:120` and
    `docs/MULTITENANCY.md:106`: Workflow sessions may remain pinned to an
    older deployment after a merge. A green Slice 1 deploy does not move
    every live conversation onto the new Eve. Slice 1's PR must say what
    happens to those sessions, separately from the task-index throw.
14. **Opaque-context register drift.** Whether 0.54.3 still drops unknown
    keys (tarball says yes) and whether CDC-01/CDC-02 stay the removal gate
    is Slice 0, question 9.

## STOP, rollback, and maintenance

Slices 0 and 5 revert independently. Slice 1 does **not** revert by restoring
the pin files once a live session has written a version-2 task index or
other target-shaped durable state: old 0.49.0 code rejects that state.
Rollback requires either old code consuming the new state, or a release
strategy that prevented the write, plus a verified recovery path. Nothing
in Slices 1–2 changes SQL schema, secrets, or instructions. If a slice's STOP fires, leave the auth hunk in place on
whichever version is installed; a version with the security hunk and a stale
compat hunk is acceptable, a version without the security hunk is not. Re-run
Slice 0 whenever npm `latest` moves before Slice 1 merges. After Slice 5, the
register's admission policy governs any new hunk exactly as before.

## Independently executable prompt

"Implement Plan 025 only, one slice per PR against
`dennisonbertram/fork-OpenInstinct`. Start with Slice 0 in a scratch worktree
and do not skip it even if 0.54.3 looks fine; the plan's tarball probe is not
an install. In Slice 1, re-home the route-auth hunk first and keep
`tests/agent/channels/eve-channel-auth.test.ts` green at every commit; re-derive
the tool-loop completion seam rather than rebasing it; remove
`experimental.tasks` from `agent/agent.ts` in the same PR and prove
`browser-agent` remains a background task; do not weaken TA-01; STOP the
entire bump rather than landing a partial upgrade. Run `pnpm verify`,
`pnpm eval:contract`, and `pnpm eval:square` and paste the `Results:` line.
Do not implement child-delivers (#246) or redesign completion obligations
in the bump PR. Never publish exploit details for the auth hunk."
