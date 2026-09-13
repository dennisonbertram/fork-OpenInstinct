# Investigation: unpatched Eve 0.54.3 upgrade probe

Date: 2026-09-13. Scratch install only; this document is the delivered
artifact. The scratch worktree was never pushed.

## Target

**Pick `eve@0.54.3`.** No intermediate 0.49.1–0.54.2 release avoids the
load-bearing gaps. 0.50.0 still has no public terminal/completion/origin
seams and still has no task-index version field; 0.51.0 and later throw on
a 0.49.0 `{ tasks }` index. Staying below 0.51 only delays the migration.

| Field                        | Value                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Base commit                  | `86bc6e0`                                                                                                         |
| Scratch worktree             | `/tmp/eve-probe-249` (detached, unpushed)                                                                         |
| Command                      | Removed `eve@0.49.0` from `patchedDependencies`; set root `"eve": "0.54.3"` and `"ai": "^7.0.93"`; `pnpm install` |
| Installed `node_modules/eve` | `0.54.3`                                                                                                          |
| Resolved `ai`                | `7.0.99`                                                                                                          |
| npm `dist.tarball`           | `https://registry.npmjs.org/eve/-/eve-0.54.3.tgz`                                                                 |
| npm `dist.shasum`            | `6cc19b9d6d9463e504f9e2d9d595160c26de0a8d`                                                                        |
| npm `dist.integrity`         | `sha512-OOKmnmcyal5N+qaQcdpNbho+SpXBCZw11q9dSnqtN5f9ccIdcps53do4h49ZyefA/2xYSR8IOVnUB6vqUFtV4w==`                 |
| Local `npm pack` sha256      | `275817e0fef34c7036f8fd8a2893b432939849890a08aa2a7a53d1408b4f84d3`                                                |
| npm `latest` at probe        | `0.54.3` (published 2026-09-11T21:47:39.430Z)                                                                     |

`pnpm install` completed. The `ai` peer was satisfied by bumping the root
range to `^7.0.93` (STOP for an unresolvable peer did not fire).

## 1. Removal-gate suites unpatched

Command: `pnpm exec vitest run <file>` in the scratch worktree.

| Suite                                                 | Result                                                                                                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/agent/channels/eve-channel-auth.test.ts`       | **RED, original reason.** 2 failed, 4 passed.                                                           | Hook-resume (`POST /eve/v1/callback/:token`) and unresolved task-input (`POST /eve/v1/task-input/:token`) returned **400**, expected **403**. Auth hunk still required. STOP for “auth gate passes unpatched” did **not** fire.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/unit/eve-patch-boundary.test.ts`               | GREEN                                                                                                   | Reads `patches/eve@0.49.0.patch` on disk, not the installed package. Unchanged. Also GREEN on patched main `86bc6e0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tests/unit/eve-stream-cancellation.test.ts`          | **Could not run as written** (ENOENT `wait-until-BtySPYD0.js`). After scratch-only re-point: **GREEN.** | New chunk `dist/src/compiled/_chunks/workflow/attribute-changes-C6H-fRVP.js`. Markers `function mc(` / `const hc=` are gone. Reader is `function Lc(` … `const Rc=`. `streams.get` / `getInfo` live on inner `te` / `x`. Adapted fixture (not shipped) ran 3/3 pass. Stream hunk’s removal gate passes unpatched.                                                                                                                                                                                                                                                                                                                                                  |
| `tests/unit/eve-dynamic-rebind.test.ts`               | **RED, original reason after fixture update.**                                                          | Unadapted: all 3 fail `Context key "eve.sessionId" is not set` (`hasUnregisteredDurableDynamicCallbacks` now takes `{ sessionId, scope: "turn" }`). Scratch-only `ctx.set(SessionIdKey, "synthetic-session")`: fail-closed missing-callback test **passes**; ordinary-callback test still throws `Dynamic tool callback rebind did not restore: synthetic_ordinary_turn_tool` (original hunk reason). The third test’s `lookupDurableDynamicCallback(name, "execute")` is a **fixture mismatch**: 0.54.3’s first argument is an owner object with `sessionId`, not the tool name. That failure is not evidence about rebind selection. Rebind hunk still required. |
| `tests/unit/eve-turn-completion.test.ts`              | **RED, missing module.**                                                                                | `dist/src/context/turn-completion.js` does not exist. Zero `requestTurnCompletion` hits in `dist/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/unit/eve-turn-origin.test.ts`                  | **RED, original reason.** 5/5 fail.                                                                     | `buildResolveContext` returns `{ session, channel, messages }` with no `turn.origin`. TO-01 expected `turn: { origin }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/unit/background-task-terminal-adapter.test.ts` | **RED, missing module.**                                                                                | `dist/src/tasks/terminal-projection.js` does not exist. `eve/context` is `export { defineState }` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. Lint redirects

Command: `pnpm lint:app` in the scratch worktree. Exit 1. 187 errors.

First errors are the missing patched exports (`readBackgroundTaskTerminals`,
`readBackgroundTaskMembers`, `requestTurnCompletion`, `DynamicTurnOrigin`).
`agent/channels/linq.ts` then fails as an `error` type (Chat SDK / Linq
adapter types). Unpatched compiled exports are still
`export { createLinqAdapter } from "./adapter.js"` in the `.d.ts`; the
register’s lint gate still needs the three redirect hunks.

## 3. `experimental.tasks`

`pnpm build:eve` failed first on
`eve/context` missing `readBackgroundTaskMembers`, so it never reached
agent-config validation.

Direct call of `normalizeAgentDefinition` from
`node_modules/eve/dist/src/internal/authored-definition/core.js`:

```
REJECTED agent/agent.ts Unknown key "tasks".
NO_TASKS_ACCEPTED {"instrumentationProviders":true}
```

`normalizeAgentExperimentalDefinition` allows only
`instrumentationProviders` and `workflow`. Slice 1 must remove
`experimental.tasks` from `agent/agent.ts`. Docs still say every local or
remote subagent is a durable background task; `experimental?.tasks` has
zero runtime readers in `dist/`.

## 4. Batched cohort wake

Child `wakeTaskParentStep`
(`dist/src/execution/tasks/child/steps.js`) still sends
`t.task = { views: [e.view] }` and one `resumeSessionInbox` per view. The
gone-target catch is unchanged (`log.warn("task wake target is gone; the
parent session already ended"); return`).

Parent batching is in
`dist/src/execution/parked-delivery-wait.js`
`takeBufferedTurnDelivery`. It holds `:ready:completed` deliveries while
another same-cohort member is unsettled and not already in the buffer.
Coalesce happens only once the cohort is fully represented. One lost child
wake therefore does **not** collapse into a single inbox call, and can
hold siblings in `bufferedDeliveries`.

## 5. Message `kind` vs `turn.origin`

`UserModelMessage` requires `kind: UserMessageKind`, including
`execution.background_task` (`dist/src/harness/messages.d.ts`).
`buildResolveContext` forwards `messages` unchanged and does not project
`turn.origin`. The origin **unit fixture** messages are `{ role, content }`
only, so that suite cannot answer whether `kind` reaches resolvers. A
follow-up against the installed constructor
`createUserMessage("execution.background_task", …)` plus
`dispatchDynamicToolEvent` showed `kind: "execution.background_task"` on
resolver `messages`, while `turn.origin` remained absent. `kind` is
therefore a possible authored replacement, not a proof that the typed-origin
hunk is obsolete. Keep the hunk until Slice 1 decides.

## 6. `@vercel/connect/eve`

- `agent/lib/google-workspace/tests`: 21 passed.
- `agent/lib/square/tests/auth.test.ts`: 9 passed (mocks
  `@vercel/connect/eve`).
- No command in this repository invokes the installed Connect adapter
  against 0.54.3 without a mock. The 0.50.0 capability-contract rebuild
  is **could not determine**. Effect on target selection: none for picking
  0.54.3 (peer is `eve >=0.13.7`); Slice 1 must treat live Connect as
  unverified until a real `getToken` against the target.

## 7. Intermediate versions

Tarball bisect of `session-index.js` / `session-task-cohorts.js`:

| Release       | Task index                                            |
| ------------- | ----------------------------------------------------- |
| 0.50.0        | No version field; no throw                            |
| 0.51.0–0.52.3 | `if (n !== 2) throw Unsupported task index version`   |
| 0.52.4–0.54.3 | `SESSION_TASKS_STATE_VERSION = 2`; both readers throw |

0.50.0 avoids the throw and still types `childSessionId` / `childTurnId` on
the terminal executor, but it still lacks the public seams and still has
the lost-wake path. 0.51+ all need a migration **and** drop those executor
fields (`operationId`, `childSessionId`, `childTurnId`, `lifecycle` are
rejected by 0.54.3’s index schema). 0.53.0’s workflow-tool
`ctx.agent(target, input)` change and 0.54.1’s sibling-completion batching
are parent-runtime behavior Slice 3 may have to re-read; they do not restore
the missing seams or avoid the version-2 throw. Landing on 0.50.0 would
defer both the migration and those completion-refit costs, then pay them on
the next bump. **Target remains 0.54.3** so Slice 1 faces the migration
once.

## 8. Task index migration

Installed 0.54.3: `SESSION_TASKS_STATE_VERSION = 2` in
`dist/src/tasks/session-task-cohorts.js`. `getSessionTaskIndex` throws
`Unsupported task index version undefined … expected version 2` on a
version-less object. `getSessionTaskCohorts` throws if `n.version !== 2`.
No `migrat` / `legacy` hits in those modules.

`db/services/sessions.ts` stores `sessionId`, `workspaceId`,
`createdByUserId`, `createdAt`. It does not expose `eve.tasks`. Eve stores
the index in Workflow/session durable state, not in this Postgres table.
This probe had no Workflow world credentials and no production run id list,
so it could not count live 0.49.0 indexes. **What would determine it:**
operator access to the Vercel/Workflow dashboard (or a dump of session
durable state) for conversations that have delegated background work, then
parse `eve.tasks`. Until that exists, treat every live session that ever
delegated as at risk.

Slice 1 options (do not choose here):

1. Compatibility hunk: accept version-less `{ tasks }` in **both** readers
   (`getSessionTaskIndex` and `getSessionTaskCohorts`) **and** accept
   legacy `operationId` plus terminal executor `childSessionId` /
   `childTurnId` / `lifecycle`, then rewrite to a 0.54.3-shaped
   `{ tasks, version: 2 }` on the next `recordSessionTask` /
   `cacheTerminalTaskView`. A version-only rewrite is not enough. RED:
   `tests/unit/eve-task-index-migration.test.ts` against unpatched 0.54.3.
2. Operator cutover that resets affected conversations, with a written
   disposition for pending workers, approvals, owed reports, and
   conversation bindings, in `docs/operations/VERCEL.md`.

Rollback by restoring 0.49.0 is unsafe after a version-2 write: 0.49.0’s
`sessionTaskIndexSchema` has no `version` field and rejects the new key;
0.51+ reject a missing version.

## 9. Unknown durable context

Command: `pnpm exec vitest run tests/unit/conversation-deployment-continuity.test.ts`

- CDC-01 **failed**: unpatched `deserializeContext` logs `dropping unknown
context key during deserialization` and returns `{}`. Opaque hunk still
  required. The register paragraph that begins “A framework-only process
  that deserializes a context” still describes the unpatched drop; the
  current patch uses `setOpaque` instead.
- CDC-02 **passed** (ordinary hydrated update; does not need `setOpaque`).

## 10. Contract fixtures

After the throwaway install, fixtures still pin Eve 0.49.0:

- `evals/contract/fixtures/demo-extension/package.json` `"eve": "0.49.0"`
- `evals/contract/mount-harness/package.json` `"eve": "0.49.0"`, `"ai": "7.0.83"`

`pnpm eval:contract` **started** (Compose project, migrate, extension
build) and then failed evaluating `agent/agent.ts`:
`eve/context` does not export `readBackgroundTaskMembers`. Failure is the
missing root seams, not the fixture pin. Slice 1 must still bump both
fixture pins and the harness `ai` pin so contract evals are evidence
against the target.

## Hunk register (0.54.3 unpatched)

| Hunk                                               | 2026-09-13                      |
| -------------------------------------------------- | ------------------------------- |
| Route auth                                         | still required on 0.54.3        |
| Linq/Chat compiled export redirects                | still required on 0.54.3        |
| Workflow framed-stream cancellation                | gate passes unpatched on 0.54.3 |
| Dynamic callback rebind                            | still required on 0.54.3        |
| Final-delivery completion request                  | still required on 0.54.3        |
| Typed background-task terminal projection          | still required on 0.54.3        |
| Typed `turn.origin`                                | still required on 0.54.3        |
| Unknown durable-context preservation (`setOpaque`) | still required on 0.54.3        |

## Slice 3 addendum — bounded completion compatibility (2026-09-13)

Plan 025 Slice 3 / GitHub #252. Assessment against the Eve 0.54.3 bump in
#258 (`76aa71a`). No `agent/lib` code change. Application cohorts stay keyed
by originating parent turn (`admitTask` in `completion-obligations.ts`).

### Report policy and delivery guard

`reportPolicyForTurn` still returns `must_report` only when forcing is
active and `reportableCohorts()` is non-empty. A `user_request` intent
keeps only the cohort whose id equals the current turn, so an older owed
summary does not capture a new user message. `turnRequestIntentFromOrigin`
still maps `background_task` → `report_only` and `channel_input` →
`user_request`.

The interactive delivery guard is unchanged and still passes DG-01/02/03:

- owed report + pending user request → `{ type: "required" }` (does not
  force `send_message`)
- owed report + no pending user request → `{ type: "tool", toolName:
"send_message" }`
- no owed report → `{ type: "required" }`

Those tests ran green on the bump (`pnpm check` at `76aa71a`, 1961 passed).
No new RED appeared on merged Slice 1 code for a two-reply or refusal-loop
defect.

### Framework settled-task instruction

Installed `eve@0.54.3` has **zero** hits for
`TASK_DELIVERY_SETTLED_INSTRUCTION` and
`TASK_DELIVERY_PENDING_INSTRUCTION`. Package docs still describe
`<eve-empty-delivery/>` as intentional silence
(`eve/docs/concepts/sessions-runs-and-streaming.md`). The 0.52.5 probe
note that pending-silence was removed remains true; this slice could not
re-read a live settled-task prompt string from minified `dist/`.

### Two replies / refusal loop

**Not observed.** This assessment did not run a live parent wake on
deployed 0.54.3 (that is Slice 2 / #251). Unit tests do not simulate two
model replies. Source says the guard still blocks an owed report from
monopolizing a new user request, and still forces `send_message` on a
wake with nothing else to do. That is compatible with “one user-facing
response that combines useful results” if the framework still asks for
that; it is not proof that production never double-sends.

No `admitTask` refusal counters were added: no RED test on the bump
showed those discards. Observation-only counters remain available if a
later run proves they are still dropped.

### STOP checks

No new Eve patch hunk. Application cohort identity is unchanged. #246
stays out of this slice.
