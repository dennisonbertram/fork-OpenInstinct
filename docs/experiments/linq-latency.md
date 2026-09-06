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
