# Text-first onboarding

Status: production release is user-authorized after the local gate and CI pass;
the approved values are configured for the next development deployment,
activation remains off by default, and there is no production onboarding proof.
Plan 026 owns the product contract. The planned release limits are 100
account-wide model turns per day, 1 enrollment per sender, 1,000 account-wide
outbound messages per day, and `single_media` card delivery. They are configured
for the next development deployment but are not yet deployed. One designated
tester remains required for post-activation live acceptance; no tester phone
number is recorded here.

## Current path

The native SendBlue webhook is `/eve/v1/sendblue`. The adapter validates the
webhook secret, configured account, receiving line, direct-message shape, and
replay identity before channel handling. A new eligible sender is admitted as
a channel-observed principal, not as an OTP-verified web user. Provisioning
creates an isolated personal workspace, membership, default published agent,
channel binding, and opening-request receipt before welcome work is eligible.
The original text and required private attachment data stay in scoped durable
storage; they are not metadata log content.

The welcome operation has four ordered text parts and three labeled example
cards. The explicit card mode determines the operation count: disabled is four
texts, carousel is four texts plus one operation containing all three media
items, and single_media is four texts plus three media operations. Beta/STOP is
last in every mode. The card assets are local implementation artifacts at
`/onboarding/example-1.png`, `/onboarding/example-2.png`, and
`/onboarding/example-3.png`; these URLs do not establish a deployed or provider
delivery claim. A concrete opening question or photo is preserved and answered
promptly. A greeting/capability question receives the welcome sequence and
album. A newer inbound cancels unsent cards. Text remains the fallback if a
card fails.

## Configuration and safety gates

The path is disabled unless all of the following are explicitly configured:

- `SENDBLUE_TEXT_ONBOARDING=on`
- `SENDBLUE_CONVERSATIONS=on`
- positive operator-approved values for
  `SENDBLUE_TEXT_ONBOARDING_MAX_ENROLLMENTS_PER_SENDER`,
  `SENDBLUE_TEXT_ONBOARDING_MAX_MODEL_TURNS_PER_DAY`, and
  `SENDBLUE_TEXT_ONBOARDING_MAX_OUTBOUND_MESSAGES_PER_DAY`
- an explicit card mode: `disabled`, `carousel`, or `single_media`
- valid SendBlue account, line, webhook-secret, and API credentials

The limits are operator admission caps, not dollar, token, per-tool, or
per-turn ceilings and not invented provider quotas. Unknown
senders cannot start expensive tools before enrollment is ready. STOP takes
precedence over enrollment and cancels unsent work; START does not clear a
suspension or identity conflict. The channel-only basic capability policy
includes own text/photos, public `web_search`/`web_fetch`, same-thread
`ask_question`, session-local `task_cancel`, static `load_skill`, and
`send_message`. The SDK blocks private network access and private-connection
authentication; private connections, browser, vault, and admin access are
denied. Optional web OTP or Square access is a later,
separately authorized upgrade and must not be implied by channel enrollment.
SendBlue's provider-reserved `CANCEL` command remains STOP under its documented
messaging controls; an approval decline such as `no` remains an approval
response, not an opt-out. The final local review also checks STOP at the final
legacy-output send guard, suppressing output when STOP is observed there. These
are local implementation and test facts, not production provider evidence. See
[SendBlue's security and messaging controls](https://docs.sendblue.com/security/).

An authenticated direct sender may send the exact command `reset onboarding`
(surrounding whitespace and case do not matter) to replay the durable Jory
welcome and configured example cards in the same thread. It does not create or
reset an account, replay an opening request, clear quotas, or bypass STOP,
suspension, binding, or tenant checks.

## Recovery and diagnosis

`channel-onboarding` operations are persisted. The local implementation uses a
lease-fenced, binding-scoped immediate drain after provisioning and an Eve
native schedule for global recovery. It records provider acceptance separately
from recipient delivery and never treats an exception or lost response as a
proven rejection. A lost post-attempt response is `uncertain`; reconcile a
persisted provider handle/status before any operator action. Do not replay by
body hash, timestamp, or a newly generated message ID.

The local real-Postgres proof closed one consumer pool after a pre-attempt
lease, reopened a second pool against the same synthetic database, rejected the
old fence, reclaimed the expired lease, and restored the encrypted JPEG receipt
as Eve file content. The inspected seven-test receipt is
`c21f137c-d049-4531-a83a-96a090799cc2`. This is not an operating-system process
kill, a deployed schedule wake, or a live SendBlue/provider-delivery proof.
Metadata-only diagnosis may report operation kind/state, bounded error class,
provider/account/line identifiers, and timestamps; do not inspect opening text,
attachments, tokens, or vault content.

If a local Square or model gate reports expired Vercel OIDC, first confirm that
the checkout is linked to the intended project and team. From that linked
checkout, obtain a short-lived project-scoped development token with the
installed CLI command `vercel project token <project-id> --format=json
--scope <team-id>`, then pass only `VERCEL_OIDC_TOKEN` to the bounded local
eval. Keep the command output in memory, never print or write the token, and do
not pull the full production environment merely to recover local evaluation.
An authenticated CLI session and a correct project link are prerequisites;
this procedure does not change deployment configuration or prove a live
provider credential.

If provisioning is incomplete, do not send “You’re in!” and do not repair an
existing, suspended, recycled, or ambiguous identity by creating another one.
Turn off `SENDBLUE_TEXT_ONBOARDING` to stop new enrollments while allowing
existing bindings to continue. Drain or cancel pending onboarding work safely;
do not delete enrolled accounts or roll back the schema incompatibly.

## Acceptance gate

After development activation, use one explicitly designated, previously
unregistered test phone on the exact candidate deployment. Prove plain-text
welcome and useful answer, independent isolation, image-first preservation,
duplicate/restart recovery, STOP suppression, and failed/uncertain delivery
recovery. Record provider acceptance separately from recipient delivery and
record observed times with sample counts; do not invent latency guarantees.
No live acceptance is recorded here. Full deterministic local verification
completed on 2026-09-14. The earlier receipt recorded 2,168 passed with seven
intentional real-Postgres skips and is retained as historical pre-fixture-fix
evidence: `.eve/verify/85fdff44-f466-414a-b718-da1018ed52b1/receipt.json`. The
final frozen reviewed worktree based on PR 271 head passed 2,179 checks with
seven intentional real-Postgres skips; Real Postgres passed 7/7, Contract evals
passed 15/15, and E2E passed 28 with one documented skip. Its source fingerprint
is `7565e9620ed5a926bfa0d46668c9ac882cad170912a8ffb4682983d67a875994`.
Receipt:
`.eve/verify/df3d5f7b-0f01-4dfa-919e-dfcceb0dd66f/receipt.json`.
The earlier reset verification run on 2026-09-15 passed all five lanes: 2,185 checks
passed with seven intentional real-Postgres skips, Real Postgres passed 7/7,
Contract evals passed 15/15, and E2E passed 28 with one documented skip.
Receipt: `.eve/verify/ae88b967-b225-4ccd-b109-9f4c52f31064/receipt.json`.
It was captured at HEAD
`305505eb0d35b84d8dfa5d5c93316345cad831bc` with source fingerprint
`04274fe960ff68d48c56496fcba882914e888a6c70236824a23f9dd6e61add05`; the
reviewed runtime/test content is now committed as
`aea8003dff4822e90df2a99c07ed3e08dffa3ff1`.
The retained initial Square summary at `.eve/evals/2026-09-15T00-26-50/summary.json`
reports 12 passed, 1 failed, and 0 scored cases (13 total), with 113/114 gates:
case `0002` returned `$5,575.00` instead of `$55.75` despite correct store and
page selection. The two focused `0001` reruns at
`.eve/evals/2026-09-15T00-19-14/summary.json` and
`.eve/evals/2026-09-15T00-22-15/summary.json` each passed 1/1 with 12/12 gates.
After the exact minor-unit aggregation tool and guidance were added, the full
Square summary at `.eve/evals/2026-09-15T00-41-59/summary.json` passed 13/13
with 114/114 gates. Its `0002` trace records `square-money-total` receiving
875, 2000, and 2700 USD, returning `$55.75`, and the delivered message using
that value. The complete deterministic verifier then passed all five lanes:
2,200 checks passed with seven known real-Postgres skips, Real Postgres passed
7/7, Contract evals passed 15/15, and E2E passed 28 with one documented skip.
Receipt: `.eve/verify/aa1aa432-313e-4343-9c23-ba7a3f48944a/receipt.json`.
Its frozen source fingerprint was
`4209d1cd8b9d586cc2d3c7c1d4ccc3e92ecfaa544f4facfc131b8e77b29a68e4`; only
this evidence prose follows that run. This is synthetic local evidence, not
deployment or live-provider evidence.
The configured development plan uses 100 account-wide UTC model turns per day,
1 enrollment per sender, 1,000 outbound messages per day, and `single_media`
card delivery; deployment and one designated tester's live acceptance remain
pending.
Code defaults remain off; the configured Production flag takes effect at the
next deployment.
