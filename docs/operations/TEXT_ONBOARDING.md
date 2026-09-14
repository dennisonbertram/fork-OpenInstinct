# Text-first onboarding

Status: local implementation verified and awaiting its reviewed PR and merge;
activation remains off by default and there is no production onboarding proof.
Plan 026 owns the product contract.

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

Before any rollout decision, use two explicitly designated, previously
unregistered test phones on the exact candidate deployment. Prove plain-text
welcome and useful answer, independent isolation, image-first preservation,
duplicate/restart recovery, STOP suppression, and failed/uncertain delivery
recovery. Record provider acceptance separately from recipient delivery and
record observed times with sample counts; do not invent latency guarantees.
No live acceptance is recorded here. Full deterministic local verification
completed on 2026-09-14: Checks, Build, Real Postgres, Contract evals, and E2E
all passed. The Checks lane recorded 2,168 passed with seven intentional
real-Postgres skips; the Real Postgres lane passed 7/7, Contract evals passed
15/15, and E2E passed 28 with one documented skip. Receipt:
`.eve/verify/85fdff44-f466-414a-b718-da1018ed52b1/receipt.json`.
The required Square evaluation passed 13/13 with 114 gates at
2026-09-14T21:54Z (artifact:
`.eve/square-evals/2026-09-14T21-53-46.873Z.json`). This is synthetic local
evidence, not a deployment or live-provider claim. No operator has approved
the budget values, card capability for the candidate line, or the two fresh
test phones. Enrollment remains off by default while the local implementation
awaits its reviewed PR and merge.
