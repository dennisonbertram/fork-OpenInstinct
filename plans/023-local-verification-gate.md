# Plan 023: A reproducible local gate for the five deterministic CI lanes

> **Purpose**: Give a fresh agent one accurate testing guide and one local
> front door for the deterministic checks that GitHub Actions runs. Use the
> same owned lane registry locally and in CI, keep the lanes serial in a
> worktree, and bind each result to the source tree and synthetic fixture that
> produced it.
>
> **Status discipline**: The CLI and CI dispatch integration are implemented,
> and the five-lane local gate passed on the recorded source fingerprint below.
> That is local acceptance only; hosted CI evidence awaits delivery of an exact
> revision and is not promised by this plan. No deployment is promised. The
> named completion-journey skip remains an explicit coverage gap. No paid eval,
> deployment, or production proof is part of this plan.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 021's development/fixture lifecycle contract and
  `scripts/local/worktree-lease.ts`. Preserve Plan 022's separate
  `diagnose` command; it is not a verification lane.
- **Category**: developer experience and test reliability
- **Baseline**: `7875a08348adf2d567120e7e7f3d803b101aa45a`
- **Current state**: local implementation and five-lane acceptance complete;
  hosted CI for a delivered revision is not established by this plan.

## Problem and outcome

The baseline had five required-looking CI jobs with separate commands, while
the root handoff guide named only `pnpm check`, `pnpm build`, and
`git diff --check`. The check lane also ran the marketing check, which performs
marketing build work, and the separate build lane ran it again. A developer
could push without reproducing the complete deterministic gate. The five job
names existing in YAML do not prove that branch protection requires them.

The outcome is one command, `pnpm verify`, that runs `checks`, `build`,
`real-postgres`, `contract-evals`, and `e2e` in order using a single recipe
registry. GitHub keeps the same five named jobs and calls the same registry
with `pnpm verify --lane <name>`. The command reports honest partial, failed,
flaky, blocked, cancelled, stale, and not-run evidence. It does not infer that
a green suite proves all prior behavior unchanged.

Use `pnpm verify --quick --base <full-sha>` only to shorten deterministic
iteration. Its owner map is conservative: an unmapped path, empty change set,
invalid base, shared manifest/config/schema/migration/agent/application owner,
or other broad input runs all lanes or fails incomplete. Quick selection is a
convenience, not a semantic coverage oracle. An agent still records a real
behavioral RED before editing behavior-changing code, names the intended delta,
and lists the unaffected invariants to check.

## Verified baseline facts

At the baseline SHA, `package.json` had no `verify` script. The workflow ran on
every pull request and pushes to `main` or `master`, with no path filters; it
defined stable jobs `Checks`, `Contract evals`, `E2E`, `Build`, and
`Real Postgres`. `Contract evals` depended on `Checks`. Each job independently
installed via `pnpm install --frozen-lockfile`; setup-node cached the pnpm
package store. The workflow uploaded reports on failure/cancellation where
available. The YAML alone does not establish branch-protection requirements.

`pnpm check` runs Turbo lint, application type generation/typecheck, Vitest,
format checking, Knip, boundaries, and the marketing app check. Vitest's unit
project excludes `tests/integration/`; the integration project covers that
directory. `REAL_PG` unset auto-detects Compose, `REAL_PG=0` skips the guarded
PostgreSQL cases, and `REAL_PG=1` requires an active Compose PostgreSQL
service. A fresh CI Checks job did not start that service. The distinct
real-Postgres supervisor starts its own unique Compose project, runs the
unfiltered required integration file, and removes its project and volumes.

The contract supervisor starts owned fixture services, runs scripted strict
product contracts and the mounted-extension harness, and attempts cleanup on
failure or interruption. The Playwright configs cover the ordinary authenticated
app journeys and the SendBlue OTP UI scenario. Before this implementation,
CI configured one retry while direct local Playwright used zero retries; a
retry-pass could otherwise look green. These facts are confirmed against the
baseline docs, workflow, package scripts, tests, and supervisor code; the
current recipes below reflect the implemented workflow.

## Recorded local acceptance

The complete `pnpm verify` run
`df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` passed on base
`7875a08348adf2d567120e7e7f3d803b101aa45a`. Its source fingerprint was
`a37b4e519e6b2a45e568f69dfaaf7571fec9cf252e193b38087e9dbea4709b1c` at both
start and finish. The receipt is
`.eve/verify/df87a3e9-eca9-471b-9f0c-2b1a398a0ecd/receipt.json`; the run began
at 2026-09-12 22:57:28.102 UTC and ended at 23:00:16.475 UTC. It released its
worktree lease.

All five lanes passed: Checks recorded 1,949 passed and six intentional
real-Postgres skips; both app builds passed; real Postgres passed 6/6; contract
evals passed 15/15; and E2E passed 26 cases with one documented completion
journey skip and no flaky cases. Every lane reported cleanup passed. The named
E2E skip remains an unverified behavior and a coverage gap; the successful gate
does not prove that all product behavior is unchanged.

This receipt proves local acceptance for its exact source fingerprint. It does
not establish hosted CI for a delivered revision; that evidence awaits delivery
and is not promised here. No deployment or production result is claimed.

## Scope and ownership

The verification implementation may edit only these paths:

- `scripts/verify.ts` and `scripts/verification/**` for argument parsing,
  lane recipes, changed-path selection, environment profiles, child process
  ownership, evidence validation, and receipts;
- `tests/unit/verification-runner.test.ts`,
  `tests/unit/verification-contract.test.ts`, and
  `tests/unit/ci-workflow.test.ts` for black-box and contract tests;
- `package.json` only to add or coordinate `verify` and `diagnose` script
  entries, without dependency or lockfile changes;
- `.github/workflows/checks.yml` to switch each existing job to the shared lane
  command, without changing trigger, job name, branch-protection or failure
  policy;
- `turbo.json` only to pass the fixture guard (`NODE_OPTIONS` and
  `VERIFY_REPO_ROOT`) and run identity (`VERIFY_RUN_ID`) into strict-mode
  `test:app` and `types:generate` tasks;
- `scripts/test-real-postgres.ts` and `scripts/run-contract-evals.ts` only to
  write bounded, safe per-run supervisor evidence under the runner-owned
  `.eve/verify/<run-id>/` directory while preserving their default CLI and
  cleanup contracts;
- `knip.config.ts` to register the dynamic fixture preload and remove a truly
  unused verification export;
- `docs/TESTING.md` and this plan.

Plan 021 owns `scripts/dev.ts`, Playwright startup configuration, fixture
isolation, and lifecycle tests. Do not edit those files under this plan. The
verification runner reuses the exact parent verification lease for fixture
startup and releases only its own lease. Other documentation/navigation files
are owned by the lead or their designated writers. Do not reformat or clean
other worktree changes. No application behavior, auth, provider, schema, or
migration code is in scope.

## Current command interface

| Command                                                                | Current behavior                                                                                                                       | Use                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm verify`                                                          | Runs all five deterministic lanes serially; stops after the first non-green lane; produces one private receipt                         | Complete local handoff gate; all five lanes must pass   |
| `pnpm verify --quick --base <full-commit-sha>`                         | Requires an ancestor SHA; considers changed tracked and non-ignored untracked paths; unknown/high-impact inputs fall back to all lanes | Faster local iteration, never a semantic coverage claim |
| `pnpm verify --lane checks\|build\|real-postgres\|contract-evals\|e2e` | Runs exactly one named recipe from the registry                                                                                        | Focused lane diagnosis; does not prove other lanes      |

Invalid, missing, or conflicting flags exit nonzero. Missing commands,
Docker/browser prerequisites, startup, migration, report, cleanup, cancellation,
or source-fingerprint evidence produce a non-green status. The runner does not
accept list/filter arguments for a required full lane.

The registry calls these recipes:

| Lane             | Recipe and evidence boundary                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks`         | `pnpm check` with `REAL_PG=0`, then `git diff --check`; requires root and marketing test command headings and non-empty summaries, no failed tests, and exactly six intentional real-Postgres skips                                                                                                                                                                                     |
| `build`          | `pnpm build` with synthetic database, auth, Kernel, and encryption settings; both `.next/BUILD_ID` files must be fresh for this run                                                                                                                                                                                                                                                     |
| `real-postgres`  | `node --experimental-strip-types scripts/test-real-postgres.ts`; the owner starts a unique project, runs the full required file, emits JUnit and migration metadata, then tears down its volumes                                                                                                                                                                                        |
| `contract-evals` | `node --experimental-strip-types scripts/run-contract-evals.ts`; requires both core and mount-harness JUnit, delivery-provider fixture snapshot, migration metadata, and cleanup success                                                                                                                                                                                                |
| `e2e`            | Runs each Playwright config with `--fail-on-flaky-tests --reporter=html,json` and `CI=1`; requires non-empty reports, exact fixture identity/readiness for app and marketing, and successful owned fixture cleanup. The web report must include the exact existing completion-journey case; its one static skip is recorded by file/title/project, while every other skipped case fails |

The E2E runner uses a unique fixture run ID and Compose project for each
configuration, assigns free loopback app/marketing ports, denies repository
`.env` reads and non-loopback network use, and requires a live exclusive
worktree verification lease. Playwright retry-pass results remain `flaky` and
non-green. Fixture readiness reports database and migration readiness but does
not independently attest a database journal revision. E2E target evidence
records launch source SHA and fingerprint; it does not claim an independent
served-source attestation. The current suite also has one explicit static skip
in `tests/e2e/completion-journey.spec.ts`, titled “reports settled background
work, and answers a later question from evidence” in project `chromium`. The
contract fixture cannot provide a serializable durable-subagent model, so this
user-visible settled-worker and later-answer journey remains unverified. The
runner records this exact exception in the E2E receipt and rejects every other
skip. If the named case becomes active, it must pass normally.

## Receipt and cache contract

The runner creates an ignored private directory at `.eve/verify/<run-id>/` and
writes a mode-0600 `receipt.json` atomically. It records schema/run IDs, mode,
coverage, repository root, base and `HEAD` SHA, a fingerprint for tracked and
untracked source including mode, changed paths, toolchain/platform, digests for
lockfile/package/registry/workflow/Vitest/Playwright inputs, lane selection and
reason, exact commands and arguments, timestamps, process results, test
counts, target and database metadata, cleanup outcomes, and digests for
produced artifacts. Each started step writes a bounded combined output log in
the same run directory; receipt entries identify its repository-relative path,
SHA-256, and truncation state but do not embed its contents. No environment
values, provider credentials, connection strings, chat text, or trace payloads
belong in the receipt.

Changed `.env` files and private `.eve` traces are identified only by category;
because their contents are deliberately excluded from the fingerprint, a
changed such path blocks verification instead of yielding green evidence.
Source is fingerprinted again before finalization; source or HEAD drift makes
the receipt stale. JSON metadata is parsed at the read boundary. Artifact and
receipt paths are constrained to the private current run, written without
following symlinks, and files are not reused from prior runs.

The receipt distinguishes the source migration journal revision from what the
database journal independently reported. If the supervisor only observed its
own successful migration command or a readiness signal, record that exact
evidence; do not copy the expected revision into an observed field. Targets
and databases that a lane does not exercise are truthfully `not-applicable`.

Do not cache passing tests or evals. The verification `checks` child sets
`TURBO_FORCE=true` and disables Turbo telemetry and update notices for that
child. It strictly passes only `NODE_OPTIONS`, `VERIFY_REPO_ROOT`, and
`VERIFY_RUN_ID` into the `test:app` and `types:generate` tasks so the guard
continues to run after Turbo filters its environment. A temporary regression
uses the installed Turbo CLI to prove the guard reaches an actual task, an
unlisted parent canary does not, and forced repeated invocations execute rather
than replay a cache result. Turbo documents
[`TURBO_FORCE`](https://turborepo.dev/docs/reference/system-environment-variables)
and task [`passThroughEnv`](https://turborepo.dev/docs/reference/configuration#passthroughenv).
The current workflow reuses the pnpm package store through setup-node; that is
dependency content, not test evidence. Turbo already disables `test:app`
result caching, and there is no configured shared remote test-result cache.
Keep the current duplicate marketing build work until equivalent output and
comparable CI timing evidence justify changing it. No duration or cost baseline
is available, so this plan makes no numerical savings claim. The practical
iteration policy is to run focused checks while editing, batch related work
locally, run the full deterministic gate on the final tree, and push once for
the required CI run.

## Implementation and acceptance matrix

| Area                   | Acceptance                                                                                                                                                                      | Current evidence                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI and arguments      | Full, quick-base, and exact lane selection; invalid base/options nonzero                                                                                                        | Implemented; help and focused temp-repository runner test exercised                                                                        |
| Selection              | Unknown/shared/empty/high-impact paths never become empty green evidence                                                                                                        | Implemented; focused selection contract tests pass; review path ownership rules against the final diff                                     |
| Child process boundary | Strict synthetic environment, no caller credential forwarding, env-file read guard, owned output root; Turbo preserves only the guard and run identity through strict filtering | Synthetic temp fixture and installed-Turbo temp-repository test confirm the boundary; host credential values were not read or printed      |
| Checks evidence        | Nonzero exit, zero summary, absent root or marketing command heading cannot pass                                                                                                | Focused black-box runner tests exercise nonzero, zero, missing summary, and missing marketing-heading cases                                |
| Source and receipt     | Dirty source is fingerprinted; logs/reports are per-run; mismatch or absent evidence is non-green                                                                               | Full run receipt records the same start/end fingerprint `a37b4e519e6b2a45e568f69dfaaf7571fec9cf252e193b38087e9dbea4709b1c`; lease released |
| CI wiring              | Five stable job names/triggers, shared registry commands, required receipt artifacts, no path skip/continue-on-error                                                            | Workflow contract tests pass; hosted CI for a delivered revision is not established by this local run                                      |
| Real Postgres          | Non-empty JUnit, source migration metadata, unique owned project, cleanup success, no skip/filter override                                                                      | Full local lane passed 6/6 with cleanup passed                                                                                             |
| Contract evals         | Both product and mount reports, fixture snapshot, migration metadata, cleanup success                                                                                           | Full local lane passed 15/15 with cleanup passed                                                                                           |
| E2E                    | Both configs, no zero/flaky reports, only the exact named completion-journey skip, exact fixture identity, lease and cleanup evidence                                           | Full local lane passed 26 tests with one named static skip, no flaky cases, distinct fixture projects, and cleanup passed                  |
| Complete gate          | Five lanes pass on the same recorded tree and receipts remain fresh                                                                                                             | `pnpm verify` passed as run `df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` on the fingerprint recorded above                                       |
| Behavior assurance     | Requested delta RED, intentional change, and named unaffected invariants                                                                                                        | Captured per behavior change in handoff; a green suite alone is not proof of total behavior preservation                                   |

The focused synthetic regression command is:

```sh
pnpm exec vitest run --project unit \
  tests/unit/verification-runner.test.ts \
  tests/unit/verification-contract.test.ts \
  tests/unit/ci-workflow.test.ts
```

The recorded same-tree complete acceptance command was:

```sh
pnpm verify
```

The full local run and receipt review are complete for the recorded
fingerprint. Hosted CI evidence awaits delivery of an exact revision and is not
promised by this plan. No deployment or production result is claimed. Do not run
paid agent/Square evals as part of this gate. The separate path-based Square
obligation in `AGENTS.md` applies only to its named paths and must be reported
with its `Results:` line when triggered.

## Failure handling and review

Never turn a missing tool, Docker or Chromium failure, process timeout,
cancellation, zero discovered tests, unexpected skip, retry-pass flake, absent
report, stale build artifact, unknown receipt, or failed cleanup into green.
Keep the original failing attempt and all artifacts. Diagnose a flaky test and
fix its cause; do not retry it until green or hide its first attempt. A lane
that cannot run is blocked or incomplete, not skipped-success.

Before handoff, record for behavior-changing work: the behavior and input,
RED test/journey ID and exact pre-edit failure, expected new outcome, explicit
old expectation replaced, named unaffected invariants and their test IDs, the
full or focused receipt and artifacts, and remaining behavior that was not
exercised. For docs-only work, a behavioral RED is not applicable; still run
focused document checks and the required repository gates owned by the lead.

## Stop conditions

Stop the affected lane and report the concrete failure if the shared dev lease
cannot be acquired, the fixture identity does not match its requested run,
source changes during a run, the required supervisor fails to emit evidence,
or owned service cleanup cannot be proven. Do not take over another agent's
startup, workflow, lifecycle, or documentation files. A real-provider or paid
eval with no operator-provided budget remains a separate obligation; it is not
a reason to weaken or skip the deterministic gate.
