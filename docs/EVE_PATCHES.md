# Eve patch register

Package patches are temporary compatibility or security exceptions. They are
not the normal way this fork adds product behavior.

## Current patch

| Package                       | Scope                                                                                  | Why it remains                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Proof                                                                                                                                                                                                                     | Removal gate                                                                                                                                                                                                                                                                                 | Owner                  |
| ----------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `chat-adapter-sendblue@0.2.0` | Inbound message handling, direct-message classification, and SendBlue SDK client       | The published adapter marked a message read before OpenInstinct could validate its account, line, verified identity, workspace, and durable claim; it also logged inbound metadata and retried uncertain provider sends. It ignored Chat SDK raw text and trusted a sender line encoded in the thread ID. It reported `isDM` from `fetchThread` but omitted the `Adapter.isDM` method Chat uses when dispatching direct-message handlers. The patch removes the premature receipt and metadata log, configures zero SDK retries, renders raw text, rejects a thread whose sender differs from the configured line, and classifies only non-group threads as direct messages. | `tests/agent/channels/sendblue-admission.test.ts`, `tests/agent/channels/sendblue-adapter-contract.test.ts`, `tests/agent/channels/sendblue-channel.test.ts`, and `tests/agent/channels/sendblue-native-dispatch.test.ts` | Remove after an upstream adapter release defers read receipts to the host, avoids payload logging, exposes no-retry delivery configuration, renders raw content, lets the host enforce the configured sender, and implements one-to-one `Adapter.isDM`; rerun the focused channel contracts. | repository maintainers |
| `eve@0.49.0`                  | Eve HTTP connection callback, legacy callback, session callback, and task-input routes | These routes must run configured route auth before their handlers. Without the hunk, the fork's named-session and unresolved-subject checks return the handler's `400` instead of failing closed with `403`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `tests/agent/channels/eve-channel-auth.test.ts`                                                                                                                                                                           | Install Eve without the patch and remove this hunk only when the targeted auth suite remains green.                                                                                                                                                                                          | repository maintainers |
| `eve@0.49.0`                  | Eve's compiled Linq and Chat SDK exports                                               | The product intentionally uses the separately installed Linq adapter and Chat SDK. Without the redirects, type-aware lint loses the shared Chat SDK types across the channel even though TypeScript and focused runtime tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                          | `pnpm lint:app` and the Linq channel suites                                                                                                                                                                               | Remove these three file hunks when a fresh unpatched install passes the complete lint and channel gates.                                                                                                                                                                                     | repository maintainers |
| `eve@0.49.0`                  | Bundled Workflow framed-stream cancellation                                            | Cancelling a pending read reopened the resumable backend stream; cancelling while the backend was opening left that reader uncancelled. Each orphaned local reader kept scanning its chunk directory every 100 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tests/unit/eve-stream-cancellation.test.ts`                                                                                                                                                                              | Remove when the installed unpatched reader passes cancellation during read/open and preserves live reconnection.                                                                                                                                                                             | repository maintainers |
| `eve@0.49.0`                  | Dynamic callback rebind before a new turn                                              | An opted-in memory callback rebind validated unrelated prior turn callbacks before their normal `turn.started` resolvers had registered them in a fresh process. The first attempt restored memory, then threw; the retry bypassed rebind validation and reached the ordinary resolver boundary.                                                                                                                                                                                                                                                                                                                                                                             | `tests/unit/eve-dynamic-rebind.test.ts`                                                                                                                                                                                   | Remove when a fresh unpatched Eve version passes the mixed opted-in and ordinary callback lifecycle test while retaining the missing opted-in callback failure.                                                                                                                              | repository maintainers |
| `eve@0.49.0`                  | Durable final-delivery completion request and tool-loop terminal seam                  | Eve otherwise advances to another model step after a channel confirms the final user-visible delivery. The opt-in request is exact to the active session, turn, step, and call; it is absent by default and only reaches the ordinary conversation terminal path after the current stream and tool work settle successfully.                                                                                                                                                                                                                                                                                                                                                 | `tests/unit/eve-turn-completion.test.ts` and the gateway final-delivery contract eval                                                                                                                                     | Remove when an unpatched Eve release offers this exact durable, failure-preserving completion seam and the focused runtime tests remain green without this hunk.                                                                                                                             | repository maintainers |

| `eve@0.49.0` | Read-only typed background-task terminal projection | A root session cannot read an authenticated terminal task result from the public surface. The typed task index lives on `HarnessSession.state` under the framework-reserved `eve.tasks` key, and `defineState` refuses any `eve.` name, so the only public signal is the runtime's rendered `[Task state]` prose. The hunk adds a read-only projection of the existing index — task id, terminal identity, parent turn, child session and turn, worker name, terminal status, and structured output — seeded where the turn already derives its task-delivery context, and exported from `eve/context`. It publishes no `taskInboxToken`, no child stream history, and changes no task delivery prompt or retry semantics. | `tests/unit/background-task-terminal-adapter.test.ts` and `tests/unit/eve-patch-boundary.test.ts` | Remove when an unpatched Eve release exposes an authenticated typed terminal accessor to authored code, and TA-01 through TA-06 stay green without this hunk. | repository maintainers |

The patch covers fourteen generated files: the Linq adapter JavaScript and
declaration exports, the Chat SDK declaration export, and
`dist/src/eve-channel/index.js`, `dist/src/context/dynamic-tool-lifecycle.js`, plus the Workflow bundle
`dist/src/compiled/_chunks/workflow/wait-until-BtySPYD0.js`, the final-delivery context, public export, and tool-loop seam, and the
task-terminal projection module with its `dist/src/execution/workflow-steps.js` seed. The security fix
should be disclosed to Eve's maintainers through a private channel before an
upgrade. Do not publish exploit details in a public issue.

The final-delivery unit proof launches separate Node processes to serialize and
hydrate the request. It proves the request keeps its session, turn, step, and
call identity; rejects a stale step; consumes once; and preserves a request
when the native signal is already aborted. It does not simulate a Workflow
crash or restart between provider acceptance and the workflow checkpoint, so
the runtime contract eval remains the delivery gate for that boundary.

The stream compatibility hunk adds cancellation guards to the installed framed
reader only. Its regression executes that installed function with a synthetic
World, so it makes no model calls and touches no stored session content. Before
the hunk, both cancellation cases failed while ordinary reconnection passed.
On 2026-09-05, a fresh `pnpm patch eve@0.49.0 --ignore-existing` extraction
reproduced both failures: cancelling a pending read opened two backend readers
and cancelled one; cancelling during opening left one reader uncancelled.
The matched installed-patch probes each opened and cancelled exactly one reader.
Track this behavior when reviewing Eve/Workflow release notes; no upstream fix
or issue is claimed. Local filesystem polling and persisted session data are
unchanged.

Eve `0.52.2` still contains the same callback-rebind selection and validation
path. Track a release that changes this path; the removal gate remains
`tests/unit/eve-dynamic-rebind.test.ts` against a fresh unpatched install. No
upstream contact or fix is claimed.

## Removed on 2026-09-04

An unpatched-install probe plus targeted channel and tool-boundary tests showed
that package exports for `ask_question` and `task_cancel` were not needed. The
full lint gate showed that all three adapter redirects still carry a type
boundary the narrower probe did not exercise, so they remain registered instead
of being hidden behind source-level casts or lint waivers.

## Admission policy

A new hunk requires all of:

1. a focused failing test against a fresh unpatched install;
2. the smallest generated or source-file diff that turns it green;
3. a named owner and security or compatibility rationale in this register;
4. a private-upstream or release-tracking path when appropriate; and
5. a removal test that can prove the upstream release made it obsolete.

`tests/unit/eve-patch-boundary.test.ts` fails if the patch grows beyond the
fourteen registered files or reintroduces the removed package exports. It also
fails if the task-terminal projection starts publishing the private task inbox
token or rewrites a task delivery instruction.

The task-terminal projection's RED was recorded on 2026-09-11 against a clean
`npm pack eve@0.49.0` extraction: the unpatched `eve/context` surface exports
only `defineState`, no public module mentions task terminal state, and
`defineState("eve.tasks")` throws on the reserved prefix, so zero typed terminal
records are reachable from authored code. No upstream fix or contact is claimed;
track a release that exposes an authenticated terminal accessor.

The projection is a durable context key, registered when its module loads, the
same arrangement as the final-delivery completion request. Any process that
loads authored code registers it, because `eve/context` re-exports the reader.
A framework-only process that deserializes a context without loading authored
code logs Eve's "dropping unknown context key" warning and loses that copy of
the projection; the next turn re-derives it from the task index, so the value is
self-healing rather than authoritative storage. Treat it as a per-turn
projection, never as the record of a task.
