# Eve patch register

Package patches are temporary compatibility or security exceptions. They are
not the normal way this fork adds product behavior.

## Current patch

| Package      | Scope                                                                                  | Why it remains                                                                                                                                                                                                                      | Proof                                           | Removal gate                                                                                             | Owner                  |
| ------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| `eve@0.49.0` | Eve HTTP connection callback, legacy callback, session callback, and task-input routes | These routes must run configured route auth before their handlers. Without the hunk, the fork's named-session and unresolved-subject checks return the handler's `400` instead of failing closed with `403`.                        | `tests/agent/channels/eve-channel-auth.test.ts` | Install Eve without the patch and remove this hunk only when the targeted auth suite remains green.      | repository maintainers |
| `eve@0.49.0` | Eve's compiled Linq and Chat SDK exports                                               | The product intentionally uses the separately installed Linq adapter and Chat SDK. Without the redirects, type-aware lint loses the shared Chat SDK types across the channel even though TypeScript and focused runtime tests pass. | `pnpm lint:app` and the Linq channel suites     | Remove these three file hunks when a fresh unpatched install passes the complete lint and channel gates. | repository maintainers |

The patch is four generated-file hunks: the Linq adapter JavaScript and
declaration exports, the Chat SDK declaration export, and
`dist/src/eve-channel/index.js`. The security fix
should be disclosed to Eve's maintainers through a private channel before an
upgrade. Do not publish exploit details in a public issue.

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
four registered files or reintroduces the removed package exports.
