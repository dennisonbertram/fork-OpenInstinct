# Testing and verification

Use `pnpm verify` for the deterministic pull-request gate. The command is now
implemented in this worktree and shares its five lane recipes with GitHub
Actions. The latest complete local acceptance passed for receipt
`df87a3e9-eca9-471b-9f0c-2b1a398a0ecd` on base
`7875a08348adf2d567120e7e7f3d803b101aa45a`, with source fingerprint
`a37b4e519e6b2a45e568f69dfaaf7571fec9cf252e193b38087e9dbea4709b1c` unchanged
through the run. The receipt is under
`.eve/verify/df87a3e9-eca9-471b-9f0c-2b1a398a0ecd/receipt.json`.

The run completed from 2026-09-12 22:57:28.102 UTC to 23:00:16.475 UTC. Checks
reported 1,949 passed and six intentional real-Postgres skips; both app builds
passed; real Postgres passed 6/6; contract evals passed 15/15; and E2E passed
26 cases with one documented skip and no flaky cases. Cleanup passed in all
lanes and the verification lease was released. This establishes local acceptance
for that exact source fingerprint only. Hosted CI evidence must identify a
delivered revision; this receipt establishes no hosted run, and no deployment is
promised.

The repository still requires `pnpm check`, `pnpm build`, and
`git diff --check` before handoff. `pnpm verify` includes those checks in its
registered lanes. A passing test suite proves only the assertions that ran; it
does not prove that all behavior stayed unchanged. For a behavior change,
record a concrete requested delta and observe a failing test or real journey
before editing implementation code. Keep specific unaffected invariants green,
and explicitly replace old expectations when behavior intentionally changes.
Do not infer behavioral coverage from filenames or test counts alone.

## Pick evidence for the change

| Change                                                           | Focused evidence                                                                              | Broader evidence when the path crosses it                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Pure logic, UI state, or a local boundary                        | Owning Vitest test in `tests/unit/`, `agent/`, or `db/`                                       | `pnpm verify --lane checks`; add `build` if the app or package build path changes                                |
| Authentication, workspace scope, API admission, or ownership     | Unauthenticated, authenticated, wrong-owner, and cross-workspace cases at the owning boundary | Browser or HTTP journey through the affected real route for a user-facing path                                   |
| Schema, migration, database service, persistence, or concurrency | Owning integration test in `tests/integration/`                                               | `pnpm verify --lane real-postgres`; PGlite does not prove PostgreSQL locking or concurrency behavior             |
| Eve wiring, tool choice, approval, or message delivery           | Owning unit/integration test and relevant model-free contract case                            | `pnpm verify --lane contract-evals`; model judgment or configured-provider behavior needs its separate eval/path |
| User-visible web UI                                              | Owning component or state test                                                                | Playwright journey and local browser inspection; use Agentation annotations when available                       |
| Startup, environment, ports, processes, or teardown              | Focused supervisor test and prerequisite failure case                                         | `./init.sh` local acceptance from [the operations guide](operations/VERCEL.md#local-acceptance)                  |
| Square reply quality or an AGENTS.md Square-trigger path         | `pnpm eval:square` when the path obligation applies                                           | Include the exact `Results:` line; do not substitute contract evals                                              |

Vitest has a unit project and an integration project. The integration project
uses PGlite for its normal database cases and a small set of tests guarded by
`REAL_PG`. In [`tests/harness/real-postgres.ts`](../tests/harness/real-postgres.ts),
unset `REAL_PG` auto-detects the Compose database, `REAL_PG=0` intentionally
skips those cases, and `REAL_PG=1` requires a reachable PostgreSQL service. The
verification `checks` lane sets `REAL_PG=0` and requires exactly the six
intentional skips plus non-empty root and marketing test summaries. The
separate `real-postgres` lane is authoritative for those six cases.

The real-Postgres suite covers selected PostgreSQL-specific behavior; it does
not prove every query or migration under PostgreSQL. Contract evals exercise
deterministic Eve wiring and a mounted-extension harness against owned fake
Square, MCP, delivery, and database services. They do not call a paid model or
send through a live provider. Playwright exercises the listed local browser
journeys through authenticated app routes; it does not prove live Kernel,
Blob, Linq, or SendBlue delivery. A stronger evidence layer does not replace a
focused regression at the owning layer.

## Commands

The current CLI accepts these forms:

```sh
pnpm verify
pnpm verify --quick --base <full-commit-sha>
pnpm verify --lane checks
pnpm verify --lane build
pnpm verify --lane real-postgres
pnpm verify --lane contract-evals
pnpm verify --lane e2e
```

`pnpm verify` runs the five deterministic CI lanes in order and stops after the
first lane that is not green. All five must pass for a complete local gate. A
stopped later lane is recorded as `not-run`, so it cannot make the gate green.
It acquires an exclusive per-worktree verification lease before starting a
lane. A same-worktree `pnpm dev` lease prevents the gate from starting; stop
that dev operation through its own supervisor before running verification.
Individual legacy supervisors outside the shared verification runner may not
all honor the lease, so do not overlap them with fixture or database tests in
the same worktree.

`--quick --base` is for iteration only. It requires a full ancestor commit SHA
and considers changes between that base and the current tree, including dirty
tracked and untracked files. Known unit, integration, contract, browser, and
documentation paths select their owner lane. Empty or unknown selections and
high-impact shared paths fall back to the complete gate. Changes to manifests,
lockfiles, runner/workflow/configuration, application or agent owners, schema,
or migrations run all lanes. Invalid or unrelated base input is incomplete,
not a green empty selection. Quick evidence is always partial unless the
selection explicitly fell back to all lanes; even a full fallback quick run is
not a replacement for `pnpm verify` at handoff.

`--lane <name>` runs one lane from the same registry used by CI. It is useful
for focused diagnosis but never proves that the other required CI lanes passed.
The exact current recipes are:

| Lane             | Recipe                                                                                                                                   | Success requires                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks`         | `pnpm check`, then `git diff --check`                                                                                                    | Both exit successfully; root and marketing Vitest summaries are present and non-empty; no failed or unexpected skipped cases; exactly six intentional `REAL_PG=0` skips                                                                                                                                                                                                                                                                                                                        |
| `build`          | `pnpm build` with the synthetic CI build environment                                                                                     | Both app and marketing `BUILD_ID` outputs are created or refreshed during this run                                                                                                                                                                                                                                                                                                                                                                                                             |
| `real-postgres`  | `node --experimental-strip-types scripts/test-real-postgres.ts`                                                                          | The unfiltered required test file runs against its new Compose project; test report and migration metadata exist; owned Compose cleanup succeeds                                                                                                                                                                                                                                                                                                                                               |
| `contract-evals` | `node --experimental-strip-types scripts/run-contract-evals.ts`                                                                          | Product and mount-harness JUnit reports are both non-empty; the delivery-provider fixture snapshot exists; migration metadata is present; owned Compose cleanup succeeds                                                                                                                                                                                                                                                                                                                       |
| `e2e`            | Two Playwright runs: `playwright.config.ts`, then `playwright.sendblue.config.ts`; both use `--fail-on-flaky-tests --reporter=html,json` | Both produce non-empty reports without failures or retry-pass flaky tests. The web report must include the one named completion-journey case; its existing static skip is recorded as a coverage gap. Every other skipped case fails. Each fixture receipt identifies its run, Compose project, volume, app/marketing origins, database and migration readiness; after shutdown the runner verifies that the exact run record and project-labeled containers, volumes, and networks are absent |

The runner sets `CI=1` for every child, so Playwright uses its CI retry count
of one. A retry-pass is still `flaky` and the CLI option makes it non-green.
Running the old `pnpm test:e2e` directly uses the Playwright configuration's
local retry count of zero; it is not equivalent to the CI E2E recipe. CI
installs Chromium with `npx playwright install --with-deps chromium`; local
verification requires Docker, the locked dependencies, and the Playwright
browser to already be available. The current CI suite contains one pre-existing
static skip: `tests/e2e/completion-journey.spec.ts` — “reports settled
background work, and answers a later question from evidence” in project
`chromium`. The contract fixture cannot provide the serializable model
configuration required for durable subagent work, so this settled-worker and
later-answer browser journey remains unverified. Playwright's JSON report gives
the file relative to `testDir`, so the runner resolves the exact
`completion-journey.spec.ts` path under `tests/e2e`; the receipt records the
repository-relative path `tests/e2e/completion-journey.spec.ts`. It allows only
that file, title, and project once in the web report. If it is no longer
skipped, it must pass as a normal test. A missing completion-journey case or any
other skipped test fails the lane. Missing commands, unavailable Docker or
Chromium, timeouts, cancellation, nonzero exits, missing reports, zero tests,
retry-pass flaky results, or failed cleanup also prevent a green lane.

### Receipts and reproducibility

Every invocation writes a private receipt under the Git-ignored
`.eve/verify/<run-id>/receipt.json`. It records the CLI mode, coverage status,
repository root, base and `HEAD` SHA, dirty-source fingerprint, changed paths,
excluded-input categories, Node/package-manager/platform identifiers, digests
of the lockfile, package manifest, lane registry, workflow, Vitest and
Playwright configs, each lane's selection reason, command and arguments,
timestamps, exit status, test counts, target/database metadata, cleanup state,
and artifact hashes. Started steps also have a bounded combined output file
under that run directory; the receipt stores its path, digest, and truncation
flag, not its contents. The directory and files are private to the current
user. Child commands receive a strict synthetic environment; the preloaded
guard blocks reads of repository `.env` files. E2E fixture startup also blocks
non-loopback network access; this fixture-only egress restriction does not apply
to checks, build, or contract-eval commands.

An E2E cleanup failure is recorded as failed or unknown and cannot pass the
lane. The runner does not automatically recover an orphaned fixture. Read the
failed receipt and its matching `.eve/dev-runs/run-<run-id>.json`; confirm the
recorded owner and child processes are dead, then inspect Docker resources using
that record's exact Compose project identity. Remove only the resources owned by
that project and its recorded volume, and remove stale run metadata after those
resources are gone. `./init.sh --stop` handles development-owned runs; it does
not recover a verification fixture.

The source fingerprint covers `HEAD`, changed tracked files, and non-ignored
untracked files, including executable mode. It does not hash `.env` values or
private `.eve` traces: a changed path in either category is recorded by type
only and blocks verification. A changed source fingerprint or `HEAD` at the
end makes the receipt stale. Receipts are evidence for one invocation and
source tree only; the runner never reuses a previous test/eval result.

Database metadata reports the owned Compose project and volume without a
connection string. It separately names the source migration journal revision
and says the database journal revision was not independently observed. For
fixtures, `migrations: ready` means the owned supervisor reported readiness
after its migration command; it is not an independently queried database
journal. A local fixture target records its URL, generation/run ID, launch
source SHA, and source fingerprint. This is launch provenance, not an
independent claim of the exact bytes served by a running process. Lanes without
a runtime target or database say `not-applicable`.

The full gate is sequential because app builds, Playwright, Docker projects,
and generated artifacts share some worktree resources. Its lease prevents
overlapping the integrated gate with the owned development supervisor. The
current direct `pnpm check` and `pnpm build` are still useful during iteration,
but `pnpm check` alone is not all five CI lanes. Before the CLI was added, the
equivalent manual lane commands were `REAL_PG=0 pnpm check`, `pnpm build` with
the synthetic values shown in the workflow, the two supervisor commands in the
table, and `CI=1` Playwright runs with the stated config/flags. Avoid running
both that manual sequence and `pnpm verify` for the same unchanged tree.

## CI triggers, caches, and expense

[`.github/workflows/checks.yml`](../.github/workflows/checks.yml) runs for every
pull request and every push to `main` or `master`; it has no path-based job
filter. The five stable job names are `Checks`, `Contract evals`, `E2E`,
`Build`, and `Real Postgres`. `Contract evals` waits for `Checks`; the other
jobs may run in parallel. Workflow concurrency cancels an older run when a new
run for the same pull request or branch starts. Each lane invokes
`pnpm verify --lane <name>` and uploads its receipt. Every lane retains the
full `.eve/verify/` directory so bounded step output files referenced by receipt
hashes remain available; failure or cancellation keeps relevant reports when
they were produced. The YAML proves the jobs exist, not that repository branch
protection marks every status as required.
Do not rename a status or bypass a required check without owner review.

Each CI job installs from the lockfile with `pnpm install --frozen-lockfile`.
`actions/setup-node` caches pnpm package-store contents. That speeds dependency
installation only; it does not prove tests ran. `turbo.json` disables caching
for `test:app`, and this repository has no configured remote test-result cache.
The verification `checks` child also sets `TURBO_FORCE=true`, disables Turbo
telemetry and update notices for that invocation, and therefore executes tasks
instead of restoring their cached results. The strict Turbo environment
passes only `NODE_OPTIONS`, `VERIFY_REPO_ROOT`, and `VERIFY_RUN_ID` to the
`test:app` and `types:generate` tasks; this preserves the fixture env-file guard
without exposing the rest of the verifier process environment. Ordinary
`pnpm check` outside the verification runner keeps the existing Turbo behavior.
The focused contract test invokes the installed Turbo CLI twice in a temporary
repository: it proves the guard and safe root/run ID reach the task, an
unlisted parent canary does not, and `TURBO_FORCE` re-executes a deliberately
cacheable fixture task. These settings follow Turbo's documented
[`TURBO_FORCE`](https://turborepo.dev/docs/reference/system-environment-variables)
and [`passThroughEnv`](https://turborepo.dev/docs/reference/configuration#passthroughenv)
behavior. No lane may accept a prior passing receipt as a substitute for
executing its command. Do not add result caching for Vitest, Playwright, real
Postgres, or contract evals. Keep dependency caches keyed by the lockfile and
do not treat a package-store hit as a lane status.

The `Checks` lane's marketing check and `Build` lane both perform marketing
build work today. Preserve both required behaviors unless matched CI timings
and equivalent outputs support a reviewed change. This repository records no
baseline duration or spend, so do not state a numerical cost saving. To avoid
repeated CI iterations, use focused tests while editing, batch related changes,
run `pnpm verify` once on the final tree, then push the reviewable change. CI
still runs its required jobs for the pull request and branch update.

## Model and live-service evaluations

These commands answer different questions and remain outside the default
five-lane gate:

| Command                                             | Boundary                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm eval:list`                                    | Lists discovered Eve eval cases without model calls.                                                                                                                                                                                                                                |
| `pnpm eval:agent` or `pnpm eval:agent --tag safety` | Calls a configured model and judge, loads `.env.local`, requires gateway/OIDC credentials, starts its own database, and writes full eval traces under `.eve/evals/`. Use only when model judgment matters and the task budget permits it.                                           |
| `pnpm eval:square`                                  | Uses a real model with deterministic fake Square APIs. `AGENTS.md` requires it before a PR for specified agent instruction, Square, Linq reply, and model-setting paths. It is not a PR CI job; check its `Results:` line and fix red runs. Do not repeat it for docs-only changes. |
| `pnpm bench:browser`                                | Uses Kernel and real public sites with a model judge. It is a deliberate benchmark, not a deterministic regression gate.                                                                                                                                                            |
| `pnpm seed:square`                                  | Writes records to an explicitly restricted Square sandbox; it is not a test or CI gate.                                                                                                                                                                                             |

Do not run a paid/live command as a substitute for missing deterministic
evidence. Run path-required paid evals when their repository trigger applies,
subject to any budget constraints already supplied for the task. Do not repeat
them for docs-only changes. Never include real provider credentials, production
URLs, real user data, or private traces in deterministic fixtures or receipts.

## Behavior evidence in the handoff

For each changed user-visible or agent behavior, record:

| Item                      | Evidence                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Requested delta           | One concrete input and expected visible or delivered outcome.                                                          |
| RED before implementation | Test or journey ID, exact command, failing assertion, and pre-edit revision. Mark not applicable for docs-only work.   |
| Intentional change        | Any old expectation deliberately replaced and the new contract that supersedes it.                                     |
| Retained invariants       | Specific auth, tenant, approval, secret, migration, recovery, and delivery assertions that remain true, with test IDs. |
| Verification              | Exact commands, receipt/CI/artifact references, and passed, failed, skipped, and flaky counts.                         |
| Confidence gaps           | User journeys, configured providers, browser families, database behavior, or production behavior not exercised.        |

For UI changes, use automated coverage and inspect the actual browser path,
browser errors, relevant network activity, and server logs. Check Agentation
annotations before and during UI work when available, and reply to or resolve
addressed annotations. Unit tests, build output, mock-provider assertions,
and local browser observations are separate evidence; none alone proves
production behavior.
