# Agent development system

Status: **Locally verified implementation; CI and deployed acceptance pending**,
2026-09-12. The commands below exist in this change. Their owning runbooks
distinguish focused tests, observed local behavior, CI, and deployed acceptance.
A command's presence is not proof that its target is ready.

## Start with the operation

| Need                                        | Entry point                                                          | Owner and instructions                                                           |
| ------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Start the complete local environment        | `./init.sh`                                                          | [Development](operations/DEVELOPMENT.md); connected services, local database     |
| Develop with synthetic data                 | `./init.sh --profile fixture`                                        | Same supervisor; disposable database, simulated model, denied external egress    |
| Inspect or stop the local environment       | `./init.sh --status`, `./init.sh --stop`                             | Exact worktree/run ownership; never identify a process by its port alone         |
| Prove a change before spending CI resources | `pnpm verify`                                                        | [Testing](TESTING.md); all five deterministic CI lanes                           |
| Run a narrower iteration check              | `pnpm verify --lane checks`, `pnpm verify --quick --base <full-sha>` | Partial evidence is labeled; unknown changed paths select the full gate          |
| Diagnose a target or bounded journey        | `pnpm diagnose`                                                      | [Diagnostics](operations/DIAGNOSTICS.md); allowlisted metadata and explicit gaps |
| Inspect a deployed app                      | `./prod.sh status --target production --surface app`                 | [Vercel operations](operations/VERCEL.md); exact project and alias resolution    |
| Release or recover the managed app          | Reviewed Git PR release and `prod.sh` observation/plan controls      | [Vercel operations](operations/VERCEL.md); no second local production runtime    |

Read the relevant runbook and its owning code. Follow other links only when
the change crosses a boundary. [AGENT_GUIDE.md](AGENT_GUIDE.md) describes the
product, source ownership, and required change recipes.

## One chain from request to evidence

```text
requested behavior and failure/recovery cases
  -> exact checkout, target, and authorized scope
  -> existing owner performs the operation
  -> bounded evidence from that owner
  -> appropriate local, CI, and live acceptance
  -> authorized delivery and cleanup
  -> regression or corrected canonical runbook
```

The scripts coordinate Next, Eve, Compose, GitHub Actions, and Vercel. They do
not create a second agent runtime or product approval system. Developer CLI
access does not grant Jory access to repository credentials; a product session
cannot authorize a code release. Existing authentication, tenant ownership,
executor approvals, and vault boundaries remain in force.

## Know which surface is running

The non-secret [target inventory](../config/production-targets.json) records
stable Vercel project/team IDs and intended canonical origins. It is a
declaration to compare against current evidence, not a cached health report.
The reader resolves a production alias to its exact deployment; preview
operations require an immutable deployment selector.

| Surface                 | Runtime and data owner                                                              | Identity to check                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Connected local app     | Primary Next with integrated Eve; worktree-specific persistent Compose Postgres     | Run ID, reported origin, source state, database/migrations, provider capability state               |
| Fixture local app       | Same app/runtime with the existing scripted model; run-specific disposable Postgres | Run ID, fixture profile, synthetic environment, exact resources and cleanup                         |
| Local marketing site    | Separate Next application under `apps/marketing/`, started by the supervisor        | Its own origin and process; it is not the authenticated app                                         |
| Preview app             | Immutable deployment in the configured Vercel app project                           | Project/team, preview target, deployment ID, URL, source, and runtime evidence when accessible      |
| Production app          | Git-connected Vercel project; canonical alias selects a deployment                  | Alias-to-deployment relationship plus independent runtime/database/config evidence                  |
| Deployed marketing site | Independent deployment surface                                                      | Unmapped until a project is positively identified; do not infer an app URL or database relationship |

The configured-team audit on 2026-09-12 read all 24 projects in one complete
page and found only the primary `jory` project among matches for this fork,
Jory/OpenInstinct names, or `apps/marketing`. It did not establish whether a
marketing deployment exists in another team or under an unrecognized project.

Do not collapse these separate facts:

- A Git SHA in deployment metadata identifies the declared build input. The
  served runtime must report its bundled revision to establish a match.
- A production alias, immutable deployment URL, and authentication origin have
  different purposes. One does not prove the others.
- Next/Eve versions, lockfile input, and declared Eve patch input are separate
  facts. A declared patch digest does not attest that a live process applied it.
- Pooled and direct PostgreSQL connections must reach the intended database and
  migration state. Different Neon compute endpoint IDs can refer to one branch;
  ambiguous relationships remain unknown.
- Workflow sessions may remain pinned to an older deployment. Current web
  deployment identity does not prove the revision serving an older session.
- Kernel, private Blob, connectors, and messaging each have their own resource
  and credential scope. Configured credentials do not establish capability.
- Phone OTP configuration and SendBlue/Linq conversation configuration are
  independent. A line supporting iMessage does not prove inbound delivery,
  provider acceptance, or recipient receipt.

The admin-only runtime identity query reports safe configuration, bundled
version inputs, and bounded database/migration evidence. The protected journey
query derives workspace scope from the authenticated user. Neither accepts a
caller-supplied workspace as authority. Unknown facts remain explicit.

## Local operation and ownership

`./init.sh` checks prerequisites and prepares the connected environment before
starting the supervisor. Fixture mode does not link Vercel or load repository
credentials. Both modes start Postgres, apply migrations, start or reuse
Agentation, and start the primary and marketing apps. The supervisor selects
free default ports, rejects occupied explicitly requested ports, and reports
exact `127.0.0.1` URLs before browser work.

Private metadata under `.eve/dev-runs/` binds the worktree, nonce, process start
identities, ports, Compose project, and readiness observations. Stop/recovery
use that record. Connected data survives ordinary shutdown; fixture data is
removed only from the recorded fixture project. Reused Agentation stays running.

A shared worktree operation lease prevents local development and verification
from racing Next/Eve generated output. A verification parent may delegate its
lease to its fixture child. Legacy direct commands do not become safe for
concurrent use merely because their ports differ.

Local status, readiness probes, and a build establish narrower claims than a
user journey. Report provider behavior as simulated, configured, observed, or
unavailable according to actual evidence.

## Verification without unnecessary CI runs

`scripts/verification/lanes.ts` owns the recipes used by `pnpm verify` and the
five CI jobs: Checks, Build, Real Postgres, Contract evals, and E2E. Local heavy
lanes run sequentially. The verifier uses synthetic configuration and writes
per-run receipts under `.eve/verify/` with source fingerprints, input versions,
commands, outcomes, counts, artifacts, and resource evidence.

Start behavior changes with a meaningful failing regression. During iteration,
run the smallest useful check. Before handoff, run the complete local gate on
the final tree. Missing reports, zero discovered tests, unexpected skips,
retry-only passes, cancellation, stale source, and unproven cleanup cannot be
reported as green. Do not weaken a test to make the gate pass.

Quick selection names its base and omissions; it cannot prove omitted behavior.
The gate does not cache previous test results as current success. Paid Square
evals remain a separate required gate for paths listed in `AGENTS.md`; neither
the local deterministic gate nor green PR checks substitutes for them.

The final local `pnpm verify` run
`df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` passed from
`2026-09-12T22:57:28.102Z` to `2026-09-12T23:00:16.475Z` on source fingerprint
`a37b4e519e6b2a45e568f69dfaaf7571fec9cf252e193b38087e9dbea4709b1c`: 1,949
checks passed, with six expected Postgres skips, six Real Postgres checks, 15
contract checks, 26 Playwright checks plus one known skip, both builds, and
owned cleanup passing. This proves the local deterministic gate only; CI and
deployed acceptance remain separate.

A synthetic fixture also exercised the compiled production-mode identity route
with a synthetic admin cookie. It confirms that the built local server retains
its approved identity fields; it does not attest a Vercel-served runtime.

## Diagnose before changing state

Start with target status or an exact session/run selector and a UTC window no
longer than 24 hours. Read the relevant owner. Diagnostic output joins records
only through explicit identities and uses allowlisted metadata; it does not
print message bodies, credentials, vault values, or raw tool output.
Unavailable and truncated readers remain visible.

A worker's completion is distinct from the root reporting its result, provider
acceptance, and recipient delivery. An empty browser table or lossy log response
does not prove a worker never ran. Current health does not settle an older task.
Preserve those distinctions when deciding where to investigate next.

Production remains managed by Vercel. Git merge triggers the existing release
path; tooling observes that release instead of launching a duplicate deployment.
Rollback requires a selected deployment and compatibility evidence. Missing
resource mapping blocks the affected operation; it does not justify inventing
infrastructure or changing unrelated settings.

## Handoff and reusable learning

A PR, issue, or existing task record is enough. Record the behavior contract,
exact checkout/target, scope, tests and artifacts, unresolved evidence, live
owned resources, and one next action. Refresh time-sensitive target and process
state when resuming. Do not replay a possibly completed external operation
because a previous response was lost.

Turn an observed failure into a regression or corrected runbook through normal
review. Record the relevant date/version and what would invalidate the lesson.
Keep sanitized engineering evidence in the owning docs and tests; do not create
permanent rules from a model's self-report or an unreviewed trace.

Implementation and acceptance details are in [Plan 021](../plans/021-local-lifecycle.md),
[Plan 022](../plans/022-diagnostic-evidence.md), [Plan 023](../plans/023-local-verification-gate.md),
and [Plan 024](../plans/024-production-operations.md). Older plans require
revalidation against current source before execution.
