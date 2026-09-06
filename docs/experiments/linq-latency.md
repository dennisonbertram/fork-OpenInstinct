# iMessage latency investigation

Status: measured bottleneck, no optimization or 10x result yet.

On 2026-09-06, diagnostic revision `30427ebe2eeaec975a8c2652bd8fb2122a3e32b4`
ran temporarily on `dpl_7jas6Sp7LofvmyquGxC2oJNyBz89`. The probe was enabled
only for the operator's verified workspace. The actual first model step reported
Luna Fast in all three samples. All replies were correct.

| Sample                    | App admission to handoff | Handoff to turn start | Turn start to provider acceptance |      Local visible reply |
| ------------------------- | -----------------------: | --------------------: | --------------------------------: | -----------------------: |
| A, arithmetic             |                   213 ms |             12,474 ms |                          3,192 ms | Timestamp lost; excluded |
| B, arithmetic             |                    92 ms |              7,845 ms |                          4,030 ms |         12,720–13,534 ms |
| C, one-word factual reply |                   126 ms |              6,972 ms |                          3,159 ms |         10,510–11,286 ms |

The dominant measured interval is after the app calls Eve's bridge and before
`turn.started`. Authentication, workspace verification, identity lookup, binding,
atomic inbound claim, pending-input lookup, and marking read do not account for
the multi-second delay in these samples. Model input preparation follows turn
start by 107–169 ms. The provider post calls took 41–47 ms. Provider acceptance
is not the same as local visible arrival.

The backend timing fields use `Date.now()` across processes without clock
calibration. Local visible timing bounds use one local clock. Sample A lost its
local send timestamp in the measurement helper and is not an end-to-end sample.
No history reset was performed. Three samples do not establish a population
latency distribution or a performance improvement.

## Workflow evidence and remaining question

For sample B, request metadata shows the parent workflow executing on
`dpl_8eRJYZ2GRum5f9NZHRwy2XgXk1fH`, revision
`98742b99e5807e561240c2ad8a82c8d43c62e96f`, while turn execution occurs on the
diagnostic deployment. The older parent receives a workflow request at
14:12:21 UTC; current-deployment workflow requests occur at 14:12:26–27 UTC.
The turn starts at 14:12:28.773 UTC. These request timestamps have second
resolution and do not separately measure queueing, replay, or hydration.

Installed Eve source routes existing-session delivery through a durable inbox
resume. Its inline-turn path requires the accepted deployment to match the
worker deployment; a mismatch falls back to a child turn workflow. This explains
why the current conversation cannot use that same-deployment path, but the
exact time spent in scheduling versus restoring durable state remains unmeasured.
No fixed debounce or normal-send retry applies under concurrent Chat SDK dispatch.

Relevant installed sources are `channel/channel-address.js`,
`execution/wire/session-inbox-resume.js`, `execution/inline-turn.js`,
`execution/accepted-delivery-deployment.js`, and `execution/workflow-steps.js`
under `node_modules/eve/dist/src/`.

The next controlled test must preserve the existing conversation's history,
approvals, identity, and binding. Eve's public reset/clear/rekey operations are
not history-preserving workflow migration APIs. A fresh isolated conversation
can test same-deployment execution, but creating it must not silently replace
the user's existing session.

## Verification and restoration

Before deployment, `pnpm check` passed with 1,176 tests passed and two skipped;
the synthetic-environment build and `git diff --check` passed. The updated agent
diagram was rendered in Safari. These checks establish probe correctness within
their scope, not a speedup. Paid Square evals and final PR delivery remain gates
for an eventual behavior change.

After the three probes, production was restored to
`dpl_D1eUMmZsLY737t7daavHrrkp4Lv8`, revision
`d09f4e9a5308ac82657f13c1b3c8cbc617fcea38`. Canonical deployment identity and
the ready health response were verified. Both temporary latency environment
variables and the task-created local environment export were removed.

See `linq-latency-probe.json` for numeric records and
`linq-latency-web-baseline.json` for a separate failed web-delivery baseline.

## Lifecycle inspection and same-deployment control

Read-only Workflow CLI 4.8.5 inspection retrieved lifecycle metadata without
decrypting stored content. In sample B, the parent inbox received the delivery
at 14:12:21.399 UTC. Its next hook was created at 14:12:25.140. Request metadata
puts the parent request start at 14:12:21.547, so 3.593 seconds elapsed inside
that request before the next hook. This is not all queue waiting.

The parent then ran `turnStep` from 14:12:25.424 to 25.777, followed by
`dispatchTurnStep` from 26.077 to 26.725. This confirms that the child fallback
actually executed. The child was created at 26.650 and started at 26.757;
its first `turnStep` started at 28.104. The application turn began at 28.773.
Thus child run startup took 107 ms; the following gaps were 1,347 ms before the
step and 669 ms inside the step before application turn start. Neither gap is
yet attributed to a single internal operation.

Two benign follow-ups in the earlier synthetic web session tested an existing,
short-history session whose parent matched the serving deployment. Neither
used `dispatchTurnStep`. They still took 3,127 ms and 3,025 ms from inbox receipt
to the next hook. Each first turn step retried once, with 1,446 ms and 1,478 ms
between the retry event and its next start. Error data was encrypted and was
not decrypted; the retry cause remains unknown. Both replies were correct,
arriving in 7,991–8,349 ms and 8,640–8,995 ms locally. These are framework
controls, not matched Linq performance samples.

This refutes deployment mismatch as the sole cause. The older parent adds a
child dispatch, but a substantial pre-hook wait and first-step retries also
occur without it. Do not infer that long conversation history alone causes
the pre-hook delay.

Eve 0.52.2 is being evaluated as an upgrade candidate. Its published package
changelog identifies a 0.52.0 change (`b3e4b73`) removing hook-metadata decryption
from session-ownership resolution and inbox registration/release checks. This
is a relevant hypothesis to test, not measured proof that an upgrade reduces
the observed interval. No release note has established a fix for these retries.
The existing security and compatibility patches must pass their removal or
retention tests before the upgraded runtime is deployed.

Sanitized lifecycle records and control prompts are in
`linq-latency-workflow-baseline.json`.
