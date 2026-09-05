# Eve patch register

Package patches are temporary compatibility or security exceptions. They are
not the normal way this fork adds product behavior.

## Current patch

| Package      | Scope                                                                                  | Why it remains                                                                                                                                                                                                                      | Proof                                           | Removal gate                                                                                                     | Owner                  |
| ------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `eve@0.49.0` | Eve HTTP connection callback, legacy callback, session callback, and task-input routes | These routes must run configured route auth before their handlers. Without the hunk, the fork's named-session and unresolved-subject checks return the handler's `400` instead of failing closed with `403`.                        | `tests/agent/channels/eve-channel-auth.test.ts` | Install Eve without the patch and remove this hunk only when the targeted auth suite remains green.              | repository maintainers |
| `eve@0.49.0` | Eve's compiled Linq and Chat SDK exports                                               | The product intentionally uses the separately installed Linq adapter and Chat SDK. Without the redirects, type-aware lint loses the shared Chat SDK types across the channel even though TypeScript and focused runtime tests pass. | `pnpm lint:app` and the Linq channel suites     | Remove these three file hunks when a fresh unpatched install passes the complete lint and channel gates.         | repository maintainers |
| `eve@0.49.0` | Bundled Workflow framed-stream cancellation                                            | Cancelling a pending read reopened the resumable backend stream; cancelling while the backend was opening left that reader uncancelled. Each orphaned local reader kept scanning its chunk directory every 100 ms.                  | `tests/unit/eve-stream-cancellation.test.ts`    | Remove when the installed unpatched reader passes cancellation during read/open and preserves live reconnection. | repository maintainers |

The patch covers five generated files: the Linq adapter JavaScript and
declaration exports, the Chat SDK declaration export, and
`dist/src/eve-channel/index.js`, plus the Workflow bundle
`dist/src/compiled/_chunks/workflow/wait-until-BtySPYD0.js`. The security fix
should be disclosed to Eve's maintainers through a private channel before an
upgrade. Do not publish exploit details in a public issue.

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
five registered files or reintroduces the removed package exports.
