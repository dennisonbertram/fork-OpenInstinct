# Local development operations

`./init.sh` is the canonical complete local startup command. It starts the
primary Next application containing Eve, Postgres and migrations, Agentation,
and the separate Jory marketing application. `scripts/dev.ts` is the single
supervisor for that stack; direct `pnpm dev:app` and `pnpm dev:marketing` are
component commands for an already-managed local environment.

Use [the Vercel runbook](VERCEL.md) for deployment operations. A local build or
connected local process does not establish Vercel production behavior.

## Commands

| Command                                        | Behavior                                                                                                          | Ownership and data boundary                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `./init.sh --check`                            | Checks Node 24, `pnpm`, Docker, Compose v2, and the Docker daemon.                                                | Read-only: it does not install, link, edit files, start services, or probe providers.                                                                                          |
| `./init.sh --setup-only`                       | Installs the frozen dependency graph unless `--skip-install` is used; prepares connected credentials, then exits. | It creates `.env.local` only when absent and preserves a customized incomplete file. It may link the canonical development Vercel project.                                     |
| `./init.sh` or `./init.sh --profile connected` | Starts the connected complete stack.                                                                              | One connected owner is allowed per worktree. Its Compose volume persists across ordinary shutdown.                                                                             |
| `./init.sh --profile fixture`                  | Starts a synthetic complete stack for local and browser verification.                                             | Every fixture run has its own Compose project and volume, a whitelisted child environment, and denied non-loopback egress. Fixture teardown removes only that run's resources. |
| `./init.sh --status`                           | Reports run-record state and liveness.                                                                            | Read-only. It neither installs nor starts services.                                                                                                                            |
| `./init.sh --stop`                             | Stops the exact recorded run.                                                                                     | It validates the worktree lease, supervisor command, PID start time, nonce, and owned child identities before signaling. It never adopts a familiar port listener.             |
| `pnpm dev`                                     | Starts the connected stack through the same supervisor.                                                           | Requires `KERNEL_API_KEY`; shares the connected worktree ownership rules.                                                                                                      |
| `pnpm dev:app`                                 | Starts only the primary Next application.                                                                         | The caller supplies a ready database and migrations.                                                                                                                           |
| `pnpm dev:marketing`                           | Starts only marketing Next.                                                                                       | The caller owns its port and lifecycle. Use `PORT=3210 pnpm dev:marketing` beside a primary app on 3000.                                                                       |
| `pnpm test:e2e`                                | Runs Playwright using the fixture profile.                                                                        | The verification runner supplies isolated app and marketing ports, a verification lease, and a per-run fixture database. It does not share connected Compose resources.        |
| `pnpm eval:square --with-database`             | Runs database-backed Square evaluation.                                                                           | It uses a random, owned Compose project and removes only that project's volumes after the evaluation. It does not share the connected database.                                |

`--status` and `--stop` cannot be combined with profile, setup, check, or
install flags. Fixture startup cannot be combined with `--check` or
`--setup-only`.

## Connected bootstrap

The connected path runs prerequisite checks, installs dependencies unless
skipped, and creates `.env.local` from `.env.example` only when it is absent.
The file is set to mode `0600`. A customized file with missing required values
is left unchanged and startup explains the missing inputs without printing them.

For a fresh or unchanged template, `init.sh` first reads the canonical app
target from `config/production-targets.json` and performs a read-only Vercel
project GET by the inventory project and team IDs. It requires the live ID,
project name, and team ID to match that inventory before it invokes Eve:

```sh
pnpm exec eve link --non-interactive \
  --project "jory" \
  --team "team_cwyLpng8LCwWgINdiQ27hHYa"
```

When the overrides are unset, the source selects the inventory's canonical
project `jory` and its stable team ID. Eve documents `eve link` as capable of
creating a project when absent, so the preceding GET is required and an absent,
renamed, inaccessible, or mismatched target stops before Eve runs. Setting both
`OPENINSTINCT_VERCEL_PROJECT` and `OPENINSTINCT_VERCEL_TEAM` is an explicit
alternate target intent; it is also read back through the selected Vercel scope,
must already exist, and Eve receives the returned project name and stable team
ID. This is bootstrap/linking only, not a deploy.
The connected path requires a non-empty `KERNEL_API_KEY` and either
`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` before it starts services. Presence
of those values does not prove provider access or a successful model request.

## Startup, ports, and readiness

The supervisor claims a worktree lease, records its exact source revision, then
starts its database project, waits for database health, applies migrations, and
starts Agentation, primary Next/Eve, and marketing. Agentation at
`127.0.0.1:4747` is reused only when its health endpoint is available; it is
then recorded as external and remains running on local shutdown.

The primary application and marketing bind to `127.0.0.1`. Defaults are 3000
and 3210. Before launching Next, the supervisor checks loopback and wildcard
IPv4/IPv6 availability. If an unset default is occupied, it chooses and records
another free loopback port. If `PORT` or `MARKETING_PORT` explicitly asks for an
occupied port, startup fails before any web child starts. Next is launched with
the chosen `--port` and `--hostname 127.0.0.1`, so it cannot silently select a
different port. The record and `BETTER_AUTH_URL` use the resulting
`http://127.0.0.1:<port>` primary origin.

Readiness is per service: database, migration, Agentation, primary app/Eve, and
marketing are recorded separately. An owned child exit or signal aborts pending
readiness immediately and begins owned cleanup. A healthy HTTP response from an
unrelated process is not enough to mark an owned web service ready.

When the application runs in development, its existing Agentation toolbar uses
the local Agent Sync endpoint at `http://127.0.0.1:4747`. The root layout does
not render that toolbar outside development, so this endpoint is not added to
the production UI.

## Profiles and cleanup

Connected mode uses a stable Compose project per worktree. Its ordinary
shutdown runs `docker compose down` and retains the named database volume, so
connected development data is available on the next start.

Fixture mode creates a run-specific Compose project and volume. Its child
environment contains only the values needed for synthetic local execution; it
does not forward repository credentials. The fixture guard prevents root and
marketing repository `.env*` loading and rejects non-loopback `fetch`, HTTP,
HTTPS, socket, and TLS requests before dispatch. The default fixture uses the
local contract model. The bounded SendBlue browser scenario uses known synthetic
SendBlue values with preview semantics and the same egress denial; it does not
send a real OTP. Fixture cleanup runs `docker compose down --volumes` only for
the exact recorded fixture project.

Each active run has a metadata-only record in `.eve/dev-runs/` (directory mode
`0700`, record mode `0600`). It records profile, worktree, source SHA, run and
lease nonces, owner and child PID/start-time/process-group identities, Compose
and volume names, ports, origins, and readiness. It excludes environment
values, model payloads, and raw traces. Updates use an atomic same-directory
rename. Invalid or stale records are reported rather than treated as permission
to signal an unrelated process.

Signals are forwarded to verified owned process groups. The public launcher
forwards direct `SIGINT`, `SIGTERM`, and `SIGHUP` to its internal supervisor and
waits for cleanup. A successful signal cleanup returns 130, 143, or 129. A
cleanup failure returns a lifecycle error instead of masking it with a signal
status. The service wrapper also terminates its children if its supervisor dies.

## Verification and acceptance

Focused lifecycle tests cover bootstrap arguments, non-mutating checks,
ownership validation, forged or stale manifests, fixture egress, Compose
isolation, port conflicts, child failure, signal cleanup, and cleanup-failure
status. The fixture Playwright configurations pass `DEV_PROFILE=fixture`, use
`127.0.0.1` base URLs, and pass the runner-selected `MARKETING_PORT`. A
verification parent may share its live worktree lease with its fixture child;
the child validates but never releases that lease.

The following real fixture acceptance was observed locally on 2026-09-12:

- The complete fixture stack reached the primary app and marketing origins.
- A synthetic chat reply completed and the page reloaded successfully.
- A synthetic administrator signed in and reached the admin overview; empty
  vault and task states were also inspected.
- A synthetic Agentation annotation created before the endpoint fix synced on
  HMR and route navigation into two local Agentation sessions. Both annotation
  records were acknowledged, replied to, and resolved through the local MCP
  client; pending annotations then reached zero.

On the same date, connected bootstrap was observed with
`./init.sh --setup-only --skip-install`: it exited successfully without starting
services, created a mode-`0600` `.env.local`, and linked the inventory-verified
app project `prj_GIIYS7WKKuY0400OCVVFntPw1H0r` in team
`team_cwyLpng8LCwWgINdiQ27hHYa` as `jory`. This proves the local setup-only
path and target-identity preflight, not connected provider behavior.

The connected run from 21:28 to 21:33 UTC also completed a simple paid-provider
reply. Its retained metadata records eight successful Kernel browser-session
creates and eight matching deletes. That evidence is narrower than a clean
browser-agent journey: the same root turn made 30 browser-agent calls, 15 of
which were rejected as `AGENT_BUSY`, and four child turns ended with
`OUTPUT_SCHEMA_NOT_FULFILLED`. The runtime assignment gap remains separate from
the local lifecycle finding.

The fixture `--stop` acceptance also completed: the owner exited with status
143, `./init.sh --stop` returned status 0, and the owned Compose containers,
network, volume, run record, and worktree lease were gone. The pre-existing
foreign listener on port 3000 and healthy Agentation service remained running.

The following follow-up remains open:

- Track the repeated connected browser-assignment observation as a separate
  runtime follow-up. It is not a local lifecycle acceptance blocker and does
  not identify lifecycle tooling as its cause.

The final local `pnpm verify` run
`df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` passed on the stable source fingerprint:
1,949 checks passed, with six expected Postgres skips, six Real Postgres checks,
15 contract checks, 26 Playwright checks plus one known skip, both builds, and
owned cleanup passing. CI and deployment acceptance remain separate.

Fixture output is simulated local evidence. It does not prove a paid provider,
phone delivery, Kernel behavior, or Vercel deployment.
