# Plan 021: local lifecycle implementation record

Status: **Locally verified implementation; CI and deployed acceptance remain
pending.** This record describes the implemented lifecycle, not a proposed
replacement for it. See [local development operations](../docs/operations/DEVELOPMENT.md)
for commands and operator use.

## Outcome

The repository now has one complete local startup path:

```sh
./init.sh
```

The default is the connected profile. It runs the existing bootstrap behavior,
then hands ownership of Postgres, migrations, Agentation, primary Next/Eve, and
marketing Next to `scripts/dev.ts`. The supervisor has explicit fixture,
status, and stop controls without adding a second startup path.

```text
./init.sh [--profile connected|fixture]
./init.sh --status
./init.sh --stop
./init.sh --check
./init.sh --setup-only [--skip-install]
```

`--check` remains prerequisite-only and changes no files or services.
`--setup-only` may install dependencies and link a fresh canonical development
environment, but never starts services. `--status` is read-only. Unsupported
flag combinations fail before lifecycle mutation.

## Implemented profile contract

| Concern                    | Connected                                                                 | Fixture                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Compose identity           | Stable hash of the current worktree                                       | Unique project and volume for every run                                                                            |
| Database after normal stop | Retained                                                                  | Removed with that fixture project's `down --volumes`                                                               |
| Child environment          | Connected local environment plus selected database/origin                 | Allowlist only; repository credentials are not forwarded                                                           |
| Provider behavior          | Configured local path; credentials are required but unverified at startup | Local contract model by default; no paid-provider probe                                                            |
| Network boundary           | Normal connected behavior                                                 | Root and marketing `.env*` loading is denied; non-loopback fetch, HTTP(S), net, and TLS are denied before dispatch |
| Concurrent verification    | A second development owner is rejected                                    | Verification uses a fresh project and can validate a live parent verification lease                                |

The SendBlue browser suite selects the bounded `sendblue-ui` fixture scenario.
It supplies known synthetic SendBlue values, uses preview configuration, retains
the fixture network denial, and does not contact SendBlue. It is not a general
fixture override and does not relax the application environment guard.

The development-only Agentation toolbar connects to the local Agent Sync service
at `http://127.0.0.1:4747`. The root layout excludes it outside development, so
the local endpoint is not part of the production UI.

## Ownership and run record

Before starting services, `scripts/dev.ts` obtains an exclusive worktree
operation lease. It rejects another development or verification owner that
could race Next/Eve generated output. A fixture started by an active
verification parent validates that parent's nonce and process identity, but it
does not replace or release the parent lease.

The supervisor writes a `0600` JSON run record under the ignored
`.eve/dev-runs/` directory, which is `0700`. The record schema includes:

```text
schemaVersion, runId, nonce, leaseNonce, profile, cwd, baseSha, startedAt
owner PID/start-time/process-group
Compose project and volume
primary and marketing ports and origins
Agentation/app/marketing child PID/start-time/process-group identities
per-service readiness
```

It does not include environment values, credential material, raw provider
traces, or request bodies. Record updates use a same-directory temporary file
and atomic rename so a reader does not see a truncated live record.

`--stop` requires the current worktree, a live matching lease, a live owner
whose command includes the recorded run nonce, and matching process identity
for each child before it signals anything. A malformed, stale, PID-reused, or
mixed record is a refusal to signal; verified stale fixture records still allow
only the exact recorded fixture Compose project to be torn down. This prevents
an unrelated listener or copied manifest from becoming an ownership claim.

## Startup, ports, and failure handling

The lifecycle order is:

1. Validate supported macOS/Linux prerequisites and the selected profile.
2. Claim the worktree lease and create the record with the exact source SHA.
3. Select app and marketing ports before any Next process starts.
4. Start the recorded Compose project, wait for Postgres, discover its loopback
   port, and apply migrations.
5. Reuse a healthy external Agentation service at `127.0.0.1:4747`, or start an
   owned Agentation process.
6. Start primary Next/Eve and marketing with explicit `--port` and
   `--hostname 127.0.0.1` arguments.
7. Require separate readiness for database, migrations, Agentation, primary
   app/Eve, and marketing before reporting ready.

Primary and marketing defaults are 3000 and 3210. Port selection checks
loopback and wildcard IPv4 and IPv6 binds, so a foreign wildcard listener is
not mistaken for an available default. Unset occupied defaults get a recorded
free loopback port; explicit `PORT` or `MARKETING_PORT` conflicts fail before
web children start. The actual primary origin sets `BETTER_AUTH_URL`, probes,
and browser configuration.

The supervisor treats a child exit during readiness as an immediate failure.
Signals abort pending readiness, clean up only verified owned process groups
and the recorded Compose project, then return 130 (`SIGINT`), 143 (`SIGTERM`),
or 129 (`SIGHUP`). If cleanup fails, the lifecycle reports that failure instead
of returning a signal-success code. A small service wrapper watches its parent
and terminates its own child group if the supervisor dies unexpectedly.

## Bootstrap and Eve link contract

For connected bootstrap, `init.sh` creates `.env.local` from `.env.example`
only when absent, preserves a customized incomplete file, and restores the
template if linking fails. It requires `KERNEL_API_KEY` and either
`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` before startup, while never
printing their values.

When a fresh or unchanged template needs linking, source reads the canonical
app production target from `config/production-targets.json`, then performs a
read-only Vercel GET by its stable project and team IDs. The live project ID,
name, and team ID must match the inventory before Eve receives the proven name
and team ID. The default target name is `jory`. An alternate requires both
`OPENINSTINCT_VERCEL_PROJECT` and `OPENINSTINCT_VERCEL_TEAM`; it is queried in
that selected scope and must already exist before Eve receives its returned
name and team ID. The installed Eve 0.49 documentation states that `eve link`
can create an absent project, so no Eve link occurs after a missing,
inaccessible, renamed, or mismatched target. `eve deploy` remains the
production deployment command. Plan 021 uses neither provisioning nor deploy
during local bootstrap, and it does not confirm credential validity or provider
access.

## Verification evidence

The required behavioral RED was observed before lifecycle implementation:

```text
./init.sh --profile fixture
Unknown option: --profile
exit 2
```

Focused regression coverage exercises profile parsing, non-mutating checks,
fresh/template environment handling, lease and run-record validation, stale or
forged manifest refusal, process cleanup, cleanup failure, fixture egress,
fixed and wildcard port conflicts, fixture Compose isolation, migration failure,
pre-existing Agentation, child failure during readiness, and signal handling.

Focused checks run after the implementation included:

```text
pnpm vitest run tests/unit/init-script.test.ts \
  tests/unit/local-lifecycle-ownership.test.ts \
  tests/local-development.test.ts \
  scripts/tests/eval-square.test.ts --reporter=dot
# 36 tests passed across 4 files

pnpm exec tsc --noEmit --pretty false | rg 'scripts/(dev|local)|playwright'
# no lifecycle or Playwright diagnostics

git diff --check
# passed
```

On 2026-09-12, the lead observed the real complete fixture stack serving the
primary app and marketing app, completing a synthetic chat reply, and surviving
a browser reload. A synthetic administrator also reached the admin overview,
with empty vault and task states observed. After the development toolbar added
its local Agentation endpoint, a prior synthetic annotation synchronized during
HMR and route navigation into two local sessions. The local MCP client
acknowledged, replied to, and resolved both records, leaving zero pending
annotations. This is fixture-only local acceptance and local feedback-loop
evidence; it does not establish OTP delivery or Vercel production behavior.

Also on 2026-09-12, `./init.sh --setup-only --skip-install` completed with no
services started. It created a mode-`0600` `.env.local` and linked the
inventory-verified app target `prj_GIIYS7WKKuY0400OCVVFntPw1H0r` in team
`team_cwyLpng8LCwWgINdiQ27hHYa` as `jory`. This is evidence for local
setup-only bootstrap and its target-identity preflight; it does not prove a
connected provider request or Vercel deployment.

The observed fixture teardown completed after that browser journey: its owner
exited with status 143, `./init.sh --stop` exited 0, and no owned containers,
network, volume, run record, or operation lease remained. The pre-existing
foreign port-3000 listener and healthy Agentation process remained untouched.

A connected run from 21:28 to 21:33 UTC completed a simple paid-provider reply.
Its retained metadata records eight successful Kernel browser-session creates
and eight matching deletes. It was not a clean browser-agent journey: the root
made 30 browser-agent calls in one turn, 15 were rejected as `AGENT_BUSY`, and
four child turns ended with `OUTPUT_SCHEMA_NOT_FULFILLED`. The evidence does not
identify local lifecycle tooling as the cause; a runtime assignment regression
is required before treating a connected browser journey as accepted.

The required Square evaluation completed with `Results: 12 passed, 1 scored`.
The final local `pnpm verify` run
`df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` also passed on the stable source
fingerprint: 1,949 checks passed, with six expected Postgres skips, six Real
Postgres checks, 15 contract checks, 26 Playwright checks plus one known skip,
both builds, and owned cleanup passing. This does not prove a deployed provider
or user journey.

## Remaining follow-up

- Keep the connected repeated browser-assignment observation as a separate
  runtime follow-up. It is not evidence that lifecycle tooling caused or fixes
  the issue.
- Record CI and deployment acceptance separately from the completed local gate.

No production deploy, Vercel mutation, provider call, or credential inspection
is part of this plan's local lifecycle implementation.
