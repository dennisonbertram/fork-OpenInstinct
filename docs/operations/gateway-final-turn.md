# Gateway final-turn reproduction

This note records the smallest synthetic reproduction currently available for a
final delivery followed by a failing extra model call. It uses Eve `0.49.0`, the
repository's mount harness, a deterministic fixture model, and a fake Linq
provider. It makes no paid model calls, sends no real messages, and carries no
customer, authentication, billing, or database acceptance claim.

The reproduction is `evals/contract/mount-harness/evals/linq-final-delivery.eval.ts`.
The fixture model requests `send_message` with `final: true`; its fake provider
can accept, reject, or hold the provider acknowledgement. The eval then checks
the durable event order and drives a later same-session turn. The existing
runner command is:

```text
pnpm eval:contract
```

The `eval:contract` script is defined in `package.json` as
`node --env-file-if-exists=.env.local --experimental-strip-types scripts/run-contract-evals.ts`.
That runner first starts its isolated contract services and runs the core
contract evals, then invokes Eve from `evals/contract/mount-harness/` with:

```text
pnpm exec eve eval --strict --tag contract-mount --max-concurrency 1 --skip-report
```

The eval target is an HTTP Eve runtime, so this is a runtime boundary check
rather than a unit test. Eve's target documentation describes `t.target.fetch`,
`attachSession`, and `watchTurn` as the supported channel/session interfaces.
For a portable fresh-unpatched run, set `REPO` to a checkout containing the
pre-repair `BASE` and the committed test-only harness `HARNESS_REV`:

```sh
REPO="$(git rev-parse --show-toplevel)"
BASE=4847de81
HARNESS_REV="$(git rev-parse HEAD)" # replace with the repaired harness commit
REPRO="$(mktemp -d /tmp/jory-gateway-unpatched-repro.XXXXXX)"
git -C "$REPO" archive "$BASE" | tar -xf - -C "$REPRO"
git -C "$REPO" archive "$HARNESS_REV" -- \
  evals/contract scripts/run-contract-evals.ts package.json pnpm-lock.yaml | \
  tar -xf - -C "$REPRO"
cd "$REPRO"
pnpm patch-remove eve@0.49.0
pnpm install --lockfile-only
pnpm install --frozen-lockfile
node --input-type=module -e '
  const resolved = import.meta.resolve("eve/context");
  const context = await import("eve/context");
  if (!resolved.includes("/node_modules/.pnpm/eve@0.49.0_")) throw new Error(resolved);
  if (typeof context.requestTurnCompletion !== "undefined") throw new Error("patched completion API loaded");
  console.log(resolved);
'
npm pack eve@0.49.0 --pack-destination "$REPRO"
tar -xzf "$REPRO/eve-0.49.0.tgz" -C "$REPRO"
shasum -a 256 node_modules/eve/dist/src/harness/tool-loop.js \
  "$REPRO/package/dist/src/harness/tool-loop.js"
node --experimental-strip-types scripts/run-contract-evals.ts \
  --mount-only --timeout 45000
```

The final command is expected to exit nonzero on the pre-repair source and
write the decisive RED under `evals/contract/mount-harness/.eve/evals/`. Do not
call a run unpatched if it loads a `patch_hash=` Eve path, exports
`requestTurnCompletion`, or fails before the mounted eval.

## Observed unpatched trace

The fresh unpatched package is the official npm `eve@0.49.0` tarball. Its
SHA-256 is
`bc7ac97f97b725d8e13db87b11942de76a5c5fd7e7b01389badbc843fed4b9d3`.
The disposable extraction used for preparation was
`/tmp/jory-eve-unpatched.nS91IG/package`; matching file hashes are recorded in
`/tmp/jory-gateway-unpatched-eve.md`. The runtime used AI SDK `7.0.83`.

The trace at
`evals/contract/mount-harness/.eve/evals/2026-09-09T18-28-27/` records a failed
`linq-final-delivery` eval. In the `linq-final-timeout` case, the synthetic fake
provider ACK is observed before the `action.result` handler returns; the
resulting `action.result` is followed by `step.started(1)` and then
`turn.failed`; the required `turn.completed` event is absent. A later
same-session normal turn does complete and reaches `session.waiting`. The result
summary records the failed assertion and the event stream is in the adjacent
`evals/linq-final-delivery.events.ndjson` file.

This establishes the lifecycle ordering: the channel handler runs after the
original model step settles, and final provider acceptance is followed by the
ordinary Eve tool loop advancing to another model call. The extra call is where
the deterministic fixture failure occurs. A held-ACK experiment in an earlier
trace used a timed auto-release and is excluded from this evidence; it was not a
controlled provider acknowledgement test.

The verified fresh-unpatched baseline used the disposable checkout
`/tmp/jory-gateway-unpatched-repro.Sn82L1` and the official Eve package whose
`tool-loop.js` hash matched the package above. Its command was:

```text
node --experimental-strip-types scripts/run-contract-evals.ts --mount-only --timeout 45000
```

That run exited 1: its summary recorded 0 passed, 1 failed, 1 errored, and 7
failed assertions. The decisive first case recorded accepted final
`action.result`, `step.completed(0)`, `step.started(1)`, then
`MODEL_CALL_FAILED` and `turn.failed`. A separate held-ACK diagnostic also
reported the expected model-step counter mismatch against the repaired
expectation. The artifact is under
`evals/contract/mount-harness/.eve/evals/2026-09-09T20-11-43/`; the portable
copy/package-switch recipe is recorded in
`/tmp/jory-gateway-unpatched-repro-recipe.md`.

The same eval also covers normal final delivery, a later same-session turn,
source-stream failure before an action result, provider rejection, progress
followed by final delivery, a failed concurrent sibling, and cancellation. Those
cases are synthetic handler/runtime coverage. They do not prove a production
Gateway network failure, Linq's real provider behavior, a live webhook, or a
backup/restore or two-tenant acceptance path.

The implementation adds `requestFinalDeliveryCompletion` after an
accepted interactive delivery and successful bookkeeping. For a final
delivery, that helper checks the stored completed delivery against the real
call and turn, then records a completion request for the current turn through
Eve's scoped `requestTurnCompletion({ callId, stepIndex })`; Eve completes it
after required work settles. Scheduled reports keep their existing
finalization path and skip this request. The existing duplicate failure guard
remains separate from this repair. Focused uncancelled delivery and helper
coverage is green, and the held-ACK uncancelled case is green. A queued
cancellation receipt was observed while an acknowledgement was held; queued
means queued, and both the baseline and current implementation may complete.
This is an upstream ordering limitation, not evidence that an active abort was
ignored. Separate-process serializer and native-abort seam tests pass. Both
local web turns completed, then reload retained both turns, based on the
sanitized `/tmp/jory-gateway-local-chat-metadata.json` artifact. No actual Eve
Workflow crash-recovery proof exists between provider acceptance and a durable
checkpoint. The final local `pnpm check` passed 157 test files (1 skipped) with
1,257 tests passing (2 skipped), and the final `pnpm build` passed with the
documented local `BETTER_AUTH_URL` override. The final contract run passed 11
core cases and 4 mount cases; the final Square run passed 12 cases with 1
scored case (13 total), with terminal result
`Results: 12 passed, 1 scored (13 total)`, at aggregate reported cost
`$0.31239260`. These gates do not establish Workflow crash recovery, deployment,
or live Linq completion. The
current mount summary is
`evals/contract/mount-harness/.eve/evals/2026-09-09T20-06-47/summary.json`
(4 passed, 0 failed, 0 errored); the companion core summary is
`.eve/evals/2026-09-09T20-06-13/summary.json` (11 passed, 0 failed, 0
errored).

## Limitation and status

The production metadata reviewed separately classifies two same-session failures
as `MODEL_CALL_FAILED` with `gateway_stream_timeout` and shows a successful
`send_message` tool entry, but does not include the `final` flag or provider
acknowledgement state. It therefore cannot prove that the production call was a
final accepted Linq delivery.

The deliberate fixture error models a late failure after delivery; it does not
reproduce a real Gateway network timeout. The reproduction demonstrates
susceptibility at the Eve runtime boundary. It does not identify whether the
production timeout is upstream Gateway behavior, the provider acknowledgement
path, or another lifecycle interaction. No timeout increase, retry, failure
suppression, or manufactured success is part of this reproduction.
