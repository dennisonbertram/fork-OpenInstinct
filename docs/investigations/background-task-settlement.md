# Investigation: background-task settlement for `browser-agent` calls

Date: 2026-09-12. Read-only investigation; no code changed.

Trigger: in production, a root turn delegated to `browser-agent`. The turn log
recorded `subagents: [{ callId: "call_MeERCOk4Sh1t9HufvceD3OlP", name:
"browser-agent", childSessionId: "wrun_41M294QYSS0GKVQ6KG6BW7BDZ2", status:
"completed" }]`, the child session completed, but over the next 27 minutes and
four root turns no cohort was ever owed and no completion report row appeared.

## 1. Answer

Yes — as configured, a `browser-agent` call from the root agent becomes a
durable background task in Eve's session task index (PROVEN from source: the
root agent sets `experimental.tasks: true` at `agent/agent.ts:26`, and both
dispatch sites route subagent tools to `createBackgroundSubagentHarnessDefinition`
when that flag is on). And yes, a terminal that reaches the parent's session
index passes `agent/lib/background-task-terminal.ts` cleanly — the projection's
record shape matches both zod schemas field for field, so candidate cause 2 is
ruled out by construction. The gap is elsewhere and it is structural: a
terminal view enters the parent's session state through exactly one channel —
the child's wake delivery (`wakeTaskParentStep` → `resumeSessionInbox` →
`routeDeliverToChildren` → `recordTerminalTaskViewsStep`). Nothing reconciles
that cache — the framework reads live task views each turn only to build the
model's prompt, never writing them back — and the only read API exposed to
authored code (`readBackgroundTaskTerminals`/`readBackgroundTaskMembers` from
`eve/context`) reads that cached state and nothing else. If the single
wake delivery is lost — and Eve swallows "task wake target is gone" as a
warning — the terminal is never cached, `readBackgroundTaskTerminals()` returns
`[]` on every subsequent turn, and the cohort can never settle. That matches
the observed symptom exactly. Whether the wake in this specific incident was
lost, or arrived and failed before commit, cannot be determined from source;
it needs the task-run/workflow logs (section 8). A fourth, repo-side candidate
— silent admission refusal in `admitTask` — also holds as a mechanism
(section 6, cause 4). And one correction to the incident's framing: "nothing
was owed" is not evidence about the task index. Two different states produce
it — no task was admitted at all, and a task was admitted but its cohort is
still `awaiting_terminal` (a cohort owes a report in `must_report`, or when
`cancelled` with retained `observed`/`executor_receipt` evidence,
`completion-obligations.ts:312-325`) — and from the outside they are
indistinguishable.

## 2. Installed versions

- eve `0.49.0` (`node_modules/eve/package.json`).
- Note: all files under `node_modules/eve/dist/src/` are minified to a single
  line, so citations below give the file and the quoted function rather than a
  line number. Quotes are verbatim from the installed files.
- Files read: `dist/src/execution/node-step.js`, `dist/src/context/dynamic-subagent-lifecycle.js`,
  `dist/src/execution/workflow-steps.js`, `dist/src/tasks/terminal-projection.js`
  (+ `.d.ts`), `dist/src/tasks/session-index.js`, `dist/src/tasks/transitions.js`,
  `dist/src/tasks/types.js`, `dist/src/execution/delegation-tool.js`,
  `dist/src/execution/tools/subagent/local.js`, `dist/src/execution/tasks/parent/delegate.js`,
  `dist/src/execution/tasks/parent/tool-execution.js`, `dist/src/execution/tasks/parent/agent-views.js`,
  `dist/src/execution/tasks/parent/hitl-proxy-steps.js`, `dist/src/execution/route-child-delivery.js`,
  `dist/src/execution/tasks/child/steps.js`, `dist/src/execution/wire/session-inbox-resume.js`,
  `dist/src/execution/wire/session-inbox-wire.js`, `dist/src/execution/deliver-payloads.js`,
  `dist/src/public/context/index.js`, `docs/subagents/index.mdx`.
- Repo files read: `agent/agent.ts`, `agent/subagents/browser-agent/agent.ts`,
  `agent/lib/background-task-terminal.ts`, `agent/lib/completion-obligations.ts`,
  `src/app/_lib/subagent-sessions.ts`.

## 3. The dispatch decision

The issue report's quotes match the installed 0.49.0 source. In
`node_modules/eve/dist/src/execution/node-step.js`, function
`createNodeHarnessTools`:

```js
let n = e.node.agent.config?.experimental?.tasks === !0;
for (let r of e.node.turnAgent.tools) {
  let i = resolveHarnessToolDefinition({ node: e.node, tasksEnabled: n, tool: r });
  ...
}
```

and `resolveHarnessToolDefinition`:

```js
if (e.tool.kind === `subagent` || e.tool.kind === `remote`)
  return e.tasksEnabled ? createBackgroundSubagentHarnessDefinition(e.tool)
                        : createHarnessDelegationToolDefinition(e.tool);
```

The same decision exists for dynamic subagents (which `browser-agent` is —
it is defined via a `turn.started` resolver, `agent/subagents/browser-agent/agent.ts:10`)
in `node_modules/eve/dist/src/context/dynamic-subagent-lifecycle.js`:

```js
s.push(e.get(TasksEnabledKey) === !0
  ? createBackgroundSubagentHarnessDefinition(t.prepared)
  : createHarnessDelegationToolDefinition(t.prepared))
```

`TasksEnabledKey` is set per turn in `node_modules/eve/dist/src/execution/workflow-steps.js`,
function `turnStep`:

```js
let f = d.resolvedAgent.config?.experimental?.tasks === !0;
l.set(TasksEnabledKey, f);
```

The root agent enables it — `agent/agent.ts:24-27`:

```ts
experimental: {
  instrumentationProviders: true,
  tasks: true,
},
```

So both static and dynamic subagent tools, including `browser-agent`, get the
background harness definition in this app. The blocking
(`createHarnessDelegationToolDefinition`) path is never selected while
`tasks: true`.

What the background definition does (`node_modules/eve/dist/src/execution/tools/subagent/local.js`,
`defineSubagent`): the tool is declared with `execution: 'background'`, and its
execute delegates rather than blocking:

```js
let f = e.task.delegated({ executor: d, receipt: { agentId: l.agentId } });
```

The call runs inside the parent-side scope
(`node_modules/eve/dist/src/execution/tasks/parent/tool-execution.js`,
`BackgroundToolExecutionScope`), whose `start()` calls
`beginBackgroundTask` (`node_modules/eve/dist/src/execution/tasks/parent/delegate.js`)
with `metadata: { kind: 'tool', name: r.definition.name }` — for this path the
index metadata is the generic `{kind, name}` variant, not
`createSubagentTaskMetadata` (that variant is written by
`beginDelegatedTask`, used by the runtime-action dispatch path in
`dist/src/execution/tasks/parent/dispatch-task-step.js`, e.g. the root-only
`agent` tool). `beginBackgroundTask` derives a durable `taskId`, starts a task
run, and on successful delegation (`delegated()` sends the bind command and
marks the record settled) the scope's `apply()` records the index entry via
`recordSessionTask` with `createdByTurnId: t.parentTurnId` at step commit.
The tool call then returns immediately with a receipt — the root turn does not
block on the child.

## 4. The written record shape

**Task member / index entry** — written by `recordSessionTask` in
`node_modules/eve/dist/src/tasks/session-index.js` under the session state key
`eve.tasks`, validated by `sessionTaskIndexEntrySchema` (metadata is a union:
the subagent variant `{agentId, kind: "subagent", mode, name}` from
runtime-action dispatches, or the generic `{kind: string, name: string}` that
the harness-tool path writes for a subagent call):

```
{ taskInboxToken: string, createdByStepIndex?: number, createdByTurnId: string,
  executor?: { data: object, kind: string }, metadata: { kind, name, ... } ,
  operationId?: string, taskId: string,
  taskRunId: string, terminalView?: TaskView }
```

**Task terminal view** — built by `terminalView()` in
`node_modules/eve/dist/src/tasks/transitions.js` when the child sends a
terminal command:

```js
{ executor: ..., metadata: e.metadata, taskId: e.taskId,
  lastOutput: { data, type: "result" }, status: "completed" }   // or
{ ... lastOutput: { data, type: "error" }, status: "failed" }   // or
{ ... status: "cancelled" }
```

**What the projection hands authored code** —
`node_modules/eve/dist/src/tasks/terminal-projection.js`,
`projectSessionTaskTerminals` / `projectSessionTaskMembers`, verbatim:

```js
getSessionTaskIndex(e).flatMap(e => {
  let t = e.terminalView;
  return t === void 0 ? [] : [{
    childSessionId: t.executor?.childSessionId,
    childTurnId: t.executor?.childTurnId,
    output: t.status === `cancelled` ? void 0 : t.lastOutput?.data,
    parentTurnId: e.createdByTurnId,
    status: t.status,
    taskId: e.taskId,
    terminalTaskId: t.taskId,
    workerName: t.metadata.name
  }]
})
// members:
getSessionTaskIndex(e).map(e => ({
  parentTurnId: e.createdByTurnId,
  settled: e.terminalView !== void 0,
  taskId: e.taskId,
  workerName: e.metadata.name
}))
```

`readBackgroundTaskTerminals()`/`readBackgroundTaskMembers()` return these
from a per-turn context key (`TaskTerminalsKey`/`TaskMembersKey`), set once at
each parent turn start in `workflow-steps.js` `turnStep`:

```js
f && setSessionTaskTerminals(l, c.state);
```

i.e. the projection is a snapshot of the parent's durable session state at
turn entry. Terminals are empty when the session state has no `eve.tasks` key
or when index entries exist but none carries a `terminalView` (members still
project, with `settled: false`). Called outside an active eve context, both
readers **throw** (`context/container.js` `loadContext`: "No active eve
context."), they do not return `[]`.

## 5. Field-by-field comparison

`backgroundTaskTerminalSchema` (`agent/lib/background-task-terminal.ts:17-26`)
vs the terminal projection:

| Field | Eve writes | Schema requires | Match |
|---|---|---|---|
| `taskId` | `e.taskId` (index entry id, non-empty by `sessionTaskIndexEntrySchema`) | `z.string().min(1)` | yes |
| `terminalTaskId` | `t.taskId` (view's own id) | `z.string().min(1)` | yes |
| `taskId === terminalTaskId` | enforced by Eve itself: index schema `.refine(... e.terminalView.taskId === e.taskId ...)` in `session-index.js` | repo re-check at `background-task-terminal.ts:50` | yes (redundant) |
| `parentTurnId` | `e.createdByTurnId`, non-empty by index schema | `z.string().min(1)` | yes |
| `childSessionId` | `t.executor?.childSessionId`, may be `undefined` | optional `z.string().min(1)` | yes |
| `childTurnId` | `t.executor?.childTurnId`, may be `undefined` | optional | yes |
| `workerName` | `t.metadata.name`; both variants of `taskMetadataSchema` require `name: z.string().min(1)` | `z.string().min(1)` | yes |
| `status` | `t.status`, one of `completed`/`failed`/`cancelled` by `taskViewSchema` (discriminated union) | same enum | yes |
| `output` | `t.status === 'cancelled' ? undefined : t.lastOutput?.data` — `undefined` for cancelled, but also possible for completed/failed (the index schema types `lastOutput.data` as `z.custom()`, which accepts `undefined`) | `z.unknown().optional()` | yes |

`backgroundTaskMemberSchema` (`agent/lib/background-task-terminal.ts:90-95`)
vs the member projection: `taskId`, `parentTurnId`, `workerName` (all
non-empty, same sources as above) and `settled` (`e.terminalView !== void 0`,
always boolean) — all match.

One hardening caveat: the *read* path (`getSessionTaskIndex`) validates the
full `sessionTaskIndexSchema` and **throws** on a corrupt index, so a record
that reaches the repo's filters has already passed a stricter schema than the
repo's own. The *write* path validates less — `cacheTerminalTaskView` checks
only `isValidTerminalView` (status/lastOutput consistency), so a view with,
say, an empty-string `executor.childSessionId` can be cached and would then
make the next `getSessionTaskIndex` parse throw. That failure mode is loud
(a failing parent turn), not the silent drop observed here.

## 6. Verdict per candidate cause

**1. "The call never becomes a background task" — RULED OUT.**
`experimental.tasks: true` is on the root agent (`agent/agent.ts:26`), both
dispatch sites select `createBackgroundSubagentHarnessDefinition` for subagent
tools under that flag (section 3), and the incident's own evidence confirms
the delegation ran: `subagent.called` (emitted in `local.js` after dispatch,
carrying the `childSessionId`) proves dispatch, and `subagent.completed`
(emitted after `task.delegated()` returns, which includes the successful bind
command) proves the task bound. The index entry itself is written at step
commit (`apply()` → `recordSessionTask`), which the stream log does not
directly prove — but a commit failure there fails the parent step loudly, it
does not match the observed silent non-settlement. The call is
background/durable, not inline.

**2. "The terminal is dropped by the repo's schema/filters" — RULED OUT.**
The projection's shape matches both schemas field for field (section 5), the
identity equality the repo re-checks is enforced by Eve's own index schema,
and any record reaching the repo's filters has already passed Eve's stricter
index schema on read. Any terminal that reaches the parent's session index
passes `backgroundTaskTerminals()`.

**3. Found cause — HOLDS: the terminal reaches the parent's session index
through a single, lossy, silently-swallowed channel.**
The only writer of `terminalView` into parent session state in the entire
package is `recordTerminalTaskViewsStep`
(`node_modules/eve/dist/src/execution/tasks/parent/hitl-proxy-steps.js`),
called only from `routeDeliverToChildren`
(`node_modules/eve/dist/src/execution/route-child-delivery.js`):

```js
(a.task?.views?.length ?? 0) > 0 && (s = await recordTerminalTaskViewsStep({ sessionState: s, views: a.task?.views ?? [] }));
```

`task.views` in a delivery is produced by exactly one sender: the child's wake
step (`node_modules/eve/dist/src/execution/tasks/child/steps.js`,
`wakeTaskParentStep`):

```js
isTerminalTaskStatus(e.view.status) && (t.task = { views: [e.view] });
... await resumeSessionInbox(e.token, r)
catch (t) { if (isTaskWorkflowTargetGone(t)) {
  log.warn(`task wake target is gone; the parent session already ended`, ...); return } throw t }
```

Nothing reconciles this cache. Live task-view reads do exist on every parent
turn — `turnStep` calls `appendTaskAgentAnnouncement`
(`dist/src/execution/tasks/parent/agent-views.js`), which reads each index
entry's current view from the task run store via `readLatestTaskView` — but
only to build the model's prompt announcement; the result is never written
back into session state and never refreshes the authored projection.
`readLatestTaskView` is not exported to authored code
(`public/context/index.js` exports only `defineState`,
`readBackgroundTaskMembers`, `readBackgroundTaskTerminals`,
`requestTurnCompletion`). So from authored runtime code — the only place
`reconcileBackgroundTasks` runs — the cached projection is the sole view of
task state. If the wake is lost or its target is gone, the warning is
swallowed, `terminalView` is never cached, every later
`readBackgroundTaskTerminals()` returns `[]` (members still appear, with
`settled: false` forever), and the cohort can never become reportable — the
exact observed symptom, persisting across all four subsequent root turns.

There is a second silent drop inside this same channel:
`cacheTerminalTaskView` no-ops when the incoming view's `taskId` has no index
entry (`if (i < 0) return e;` in `session-index.js`). A wake delivered for a
task whose index entry was never committed is silently discarded too.

**4. Found cause — HOLDS as a mechanism, UNDETERMINED whether it fired in this
incident: silent admission refusal in `admitTask`.**
`admitTask` (`agent/lib/completion-obligations.ts:158-221`) can refuse a task:
when the session already holds 8 unfinished cohorts
(`completionCapacity.openCohorts`, `completion-obligations.ts:105`,
checked at `:172-178`), when the cohort already holds 8 tasks
(`tasksPerCohort`, `:106`, checked at `:179-183`), or when the cohort's phase
is not open or is `cancelled` (`:184-189`). Its docstring says the caller
"must refuse to dispatch when admission fails: a task that already ran but was
never admitted would settle with nobody owing its report"
(`completion-obligations.ts:152-157`) — but that contract cannot be honoured by
the only caller there is. `reconcileBackgroundTasks` discovers tasks *after*
they exist, from Eve's index, and discards `admitTask`'s return value entirely
(`completion-obligations.ts:751-760`):

```ts
for (const member of backgroundTaskMembers()) {
  admitTask({
    taskId: member.taskId,
    parentTurnId: member.parentTurnId,
    objectiveRevision: member.parentTurnId,
  });
}
```

A grep of the repo confirms this is the only non-test caller of `admitTask`
(and of `recordTerminal`); nothing refuses dispatch, because dispatch already
happened inside Eve. When a refused task's terminal later arrives,
`recordTerminal` finds no matching task, returns the state unchanged, and
reports `{ matched: false, cohortBecameReportable: false }`
(`completion-obligations.ts:246-264`) — and that return value is also
discarded at the call site (`:762-763`). There is no log line and no counter;
the no-match path runs `completion.update()` but its callback returns the
state unchanged, so nothing observable happens. From the outside, a refused
admission is indistinguishable from wake loss. From the outside it is also
indistinguishable from "nothing was owed": a cohort owes a report only in
phase `must_report` — or when `cancelled` with retained
`observed`/`executor_receipt` evidence (`reportableCohorts`,
`completion-obligations.ts:312-325`) — so both "no task admitted" and
"admitted, still `awaiting_terminal`" read as nothing owed.

Whether the incident's session could have been at either limit is unknowable
from this checkout; what would have to be true:

- **openCohorts (8):** the session already tracked 8 cohorts in neither
  `delivered` nor `superseded` phase when this task's admission was attempted.
  Note this limit can compound with cause 3: it blocks admission of tasks
  belonging to *new* cohorts (`completion-obligations.ts:171-178`) — a task
  joining an existing open cohort under 8 members still admits — and a cohort
  leaves "open" by being reported (`isOpen`,
  `completion-obligations.ts:148-150`) or by `supersedeCohort`
  (`:551-552`, currently with no non-test caller). So 8 wake-lost cohorts
  permanently block every *new* cohort's tasks, and nothing in that state can
  free a slot.
- **tasksPerCohort (8):** the incident's parent turn already started 8
  background tasks in the same cohort (the cohort *is* the parent turn). The
  log shows one `browser-agent` call; if it was the turn's only background
  task, this limit could not have fired.
- **closed/cancelled cohort:** the same `parentTurnId` already had a cohort in
  `delivered`, `superseded`, or `cancelled` phase when this task reconciled —
  possible if an earlier task of the same turn settled and was reported, then
  another task of that turn was discovered later.

Mitigating against this cause in the incident: `reconcileBackgroundTasks` runs
on every root `step.started` (`agent/agent.ts:47`) and retries admission each
time, and terminals persist in the index once cached — so a capacity refusal
only becomes permanent if capacity never frees. A refusal therefore explains
the incident only if the session was pinned at a limit for all 27 minutes, or
the cohort for that turn was closed.

Note on the incident log: the producer of the quoted `subagents: [...]` line
with `status: "completed"` was not identified (section 8), so treat its
meaning cautiously. What is proven from source: `subagent.called`/`subagent.completed`
are *control-plane dispatch* events, and the `subagent.completed` event
emitted in `local.js` at dispatch time carries `backgroundTask:
{ status: 'working' }` — it says nothing about the task terminal. If the
logged `status: "completed"` reflects the child *session* finishing, it is
evidence the child finished, not evidence that the parent's task index ever
saw a terminal. (`src/app/_lib/subagent-sessions.ts` was checked and is not
the producer: its `getSubagentStatus` returns `"complete"`, never
`"completed"`.)

## 7. Recommended fix

The root cause is a framework limitation, and it should be named as such:
**Eve 0.49.0 caches task terminal views into parent session state only when
the child's wake delivery is processed, with no self-healing read; authored
runtime code has no API to read live task views.** No change confined to this
repo can recover a wake that was already lost, because authored code sees only
the cached projection.

The smallest fix that makes a settled worker produce a reportable cohort is in
Eve, at the projection refresh: in `turnStep`
(`dist/src/execution/workflow-steps.js`), where `f &&
setSessionTaskTerminals(l, c.state)` snapshots durable state, refresh any
index entry lacking a `terminalView` from the live task run store (the
`readLatestTaskView({taskRunId})` path that `agent-views.js` already uses for
prompts) before projecting, and persist newly seen terminals via
`cacheTerminalTaskView`. That one change turns every lost wake into a
one-turn delay instead of a permanently unsettled cohort. Upstream issue to
file against `Merit-Systems/OpenInstinct`'s Eve dependency (or Vercel's eve,
per its actual upstream).

If an in-repo mitigation is wanted before a framework fix exists, the honest
option is detection, not recovery: in `reconcileBackgroundTasks`, flag
cohorts whose members stay `settled: false` past an age threshold so the root
says so to the user instead of waiting forever. Not implemented here.

**Recommendation (separate from the fix): instrument the silent drop sites.**
This incident produced four candidate causes that are indistinguishable from
outside because every branch that discards information does so silently. Three
small counters would separate them in a future incident:

- **`admitTask` (`agent/lib/completion-obligations.ts:158-221`):** on each
  `{ admitted: false }` return, record a reason code distinguishing which
  limit fired (`openCohorts`, `tasksPerCohort`, or closed-cohort — the three
  `reason` strings at `:176`, `:182`, `:187`) plus a count, keyed by session.
  The discriminators have to be derived from those strings or added alongside
  them; there is no structured code today. A refused admission then shows up
  as a count that keeps incrementing across root steps — distinguishing cause
  4 from cause 3 in one glance.
- **`recordTerminal` (`agent/lib/completion-obligations.ts:236-264`):** on the
  no-match early return (`:258-264`), record a count of unmatched terminals
  plus which identity check failed: no task with this `taskId`, no cohort for
  the task's `parentTurnId`, or `parentTurnId` mismatch. Zero admission
  refusals alongside unmatched terminals points away from cause 4 and at the
  terminal record itself; both signals together are consistent with cause 4 —
  though session-level counts alone cannot prove the *same* task experienced
  both, so the counters are triage, not verdict.
- **`reconcileBackgroundTasks` (`agent/lib/completion-obligations.ts:751-763`):**
  record, once per root step, the member count and the settled-member count
  already visible in the loop. Members present with zero terminals across
  many steps is consistent with cause 3 (wake lost or terminal never cached)
  but not proof of it — a genuinely still-running task looks the same
  (`background-task-terminal.ts:86-87`, `settled` is false while running).
  Zero members at all refutes the task-index premise entirely.

Constraints that make this legitimate diagnostics rather than a new failure
mode: bounded reason codes and counts only — never raw task `output`, worker
messages, or terminal payloads, which can carry user data — and the counters
must be observation only: they never mutate `completion` state, never create
or promote cohorts, and never influence reporting, so a diagnostic can never
become fabricated completion state. Not implemented here.

## 8. What could not be determined

- **Why this particular wake never settled the cohort.** From source, the
  plausible loss points are: `isTaskWorkflowTargetGone` swallowed as a warning
  (parent inbox hook / durable workflow no longer resumable in the production
  environment), a wake-delivery turn that failed before its
  `recordTerminalTaskViewsStep` commit, a wake whose `taskId` had no committed
  index entry (silently dropped by `cacheTerminalTaskView`), or a resume that
  succeeded but whose turn crashed pre-commit. Distinguishing them requires
  the production task-run and workflow logs (look for `task wake target is
  gone` from logger `execution.tasks.run`, and the `taskDeliveryId`
  `<taskId>:ready:<status>`). Not verifiable from this checkout.
- **Whether the task index entry existed in the parent's state at the time.**
  The emitted `subagent.completed` event proves dispatch and bind succeeded;
  `recordSessionTask` runs at the subsequent step commit, which the stream log
  does not directly evidence, and I could not inspect the production session
  state to confirm the entry (and whether it ever gained a `terminalView`).
- **Whether `admitTask` refused this task** (cause 4), and if so which limit
  fired. That lives in the session's completion state at the time, which no
  system record exposes (see the completion-report observability notes); the
  counters recommended in section 7 exist precisely because this is currently
  unanswerable after the fact.
- **The exact producer of the incident's `subagents: [...]` log line.** Not
  found in this repo (`src/app/_lib/subagent-sessions.ts` was checked and is
  not it — its status vocabulary is `"complete"`, not `"completed"`) or in
  eve's dist. The interpretation in section 6 therefore rests on the event
  semantics proven from source, not on identifying the logger.
- **Deployed version parity.** This checkout pins eve 0.49.0. If production
  runs a different eve version, the dispatch quotes verified here (which do
  match the issue report) should be re-verified against that version's
  installed files.
