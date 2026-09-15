# Plan 026: Join and start using the assistant by text

Status: PR 271 merged; its 2026-09-14 production release observation is recorded,
with fresh-user
acceptance still pending.
The local queue, scoped immediate drain, native recovery schedule, and
real-Postgres pool-reconnect proof are implemented. The inspected seven-test
receipt is `c21f137c-d049-4531-a83a-96a090799cc2`; it does not prove an
operating-system crash, a deployed schedule wake, or a live provider send.
Full deterministic verification completed successfully on 2026-09-14: the
Checks, Build, Real Postgres, Contract evals, and E2E lanes all passed. Checks
recorded 2,168 passed with seven intentional real-Postgres skips; the Real
Postgres lane passed 7/7, Contract evals passed 15/15, and E2E passed 28 with
one documented skip. The receipt is
`.eve/verify/85fdff44-f466-414a-b718-da1018ed52b1/receipt.json`.
That receipt is retained as historical pre-fixture-fix evidence. The final
frozen reviewed worktree based on PR 271 head
`6c0f8af4251f4167636e54aa30e219394edddcdc` with source fingerprint
`7565e9620ed5a926bfa0d46668c9ac882cad170912a8ffb4682983d67a875994` passed
all five lanes: 2,179 checks passed with seven intentional real-Postgres
skips, Real Postgres passed 7/7, Contract evals passed 15/15, and E2E passed
28 with one documented skip. Its receipt is
`.eve/verify/df3d5f7b-0f01-4dfa-919e-dfcceb0dd66f/receipt.json`.
The required Square evaluation also passed 13/13 with 114 gates at
2026-09-14T21:54Z; the later 13-case run passed 12 cases with one scored
soft-judge case and 114 gates. Its artifact is
`.eve/square-evals/2026-09-14T22-25-58.040Z.json`. These are local synthetic
verification results, not deployment or live-provider evidence. The expired
OIDC failure from an earlier attempt is resolved for this gate; if it recurs,
use the project-scoped recovery documented in the operational runbook rather
than pulling all production environment values.
The earlier reset verification run on 2026-09-15 passed all five lanes on the frozen
worktree: 2,185 checks passed with seven intentional real-Postgres skips, Real
Postgres passed 7/7, Contract evals passed 15/15, and E2E passed 28 with one
documented skip. Receipt:
`.eve/verify/ae88b967-b225-4ccd-b109-9f4c52f31064/receipt.json` (captured at
HEAD `305505eb0d35b84d8dfa5d5c93316345cad831bc`, source fingerprint
`04274fe960ff68d48c56496fcba882914e888a6c70236824a23f9dd6e61add05`; the
reviewed runtime/test content is now committed as `aea8003dff4822e90df2a99c07ed3e08dffa3ff1`).
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
this evidence prose follows that run. These remain local synthetic verification
results, not deployment or live-provider evidence.
PR 271 merged at `e2f67d86ddd4a722ee7d998815077a149c7d0542`. In the
2026-09-14 production release observation, Vercel deployment
`dpl_BU6nXGw5ztSDNPoxKZcRUecA9r3H` was `READY` and selected by canonical
`https://open-instinct-ashy.vercel.app`; Railway deployment
`a63080fe-1e35-4733-a08b-d71b1207cddf` was `SUCCESS` for the same merge SHA. See the [release observation](https://github.com/dennisonbertram/fork-OpenInstinct/pull/271#issuecomment-5673100934)
and [web update](https://github.com/dennisonbertram/fork-OpenInstinct/pull/271#issuecomment-5673124358).
The owner waived the restore, preview-isolation, and two-phone gates for this
release. A designated existing account's `reset onboarding`, three
`single_media` cards, and normal reply were observed in Messages at 21:03–21:05
New York time on 2026-09-14; a web turn and reload persistence were observed at
21:07. This proves the current existing-user/reset path, not fresh-user
enrollment. Fresh-user acceptance still requires an unregistered sender; no
full phone number is recorded here.
Planned on 2026-09-14 against OpenInstinct `3df3051e21ed722f783a2e615f2c7b629d32b65c`.
Priority: P1. Effort: M–L. Risk: high at the identity boundary.
Execution ownership: Terra for identity, concurrency, and channel changes; Luna for copy and bounded tests; lead for decisions, integration, and review.

## 1. Product outcome

A small-business owner who has never visited the website can text the published number, receive a welcome, see a few illustrative iMessage-style examples, and get a useful answer in that conversation. The first text starts enrollment. No website, password, email, mandatory profile questionnaire, or extra JOIN message is required for the normal new-user path.

This is one-to-one enrollment into that person's own assistant experience. It does not add the person to the operator's workspace, vault, accounts, or conversation history. Group chats, invitations into someone else's agent, and arbitrary agent creation are out of scope.

The supplied Instinct screenshot shows: an opening question; an enrollment confirmation; a welcome; example images; and an invite-only beta notice. It establishes a UX reference, not evidence of Instinct's authentication implementation. Reuse that sequence, not its assets, flight-booking claims, seven-image count, or invite restriction.

Proposed enrollment policy: open text enrollment with bounded usage. This follows the request that new people, including the user's wife, can reach Jory. An invite-only policy would be a separate owner decision; do not silently build an invite gate. Existing architecture documents defer the consumer shell: this plan proposes bringing forward only text enrollment into Jory's small-business assistant experience, not the entire configurable/group-agent roadmap.

## 2. The conversation

The complete text-first flow is implemented in the merged release. Current
production evidence covers an existing user's reset/cards/reply path; fresh-user
enrollment remains unverified until the designated unregistered-sender test.

| Step             | Person sees                                                                                                   | Behavior                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First contact    | Person texts “Hey Jory, what can you do?” or any ordinary first message                                       | Validate provider event, enroll once, preserve the original message.                                                                                           |
| Welcome          | “You’re in! 🎉” followed by intro, capability examples, the business example album, and beta/STOP text        | Normal greeting sequence is welcome → intro → examples → album → beta; concrete task/photo requests get a compact welcome and prompt answer.                   |
| Show value       | “Let’s try something useful. Here are a few ways I can help with your Square account, stock, and deliveries.” | Keep the capability framing bounded to the approved small-business journey.                                                                                    |
| Example cards    | Three short, readable illustrative iMessage-style cards: daily sales, low stock, and receiving a delivery     | Intended journey content with a reliable text fallback; do not block the first answer on cards. Do not fabricate live numbers or imply existing Square access. |
| Set expectations | “I'm in beta, so tell me if something goes wrong. Reply STOP to stop messages.”                               | Include approved service/privacy links if required; exact URLs and policy copy are TBD. Do not claim invite-only unless enabled.                               |
| Start            | “What would you like help with?”                                                                              | Ask only if the opening message contained no actionable request.                                                                                               |

If the first text is “What is in this photo?”, send a compact welcome and answer the photo in the same flow. Do not throw the image away, require a resend, or ask what the user wants after they already said it. Treat opening message and attachments as private task content, not logs or onboarding-card examples.

For an ordinary greeting or capability question such as “What can you do?”, send the full welcome sequence—welcome, intro, examples, album, then beta/STOP—and invite the next action. If the opening contains a concrete question, photo, or other task, preserve it, send a compact welcome, and answer promptly; cards may follow when appropriate. This ordering follows the request content and does not require a brittle intent classifier. If the person replies while example cards are being sent, stop unsent cards and handle the new request. Do not make them wait through a presentation. Existing users do not receive the welcome again. An explicit “examples” request may show the current illustrative cards without resetting enrollment.

Names, location, and preferences are collected only when useful to the next request. Do not guess location from a phone number. Connected accounts and permissions are requested when a task actually needs them. No password, payment card, or OTP should be requested as ordinary chat content.

`reset onboarding` is a non-destructive replay and does not erase user state. A
future full reset that erases a user's Jory state is tracked separately in
[backlog issue #272](https://github.com/dennisonbertram/fork-OpenInstinct/issues/272)
and is not implemented by this plan.

## 3. State and delivery contract

```text
Authenticated direct inbound event
  -> existing eligible conversation? -> normal scoped agent turn
  -> new eligible sender? -> enroll durably -> welcome -> normal scoped turn
  -> stopped / suspended / conflict / disallowed? -> bounded policy response
```

Store enrollment readiness separately from welcome delivery and first-use success:

- Enrollment: provisioning, ready, or needs-recovery; stopped is a separate communication preference.
- Welcome: not-started, pending, accepted, delivered when evidenced, failed, or uncertain.
- Activation: first useful answer delivered, measured separately from account creation or provider acceptance.

Use a stable provider/account/line/sender identity and canonical phone normalization. Claim the inbound event before creating accounts or sending messages. Parallel first texts and provider retries must produce one identity, workspace, default agent, and binding. Keep the opening request durably associated with its event and mark it attempted before handoff. If a handoff response is lost, retain an `uncertain` operation for diagnosis rather than claiming idempotent or exactly-once handoff. Do not mark it handled before the handoff outcome is durable.

Welcome parts have durable keys derived from enrollment ID, copy version, and part ordinal. Persist dispatch intent before sending. If the provider accepts but the response is lost, mark uncertain and reconcile using its documented handle/status capabilities; do not blindly resend the entire welcome. Provider acceptance is not recipient delivery. Do not promise exactly-once physical delivery when the transport cannot guarantee it. A failed example card never makes a ready account unusable.

Prefer one transaction for local provisioning plus pending welcome intents. Where existing services own separate transactions, introduce narrow transaction participation or a resumable provisioning step; do not pretend a series of calls is atomic. No provider/network call inside a database transaction. A durable worker must drain accepted pending work; name the existing deployment-compatible consumer before acknowledging work that only exists in memory.

Concrete ordering: ready means user, assurance-qualified identity, active membership, default published agent, channel binding, and opening-request receipt have all committed. For a greeting/capability question, send welcome → intro → examples → album → beta/STOP, then invite the next action. For a concrete opening question or photo, send a compact welcome and answer promptly; cards may follow when they do not delay that answer. A second genuine inbound may enter normal scoped processing as soon as ready, even if welcome/card delivery is pending; preserve per-conversation order through the existing dispatch lease, and cancel unsent cards when needed. The welcome is not a second model turn.

For OpenInstinct/SendBlue, use `(provider, configured account, configured receiving line, message_handle)` as the unique inbound event key; derive sender/conversation identity from the authenticated event, not message text. Persist its claim and enrollment association transactionally. Store original request content only in scoped private durable application storage (or an opaque reference to it), never in metadata logs; it must include the attachment references/bytes needed after a signed URL expires. A digest alone cannot replay an opening photo. Use existing encrypted identity and private-media primitives and a bounded retention policy for unfinished requests. Reuse Partyline's receipt key rather than inventing a second one. The Linq port must map the adapter's actual stable message ID and account/line before defining its equivalent key; a body hash or timestamp is not an event identity.

The `channel-onboarding` recovery consumer is part of the local implementation,
not a production-readiness claim. It uses a binding-scoped immediate drain after
provisioning and a native Eve recovery schedule. The real-Postgres
pool-reconnect test proves persisted lease recovery, stale-fence refusal, and
private JPEG reconstruction after the original pool closes. It is not a
synthetic operating-system kill/restart proof, a deployed wake proof, or a live
provider proof. Do not reuse completion-report tables as a queue, rely on an
unawaited promise, or acknowledge work that will disappear. These remaining
gates block rollout readiness, not the product-flow decision.

## 4. Identity and access: the deliberate product change

Today the application requires web-verified identities before admitting SendBlue messages. Removing that check without replacing it is not the fix.

Proposed contract for a genuinely new sender:

1. Require the configured webhook secret, exact provider account, receiving line, direct-message type, normalized sender, replay protection, enrollment policy, and rate/budget admission.
2. Treat this as a provider-observed messaging identity, not proof of a web login, a legal identity, or permission to claim an existing account. Provision a canonical internal user, a new isolated personal workspace and membership, a default published agent, and a channel binding with explicit identity provenance.
3. Distinguish channel enrollment from OTP verification in owning types/records and consumers. Do not set Better Auth `phoneNumberVerified=true`, issue a web session, or invoke the existing identity-recycling helper merely because a webhook arrived. Extend the existing identity model narrowly rather than inventing a second tenant system.
4. A channel-enrolled principal may use its own text and photo inputs, public `web_search` and `web_fetch` (the SDK blocks private-network access and private-connection authentication), same-thread `ask_question`, session-local `task_cancel`, static `load_skill`, and `send_message`. Enforce this initial capability policy in code, including all tool paths, not merely prompts. Private connections, browser, vault, and admin capabilities are denied. External writes remain subject to existing approvals and required authorization.
5. Optional later dashboard login uses the existing OTP flow and explicitly links to the same user/workspace after checking identity provenance and conflicts. It must not create a second account or silently transfer a recycled/revoked number. Additional credentials or capabilities require their normal authorization.

The binding service must explicitly accept an assurance-qualified enrollment result, resolved server-side from the durable identity/provisioning records. That result includes principal, workspace, provider/account/line, sender identity, enrollment provenance, and permitted channel capabilities. Preserve the old OTP-verified binding predicate for existing callers; add a narrow channel-enrolled predicate rather than changing every `status === verified` read to accept all identities. Trace all identity consumers and web-login linking before selecting migration fields. Record provenance as new data; a fabricated verification timestamp is not provenance.

Keep the existing verified-user route working. An ambiguous, revoked, suspended, recycled, or conflicting identity must never be repaired by auto-enrolling into the old workspace or by creating a new account to evade a suspension. Provide a neutral recovery path without exposing whether another account exists. Reauthentication/recovery is an exception path, not the new-user onboarding default.

This assurance split is a required design review before implementation. If installed authentication/runtime contracts cannot represent it safely, report the conflict and propose a channel-scoped principal design; do not substitute a required website signup or silently promote all inbound senders to verified owners.

## 5. Current OpenInstinct evidence and implementation map

The bullets below preserve the planning-base map and proposals. The merged
implementation adds channel-observed assurance/provenance, transactional
enrollment intents, and the durable delivery service. The 2026-09-14 production
evidence covers an existing-user/reset path; fresh-user enrollment remains
unverified.

- `agent/channels/sendblue.ts`, `sendblueChannelConfig.onMessage`: the planning-base implementation called `findVerifiedAuthUserIdByPhoneNumber` and returned `null` when missing. PR 271 now adds the channel-observed enrollment path; the current release evidence above proves the existing-user/reset path, not fresh-user enrollment.
- `agent/lib/sendblue/admission.ts`: owns webhook-secret comparison and exact account/line/direct-message validation. Keep this before enrollment.
- `src/auth/index.ts`, `createPhoneNumberOptions`: `requireVerification: true`; OTP callback records identity. This remains the web-login proof path.
- `db/schema/platform.ts`, `phoneIdentities`: identity is linked to a canonical auth user and currently has a verified-status model. Add explicit assurance/provenance and audit every consumer; do not overload verified status without checking its meaning.
- `db/services/phone-identities.ts`, `recordVerifiedPhoneIdentity`: can recycle an existing identity when assigned to a different user. Do not call this blindly from first contact.
- `db/services/scope.ts`, `ensureScope`: creates personal workspace and owner membership; existing-workspace early return is not a general partial-provisioning repair primitive.
- `db/services/channel-conversations.ts`, `createConversationBinding`: requires verified identity, resolves one agent, respects active SendBlue line, and creates binding/participant. Its `reconcileLegacyPersonalAgent` can bootstrap a sole-owner personal agent/revision. Reuse the data model, but explicitly review its manifest and owner assumptions for channel enrollment.
- `db/services/agents.ts`: owns agent/revision creation and publication. New users must receive a valid, tested default; never share the operator's agent credentials.
- `agent/channels/sendblue.ts`, `postSendblueReply`: unscoped sends bypass workspace budget checks. New pre-account enrollment replies require a bounded platform allowance, not this bypass.
- `agent/lib/report-part-dispatch.ts`: ordinary sends without a report identity are not durable deduplicated sends. Do not label it a generic onboarding outbox.

Proposed file ownership: channel orchestration in `agent/channels/sendblue.ts`; fixed copy/state decisions under `agent/lib/onboarding/`; persistence under `db/services/channel-onboarding.ts` and owning schema/migrations; identity changes in `db/services/phone-identities.ts`, `db/schema/platform.ts`, and required auth consumers; default provisioning in owning scope/agent/binding services. New names are proposals, not existing APIs. Avoid a generic framework or dependency addition.

SendBlue is the observed working Jory iMessage provider in the PR 271 release. Linq is implemented, but this release evidence does not establish Linq as the active production conversation provider. Do not claim the active provider is Linq or change connector configuration as part of documentation.

## 6. Provider, failure, and cost boundaries

Verified official documentation on 2026-09-14:

- SendBlue authenticates webhook delivery using its configured secret and documents duplicate delivery/retries. The application must deduplicate by provider event identity. [Webhooks](https://docs.sendblue.com/getting-started/webhooks/)
- SendBlue documents STOP and other opt-out phrases, with START for opt-in. Handle provider opt-out state before onboarding/agent work; coordinate any confirmation so the provider and application do not send duplicates. An arbitrary new text must not clear an opt-out. [Security and messaging controls](https://docs.sendblue.com/security/)
- Shared-line contact verification is a separate provider concern: the documented verified-contact state changes after inbound messaging. This does not prove the present account accepts every new sender. Verify the exact line's enrollment/contact rules before launch. [Verified contacts](https://docs.sendblue.com/api/resources/verified_contacts/methods/list)

Do not disable contact restrictions, change account plans, purchase a line, or alter webhooks without explicit operational authorization. If provider policy blocks first contact, application code alone cannot deliver this journey.

For v1, set configurable per-sender enrollment limits and account-wide model-turn and outbound-message admission caps before activation. These are not dollar, token, per-tool, or per-turn ceilings; operator launch risk remains explicit. The authorized development rollout plan selects 100 account-wide UTC model turns per day, 1000 outbound messages per day, one enrollment per sender, and `single_media`; the lead selected these values within the user-authorized rollout. The five values are configured in Vercel Production for the observed release; this configuration does not by itself prove fresh-user enrollment. The welcome builder requires an explicit card mode: disabled produces four text operations, carousel produces four texts plus one three-image operation, and single_media produces four texts plus three single-image operations. In all modes beta/STOP is last; cards are optional work and can be cancelled. Single-media capability is proven; carousel V2 capability and fresh-user acceptance remain pending. No unsolicited follow-up campaign. Unknown senders cannot start expensive tools before enrollment is ready.

Failure behavior:

| Condition                                                   | Required result                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Duplicate or concurrent first texts                         | One enrollment; preserve distinct genuine messages in order; no welcome replay storm.               |
| Setup fails midway                                          | No false “You're in”; resumable state and one bounded retry explanation when sending is permitted.  |
| Welcome delivery uncertain                                  | Reconcile rather than blind resend; next inbound can use the ready account.                         |
| Image/card fails                                            | Continue with text; retain the user's valid opening attachment through the existing media pipeline. |
| STOP during setup/cards                                     | Cancel unsent onboarding and suppress assistant work according to provider policy.                  |
| START later                                                 | Respect provider opt-in and existing identity; do not create a second account or bypass suspension. |
| Wrong secret/account/line, bot echo, status callback, group | No enrollment or model/tool side effect. Reject/ignore according to existing webhook contract.      |
| Budget exhausted                                            | Bounded availability response if permitted; no repeated paid retry loop.                            |

STOP takes precedence over enrollment: for an unknown sender, record only the minimal keyed suppression preference, without creating a user, workspace, agent, or welcome. For an enrolled sender, set suppression and cancel unsent work without deleting the account. START can clear communication suppression only after the provider's documented opt-in condition is satisfied; it cannot clear account suspension, identity conflict, or revocation. A previously unknown eligible sender may then enroll. Ordinary text never clears suppression. If the provider suppresses the webhook or owns the opt-out confirmation, the adapter must use its documented status/reconciliation behavior; do not promise an application reply that the provider forbids.

SendBlue's provider-reserved `CANCEL` command is preserved as STOP under its
documented messaging controls; an approval decline such as `no` remains an
approval response and is not an opt-out. The final local review also covers a
STOP check at the final legacy-output send guard, so output is suppressed when
STOP is observed there. These are local implementation and test facts, not
production provider evidence. [Security and messaging controls](https://docs.sendblue.com/security/)

## 7. Delivery slices and gates

Do not start implementation merely because this plan exists. After owner approval, use a linked worktree in `dennisonbertram/fork-OpenInstinct`; never push or open a PR against upstream. Preserve unrelated work. Lead owns reviewed commits, PRs, CI, merge, rollout, and cleanup under repository rules.

Local implementation has completed the queue/schedule and real-Postgres
pool-reconnect evidence described above. The PR271 release was observed deployed
on the Vercel and Railway targets on 2026-09-14. The owner waived restore, preview-isolation,
and two-phone gates for this release. Existing-user/reset live evidence is
recorded above; fresh-user acceptance still requires one designated
unregistered sender. Do not treat that remaining gap as evidence that the
current existing-user path is unavailable.

Before editing, run `git diff --stat 3df3051e21ed722f783a2e615f2c7b629d32b65c..HEAD -- agent/channels/sendblue.ts agent/lib/sendblue db/services db/schema src/auth src/env.ts` and compare the current-state statements above. Read current AGENTS/CONTEXT, installed Eve docs routed from `eve/docs/README.md`, Better Auth 1.7.2 contracts, and provider docs. Context7 was not available during planning; the executor must use it if available and otherwise inspect installed/official sources.

1. **Contract, continuation proof, and RED:** approve identity assurance, initial capability list, enrollment policy, limits, and copy. Resolve the durable-consumer dependency above with installed documentation and a synthetic interruption proof before declaring the implementation design ready. Add real channel-boundary failing tests for a previously unknown first sender, opening photo/request preservation, and two-user isolation. Run the focused tests and observe the current silent rejection. No behavior-changing source before RED.
2. **Durable enrollment:** implement atomic/resumable canonical provisioning, assurance-aware binding, inbound claims, and welcome intents behind an off-by-default runtime-validated flag. Test duplicate/concurrent events and interruption after each write; prove no partial setup grants agent access. Audit all consumers of changed identity status/provenance.
3. **Text journey and safe delivery:** wire the fixed welcome, opt-out handling, budget admission, durable delivery consumer, first-request dispatch, and interruption by new messages. Test provider accepted/failed/uncertain outcomes and application restarts. The ready state must be usable before claiming success.
4. **Examples and optional account linking:** add original, clearly labeled illustrative cards for the approved small-business examples (daily sales, low stock, and receiving a delivery), complete text fallback, and supported OTP linking without duplicate user/workspace creation. Do not fabricate live numbers, imply existing Square access, or imitate the screenshot's successful paid booking as a capability claim.
5. **Acceptance and release:** run complete gates; enable only in a designated test cohort first; prove two previously unregistered phones on the exact production candidate. A staged cohort flag is a rollout control, not a permanent invite-only user journey. Enable open enrollment only after these checks and provider/budget approval. Update `docs/agent-loop.html`, canonical current/proposed documentation, and provider note in AGENTS.

Focused existing commands (new tests must be included explicitly as they are added):

```sh
pnpm exec vitest run tests/agent/channels/sendblue-channel.test.ts tests/agent/channels/sendblue-admission.test.ts tests/integration/channel-conversations.test.ts tests/integration/phone-identities.test.ts tests/integration/scope-enforcement.test.ts tests/unit/auth-phone-identities.test.ts
pnpm check
pnpm build
git diff --check
pnpm verify
```

Expected implementation result: new RED cases become GREEN without weakening existing tests; complete verifier passes all five lanes with documented exclusions only. Run `pnpm eval:square` and capture its Results line whenever touched paths match AGENTS' Square gate. Use actual browser QA for optional login/linking and the edited agent-flow diagram, including Agentation when available. Planning itself does not claim these future tests have run.

Live acceptance requires a designated unregistered phone, not a seeded verified account: first plain text -> welcome -> useful answer; a second unregistered phone does the same independently; image-first works; existing user's history remains scoped; duplicates/restarts do not repeat enrollment; STOP suppresses further sends; failed/uncertain delivery recovers without false claims. Record time to first welcome and first useful answer with sample counts, but do not invent latency guarantees. Capture only authorized test data. Keep delivered evidence separate from provider acceptance.

Rollback: turn off enrollment for new senders while retaining existing users' normal path and committed data. Drain/cancel pending welcome work safely. Do not delete enrolled accounts, remove isolation checks, or roll back schema incompatibly.

## 8. Portable handoff for Partyline-v2

Reuse the product contract and acceptance cases, not OpenInstinct's database schema or agent template. The Partyline executor must map its actual provider, user identity, conversation lifecycle, registration, welcome-delivery state, media support, opt-out, and test commands before coding. Live provider configuration is not inferred from filenames.

Proposed Partyline copy: “You're in! 🎉 I'm Partyline. Tell me what you'd like to do and where.” Follow with a few examples of capabilities supported by that checkout. Ask for a city only if needed and not already present in the opening request. Do not block use on a profile, bio, photos, contacts, or permission to publish personal information. Text enrollment does not authorize public profile publication or unsolicited introductions/messages to third parties.

Read-only Partyline inspection: `/Users/dennison/develop/Partyline-v2`, commit `fb24f45d71da3a1f618aedba37084f629032d647`. This is source evidence, not a claim about deployed configuration. No changes were made there.

| Concern                | Partyline-v2 owner and current behavior                                                                                      | Port requirement                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login identity         | `db/services/auth/index.ts`: phone plugin requires verification; `sendPhoneCode` uses Linq; OTP callback links invited users | Keep web verification separate from the proposed channel enrollment; preserve invite attribution without granting extra permissions.                                              |
| Linq first contact     | `agent/channels/linq.ts`, `onMessage`: verified-user admission; otherwise an invite-specific canned reply or ignore          | Route authenticated, genuinely new direct senders through the new enrollment boundary before normal Eve dispatch. Do not interpret every failed admission as eligible enrollment. |
| SendBlue first contact | `agent/channels/sendblue.ts`: `authForPhone` before `claimSendblueInbound`; unlinked sender is acknowledged without a turn   | Move safe first-contact claiming/provisioning into the authenticated boundary, preserving existing delivery status and media handling.                                            |
| Provider configuration | `agent/lib/sendblue/configuration.ts`, `configuredSendblue`: enabled by complete credentials, with explicit SMS policy       | Discover the deployment's actual provider. Do not copy OpenInstinct environment-variable names or assume SendBlue also supplies Partyline OTP.                                    |
| Receipts and media     | `db/schema/sendblue.ts`, `db/tests/sendblue-receipts.test.ts`; channel calls `ingestInboundMedia`                            | Reuse the existing receipt lifecycle and scoped media rather than importing OpenInstinct's report-specific delivery utility. Audit ambiguous dispatch behavior.                   |
| Product onboarding     | `/onboarding` and `app/(authenticated)/_components/dating-profile-onboarding.tsx`                                            | Dating-profile completion/publication is not a prerequisite or implied consent for basic text use.                                                                                |

Partyline test anchors: `tests/agent/channels/linq-inbound-auth.test.ts`, `tests/agent/channels/sendblue-native-channel.test.ts`, `tests/agent/lib/sendblue-admission.test.ts`, `db/tests/sendblue-receipts.test.ts`, and `db/services/auth/tests/linq.test.ts`. Read `docs/agent-development.md` and its verification runbook; use the current focused recipe for new RED/GREEN tests, followed by `pnpm check`, `pnpm build`, `git diff --check`, and `pnpm verify`. Do not copy OpenInstinct's `--lane` options without checking Partyline's verifier. Partyline AGENTS requires actual live messaging acceptance before merge and release through a reviewed PR to main, not CLI deployment. Use only explicitly designated test recipients.

Partyline does not have an identical OpenInstinct phone-identity/workspace-binding model. Map its canonical identity and ownership contracts before schema design; do not import a parallel tenant framework. Implement only the missing assurance/enrollment/delivery state needed for the shared acceptance cases.

Copyable instruction for the Partyline instance:

> Plan the Partyline port of Plan 026 against the current checkout, then wait for implementation approval. The normal journey must be first text -> isolated channel enrollment -> short welcome/examples -> first useful answer, without mandatory web signup, JOIN challenge, or profile publication. Preserve the opening request and media. Read this complete plan for the identity-assurance, opt-out, delivery-recovery, and acceptance contracts. Revalidate the Partyline file map against HEAD; identify the actual configured provider separately from login OTP. Reuse Partyline's owning identity, receipt, media, and verification primitives; do not transplant OpenInstinct tables. Delegate implementation to Terra/Luna only after approval. Require RED before code changes and two fresh-phone live acceptance before merge. Do not change credentials, billing, contact eligibility, publish profiles, message third parties, or expose existing users' resources to make onboarding work.

## 9. Approval and STOP conditions

Default proposals to approve: open enrollment; first text is enough for channel-only basic use; illustrative small-business cards with text fallback; optional dashboard verification later; small welcome rather than seven mandatory images. Outstanding launch values: fresh-user capability allowlist, actual provider line/contact eligibility, spending/rate limits, and approved policy URLs/copy.

Stop if safe channel-only assurance cannot be represented without granting web/admin access; provisioning would claim an existing or suspended identity; the provider cannot receive/reply to new contacts; a required durable consumer or privacy-safe diagnostic does not exist; or a change requires unapproved secrets, billing, public profile publication, or external messages. Bring the concrete conflict to the owner rather than redesigning the onboarding into a website funnel.
