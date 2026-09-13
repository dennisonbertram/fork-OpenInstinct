# Draft upstream Eve requests (lost wake and typed terminals)

Date: 2026-09-13. In-repo drafts only. These requests are **not yet filed**.

Intended tracker: [vercel/eve issues](https://github.com/vercel/eve/issues).
Filing is an operator action outside this repository. Do not open them on
`Merit-Systems/OpenInstinct` or on this fork as a substitute for Eve's tracker.

This document is Plan 025 Slice 5 / GitHub #253. It is not a product fix, not
an Eve patch hunk, and not evidence that #214 is resolved. A 0.54.3 upgrade
does not retry a gone parent inbox or refresh the authored terminal cache.

A separate route-auth concern was disclosed privately and waived for this
upgrade. It is not part of these drafts. Do not attach exploit details to
either request.

## 1. Lost-wake retry / terminal reconcile

### Request (draft)

When a background task reaches a terminal view, Eve currently notifies the
parent through one at-most-once inbox resume. If that target is already gone,
the child logs a warning and returns. Nothing later writes the terminal view
into the parent session index, and authored code that reads the cached
projection never sees the result.

Please either:

1. retry or recover a terminal parent-wake when `resumeSessionInbox` fails
   because the workflow target is gone, **or**
2. reconcile missing `terminalView` entries from the live task-run store into
   parent session state on a later parent turn, so a lost notification is not
   a permanent drop.

The terminal result should survive independently of the original inbox token.
Recovery should persist into the state authored readers see, and should not
require another user message to start.

This is not a request to post from the child into the user's conversation, and
not a request to change task-delivery prompt text or retry semantics for
in-flight work.

### Why (source on eve@0.54.3)

`wakeTaskParentStep` in `dist/src/execution/tasks/child/steps.js` still sends
one `resumeSessionInbox` per terminal view and swallows a gone target:

```js
async function wakeTaskParentStep(e) {
  "use step";
  let t = { message: formatTaskNotification(e.view) };
  isTerminalTaskStatus(e.view.status) && (t.task = { views: [e.view] });
  let n = {
    kind: `send`,
    payload: t,
    taskDeliveryId: `${e.view.taskId}:ready:${e.view.status}`,
  };
  try {
    await resumeSessionInbox(e.token, n);
  } catch (t) {
    if (isTaskWorkflowTargetGone(t)) {
      log.warn(`task wake target is gone; the parent session already ended`, {
        status: e.view.status,
        taskId: e.view.taskId,
      });
      return;
    }
    throw t;
  }
}
```

The only writer of `terminalView` into parent session state is
`recordTerminalTaskViewsStep`, reached from `routeDeliverToChildren`. Parent
turns read live views via `readLatestTaskView` to build the model prompt, then
discard that result. Unpatched `eve/context` does not expose a reconcile path.

Observed product symptom (fork issue
[#214](https://github.com/dennisonbertram/fork-OpenInstinct/issues/214)): a
child session can complete while the parent cohort never becomes reportable,
because `readBackgroundTaskTerminals()` keeps returning no terminals.

#214 should stay open until a released Eve version actually retries or
reconciles. Closing it on an upgrade or on these drafts would be wrong.

### Not yet filed

Do not treat this markdown as an upstream issue. An operator still has to paste
a reviewed version into https://github.com/vercel/eve/issues.

## 2. Public typed terminal accessor with child identity

### Request (draft)

Please export an authenticated, typed accessor on `eve/context` for background
task terminals owned by the active session, including:

- task id
- parent turn id
- child session id
- child turn id
- worker name
- terminal status
- structured output

The accessor should not publish `taskInboxToken`, child stream history, or
routing credentials. Membership (settled vs still running) can stay a separate
record, but a terminal record should keep child identity after the child
handle is released.

Today the public surface is `export { defineState }` only.
`defineState("eve.tasks")` throws on the reserved prefix, so authored code
cannot read the typed index. Native 0.54.3 terminals store child identity on
`executor.binding` / the handle store, which is released at settlement, so a
public projection also needs to snapshot those ids into the cached view.

### Why (source on eve@0.54.3)

Unpatched `dist/src/public/context/index.js` is:

```js
export { defineState };
```

Zero hits in `dist/` for `readBackgroundTaskTerminals`,
`readBackgroundTaskMembers`, or `setSessionTaskTerminals`. The task index
lives on `HarnessSession.state` under `eve.tasks`. Without a public reader,
the only signal is rendered `[Task state]` prose.

Fork-local patch types (not upstream) look like:

```ts
export interface BackgroundTaskTerminal {
  readonly taskId: string;
  readonly terminalTaskId: string;
  readonly parentTurnId: string;
  readonly childSessionId?: string;
  readonly childTurnId?: string;
  readonly workerName: string;
  readonly status: "completed" | "failed" | "cancelled";
  readonly output?: unknown;
}
```

That shape is the requested accessor, not a claim that Eve already ships it.

### Not yet filed

Same as draft 1: not filed on Eve's tracker.

## Out of scope

- Child-delivers / posting from a child into the user's conversation (#246).
- Collapsing application completion cohorts into framework delivery batches.
- Filing or describing any HTTP auth-route issue in public.
- Claiming #214 is fixed by Eve 0.54.3 or by this document.
