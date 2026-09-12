# Plan 024: agent-operated development and production operations

**Status:** locally verified implementation on this branch, written 2026-09-12
against `7875a08348adf2d567120e7e7f3d803b101aa45a`. The wrapper, metadata
reader, deterministic `pnpm verify` gate, and local lifecycle profiles are not
production-verified or an accepted production procedure. They do not establish
configured-account, credential, provider, or user-receipt behavior.

**Depends on:** Plan 021 (lifecycle contract), Plan 022 (metadata reader), and
Plan 023 (behavioral gates). This plan consumes their source contracts where
implemented; it does not treat any local source or synthetic test as production
proof.

## Purpose

Give an agent one clear way to start and inspect local development, and one
controlled way to observe and operate the Vercel production estate. The design
must make routine work cheap and deterministic, while preserving enough
recorded evidence for a later agent or reviewer to understand what happened.

This is an operating design for the existing application. It does not introduce
a general agent platform, a self-hosted production alternative, or a claim that
local services reproduce production.

## Terms and current state

Production is the configured Vercel-managed application and Eve deployment,
including its workflow and scheduled work, database, Kernel, private Blob
store, AI gateway, and configured channels. The marketing application is a
separate deployment inventory item in the monorepo and must not be silently
assumed to share the application's project, environment, release, or evidence.

The following are current interfaces, not proposals:

| Need                           | Current owner/interface                                                                                   | Limits                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Start the complete local stack | `./init.sh`                                                                                               | Starts the primary application and marketing app for local development only; it is not production parity.                               |
| Local quality gates            | `pnpm check`, `pnpm build`, focused tests, real-Postgres runner, contract evals, and E2E where applicable | The exact required subset comes from the change and CI policy.                                                                          |
| Application deployment         | Existing Git-connected Vercel release flow                                                                | A merge already releases through that configured flow; a new control must not create a competing default direct deploy.                 |
| Eve deployment behavior        | Eve's installed deployment guide and existing Vercel configuration                                        | `eve link` and `eve deploy` can create/link projects or pull environment data in some modes; observation commands must not invoke them. |
| Vercel inspection and logs     | Pinned Vercel CLI and [`docs/operations/VERCEL.md`](../docs/operations/VERCEL.md)                         | Every query must identify the intended deployment and have a bounded time range.                                                        |

The current five GitHub workflow jobs are `Checks`, `Build`, `Real Postgres`,
`Contract evals`, and `E2E`. Vercel preview deployments caused by pushes are a
separate cost and evidence surface from GitHub CI.

## Evidence that grounds this design

This plan is based on the checked-out source at the stated SHA and the installed
CLI/documentation, not on a production inspection. The relevant current
evidence is:

- `package.json` defines the current `check`, build, `verify`, and `diagnose`
  commands.
- `vercel.json:3-9` defines the Vercel build command and the five-minute
  `/api/cron/drain-webhooks` schedule.
- `turbo.json:20-38` makes the Vercel build depend on `db:migrate` and defines
  its environment contract.
- `src/env.ts:75-119` declares the current Vercel, Blob, Kernel, cron,
  connector, Square, and SendBlue configuration names and their validation;
  `db/drizzle.config.ts:5` uses the direct migration URL.
- `agent/channels/sendblue.ts:60-170`, `agent/channels/linq.ts:79-87`,
  `agent/connections/square.ts:9`, and `agent/lib/google-workspace/client.ts:18-62`
  show the current channel/connector owners that the inventory must describe.
- [`docs/operations/VERCEL.md`](../docs/operations/VERCEL.md) documents the
  current Git/Vercel/Eve procedure and historical deployment reference; it does
  not provide a production-control wrapper.
- Installed `eve/docs/README.md`, `guides/deployment/overview.md`, and
  `guides/deployment/vercel.mdx` distinguish Vercel deployment from self-hosting
  and show that Eve linking/deploy flows can mutate or pull environment data.
- Installed Vercel CLI `59.6.2` help documents explicit deployment log filtering
  and reports `--no-follow` as a no-op.

## Implemented inventory and reader contract

`config/production-targets.json` is the implemented non-secret inventory for
an application or marketing surface/environment pair. It contains no
credentials, credential hashes, raw URLs with credentials, or private traces.
`scripts/diagnostics/read-target.ts` projects only allowlisted facts. Inventory
records declare intent; Vercel and runtime readers separately mark facts
`observed`, `unknown`, or `mismatch`. A recorded configuration name never proves
a usable credential.

| Evidence group                                       | Implemented declaration or observation                                                                                                                                                 | Limit and operation rule                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declared inventory target                            | `surface`, `target`, stable project ID, and optional team ID, project name, canonical origin, and Git ref                                                                              | These are the only fields stored in `config/production-targets.json`. They declare the selected surface; they are not health evidence.                                                                                                                   |
| Deployment identity                                  | The reader can observe project/team/environment, a production alias-to-immutable-deployment mapping, deployment state, immutable origin, and declared source SHA                       | Alias, immutable URL, and canonical auth origin remain separate facts. Production `apply` revalidates the selected alias, deployment, and SHA; preview requires an exact immutable deployment ID.                                                        |
| Runtime, database, workflow, resources, and channels | Version/patch/lock inputs, database identity, migration/schema/configuration, workflow/session/schedule, Blob/Kernel, and connector/channel facts are separate operation-time evidence | They are never inferred from an inventory record. Missing evidence remains explicit unknown; rollback and the relevant owner operations block on their required facts. A configuration name or attachment does not prove usable credentials or delivery. |

Plan 022's read-only interface is implemented by the metadata reader and
diagnostic command. The boundary is:

```ts
readTarget({ target, surface, deploymentId? }): Promise<TargetReadResult>
pnpm diagnose --target <local|preview|production> --surface <app|marketing> --status
pnpm diagnose --target <local|preview|production> --surface <app|marketing> \
  --session <id> --since <UTC> --until <UTC>
```

The reader uses an allowlisted control-plane/API and CLI metadata surface. It
returns no environment values, secret-derived fingerprints, raw logs, or
provider message content. `status` reports `ready`, `partial`, or `blocked`
with explicit facts and gaps; it does not use a nonzero exit solely for missing
metadata. `plan` and mutating `apply` operations fail closed on their required
unknown or conflicting identity facts. `pnpm diagnose` emits a safe partial
result and exits nonzero when required evidence is incomplete. Target status
uses `readTarget` before a session exists; a journey query requires exactly one
selector and UTC bounds.

## Implemented narrow interface and commands

The `./prod.sh` commands below are implemented on this branch. They remain
unaccepted for production operation until the required runtime and production
acceptance evidence exists. `pnpm verify` and `pnpm diagnose`
are implemented by their owning subsystems; they are not `./prod.sh`
subcommands.

```text
./prod.sh status --target <local|preview|production> --surface <app|marketing> [--deployment <id>]
./prod.sh plan release --target <local|preview|production> --surface <app|marketing> --deployment <current-id> --expected-sha <sha>
./prod.sh plan rollback --target production --surface app --deployment <current-id> --known-good <deployment-id>
./prod.sh apply <reviewed-plan-id> --plan <private-plan-file>
./prod.sh verify <reviewed-plan-id> --plan <private-plan-file> --deployment <immutable-id>
./prod.sh rollback <reviewed-plan-id> --plan <private-plan-file>

pnpm verify
pnpm verify --quick --base <sha>
pnpm verify --lane <lane>
pnpm diagnose --target <local|preview|production> --surface <app|marketing> --status
pnpm diagnose --target <local|preview|production> --surface <app|marketing> --session <id> \
  --since <UTC> --until <UTC>
```

`./prod.sh` is a small front door over the existing Vercel owner. `--surface`
defaults to `app`; a marketing operation must name `marketing` explicitly.
Preview requires an exact immutable `--deployment <id>` selector and never
resolves to “latest.” A normal `release` is an observer of the existing
Git-connected release after a reviewed merge: it never calls `vercel deploy`.
Production reads must freshly resolve the configured canonical alias to the
selected immutable deployment. A timeout or unknown owner outcome records an
uncertain receipt and forbids automatic replay. It never restarts a deployment
because an observation is empty or timed out.

The local entry point exposes explicit profiles and lifecycle commands:

```text
./init.sh                              # connected profile (default)
./init.sh --profile fixture             # deterministic fixture profile
./init.sh --status
./init.sh --stop
```

The ownership-aware status and stop behavior preserve the `./init.sh` startup
recipe and stop only services owned by the invoking session.

## Production control contract

### Read-only `status` and `plan`

`status` and `plan` may read public/control-plane metadata but may not create a
project, link Eve, pull environment values, provision a resource, deploy, write
a database, enable a channel, or send a message. They must report, or mark as
unknown, all of the following for each selected deployment inventory item:

- Vercel team, project ID/name, environment, production alias, immutable
  deployment ID/URL, and deployed Git SHA;
- application and marketing inventory identity, kept separate;
- required schema/migration version, configuration version, and relevant
  workflow/schedule revision;
- Eve/project linkage and configured service identities without secret values;
- configured affected channel names and the selected verification scope.

Metadata may prove that a configuration name is recorded, but never that its
secret value is usable or authorized. Missing secret values, backup owner,
retention policy, approved telemetry sink, or budget owner must be reported as
unconfigured or unknown. The plan must not infer them from a resource name,
deployment success, or redacted metadata.

### Versioned `plan`, `apply`, and receipts

A plan is versioned, fingerprinted, and expires after five minutes. It records
the selected target, exact deployment, source SHA, and (for rollback) known-good
snapshot. Invoking `apply` with that reviewed plan expresses the operator's
authorization for this bounded operation; the wrapper adds no approval system.

Before `apply`, the wrapper revalidates the facts relevant to its operation and
takes a single local operation lock. Release observation requires observed
project, environment, selected deployment, source SHA, and, for production, a
fresh canonical-alias mapping to that deployment. It fails closed on target,
alias, SHA, or expiry drift. Rollback is more restrictive: both the current and
known-good deployments must have observed compatible project/environment,
schema version, configuration version, and logical database identity, plus an
observed `rollbackCompatibility: true` fact. Unknown rollback evidence blocks
rollback. The local lock only serializes this wrapper; a remote Vercel or Git
change remains possible and must be detected by the fresh post-operation read.

Each mutation is recorded with a stable operation ID, non-secret input
fingerprint, owner, result, and next safe step. The local lock serializes this
wrapper's concurrent writes only; Vercel or Git may still change remotely after
revalidation. Use an upstream API conditional request only where its actual
contract supports it, then inspect the result after the write and classify a
conflict as uncertain. A partial failure records resumable evidence. Resume must re-read the recorded outcome and avoid repeating
a completed write. A missing or ambiguous write outcome is uncertain and blocks
automatic replay. Secret values are never hashed or put in a fingerprint.

### Exclusions and required acceptance

The wrapper rejects provisioning, migrations, configuration rotation, channel
activation, connector changes, and any new Vercel or Eve project/resource. It
has no generic recovery or approval machinery for those operations. Use the
applicable reviewed owner runbook, including backups and forward recovery where
needed; do not turn a normal Git-release observation into an authorization for
them.

The wrapper also does not perform browser, provider, channel, cron, artifact,
or cold-agent acceptance. Those checks need a separately reviewed scope. When
an external message is necessary, use only designated approved contacts. A
model-free test does not prove an AI gateway or provider turn, and provider
acceptance does not prove that a user received a message.

## Implemented ownership, tests, and exclusions

| Owner                            | Current paths                                                                                             | Responsibility                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command front door               | `prod.sh`, `scripts/production/cli.ts`                                                                    | Parse the five bounded commands, reject unknown flags, and call the selected owner.                                                                             |
| Inventory and reads              | `config/production-targets.json`, `scripts/production/inventory.ts`, `scripts/diagnostics/read-target.ts` | Keep declared target identity separate from observed facts and redact unsafe output.                                                                            |
| Plan, receipt, and owner adapter | `scripts/production/operations.ts`                                                                        | Create versioned plans, revalidate before observation or rollback, write private atomic receipts, retain uncertain outcomes, and prevent replay.                |
| Focused proof                    | `tests/unit/production-operations.test.ts`                                                                | Exercise read-only status/plan, stale identity, alias drift, preview selection, expiry, locks, uncertain outcomes, replay blocking, and rollback compatibility. |

The release observer does not provision projects, run migrations, rotate
configuration, activate channels, pull environment values, deploy a new Vercel
release, or send a message. Those operations remain unsupported here and route
to their explicit owner runbooks. This wrapper makes no production claim.

The implemented focused test cases must stay behavioral: each status or plan
case proves no owner write; an alias change blocks the planned production
release; preview retains its exact immutable selector; a timeout or crash leaves
an uncertain receipt that cannot replay; and missing rollback compatibility
blocks the owner command. Provider, browser, cron, artifact, and user-facing
channel acceptance need their own reviewed scope and designated contacts where
an external message is involved.

A timed-out observation is not terminal. Retain the recorded handle, use the
same plan only after an operator has resolved the outcome, and never create a
new deployment to recover an empty log or timeout. Record cumulative learning
only as concise reviewed evidence, never raw logs or private traces.

## Cost and CI policy

This branch implements the five-lane `pnpm verify` recipe for local work and
CI. It must preserve visible lane outcomes and failures. A docs-only build skip
is allowed only after a tested, reviewed file-selection rule proves that it
cannot skip an affected build; it cannot be a generic cost shortcut. Vercel
preview deployments remain a separately tracked push cost.

Local-first means the deterministic fixture and unit/integration gates run
before an expensive provider or deployment action. It does not mean local
success proves configured Vercel, database, workflow, channel, Kernel, Blob,
or AI-gateway behavior.

The final local `pnpm verify` run
`df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` passed from
`2026-09-12T22:57:28.102Z` to `2026-09-12T23:00:16.475Z` on source fingerprint
`a37b4e519e6b2a45e568f69dfaaf7571fec9cf252e193b38087e9dbea4709b1c`: 1,949
checks passed, with six expected Postgres skips, six Real Postgres checks, 15
contract checks, 26 Playwright checks plus one known skip, both builds, and
owned cleanup passing. It is a local gate, not CI or deployed acceptance.

## Remaining evidence checklist

- [x] Plans 021–023 provide the implemented lifecycle, metadata-reader, and
      verification contracts used here.
- [x] `status`/`plan` read-only tests prove no linking, pull, creation,
      provisioning, deploy, database write, or external message.
- [x] Release observation records declared inventory identity and observed or
      explicit-unknown deployment facts without representing runtime facts as
      inventory storage or inferring unavailable secret, retention, backup,
      telemetry, or budget data.
- [x] `apply` rejects target drift before writes and records resumable,
      non-duplicating outcomes for normal, faulted, and uncertain cases.
- [ ] Migration/config/secret/channel operations require their explicit plan
      evidence and authorization; they remain unsupported by this wrapper.
- [x] The full five-lane and selected quick/lane gates report every result
      without silent skips.
- [x] Deterministic failure-injection and resume evidence is reviewed for the
      local operation and receipt paths.
- [ ] Deployment verification still needs served-runtime binding, rollback
      compatibility and result, and the applicable provider/user-receipt facts.
- [x] Runbooks label proposed and implemented behavior accurately; no raw
      private content, secret values, or production traces are added.

## Safe command reference

The commands below are examples of current, read-only inspection or local
verification. Replace placeholders deliberately; do not rely on a linked
project default when assessing production.

```bash
# Current: syntax help is safe to inspect.
pnpm exec vercel inspect --help
pnpm exec vercel logs --help

# Current: deterministic repository gates selected for the change.
pnpm check
pnpm build

# Implemented bounded front door. It remains unaccepted for production use until
# the required runtime and acceptance evidence exists.
./prod.sh status --target <local|preview|production> --surface <app|marketing>
./prod.sh plan release --target <local|preview|production> --surface <app|marketing> --deployment <current-id> --expected-sha <sha>
pnpm verify --quick --base <sha>
pnpm diagnose --target <local|preview|production> --surface <app|marketing> --status
```

For current Vercel operation details, use
[`docs/operations/VERCEL.md`](../docs/operations/VERCEL.md). Raw `vercel logs`
output can contain private operational content when non-interactive use expands
it; inspect it only in an authorized private operator context and never paste it
into an agent response or artifact. Plan 022's allowlisted metadata reader is
the implemented safe observation path. The installed `59.6.2` help says
`logs --no-follow` is a no-op, so an authorized private log query must instead
identify the deployment and use bounded `--since`, `--until`, and `--limit`
arguments.
