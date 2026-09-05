# Jory conversation evaluation specification

**Status: Harness implemented; behavioral baseline results and human calibration
remain unverified until a completed run is inspected.** Authored 2026-09-05.
The first edition contains 20 conversations: 12 core cases and 8 Square POS
cases. The implementation schedules 63 trials across 21 execution variants.
Quality thresholds, visible-response latency targets, and human/judge agreement
remain **TBD**. The scenario and rubric documents describe expectations, not
proof that Jory meets them.

## Objective and review materials

Evaluate whether Jory helps someone get something done through a warm, clear,
smooth conversation, with personality appropriate to the situation and reliable
message delivery. Evaluate the configured agent, its tools, state, and channel
behavior; a bare model benchmark cannot establish the product experience.

| Material                                    | Purpose                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Core conversations](core-conversations.md) | Everyday requests, corrections, frustration, message grouping, and endings         |
| [Square POS skill pack](square-pos.md)      | Conversations a business owner has about sales, inventory, customers, and invoices |
| [Grading rubric](rubric.md)                 | Observable requirements, anchored quality ratings, and human calibration           |

The immediate review is of these authored scenarios and expectations. Their
presence does not turn desired behavior into an implemented product capability.

## Existing foundation and its limits

Source inspected at `f11a3a1d7b93fad16f2c61a4ae7751b5a1672675`:

- [Agent conversation evals](../../evals/agent/conversation.eval.ts) have four
  single-turn cases and two two-turn reaction cases. Three single-turn cases use
  an AI judge; they do not establish broad multi-turn quality or human agreement.
- [Agent eval runner](../../evals/README.md) already supports isolated runs,
  behavioral families, and judge checks. Extend that execution path rather than
  creating a second general-purpose framework.
- [Delivery helper](../../evals/agent/shared.ts) reads the input of a completed
  `send_message` call. This is evidence of a delivery request, not recipient receipt.
- [Contract evals](../CONTRACT_EVALS.md) exercise scripted model behavior; the
  [browser tests](../../tests/e2e/README.md) exercise real web routes with a fixture
  model. Preserve them as deterministic regression coverage. They do not measure
  the real model's tone, judgment, or inference latency, or actual Linq receipt.
- [Square gym](../../evals/square/README.md) has thirteen single-prompt cases using
  a narrow local fake. Its existing factual, tool, and message-shape checks are a
  starting point for the Square pack. Historical green runs are not results for
  the proposed conversations.

## Skill packs are evaluation groups

A skill pack groups business-owner conversations around an existing capability.
It is an evaluation organization concept, not a new product plugin, installable
skill format, loader, or registry. Square POS is the first pack. Future domains
can use the same rubric and authoring format when requested; no empty packs are
needed now.

Each pack owns its scenario IDs, user goals, capability boundaries, fixtures,
domain-specific correctness checks, and selected quality dimensions. It inherits
the core humane and delivery requirements. Domain correctness cannot be replaced
by a high friendliness score, and pack-specific criteria must not relax tenant
isolation, authentication, or existing approval enforcement.

Keep core cases with the existing agent conversation family and Square cases
with the existing Square eval owner when implemented. Use the runner's existing
grouping/filtering mechanisms; the implemented baseline uses an option on the existing `eval:agent` runner.
Capability-specific questions should exercise discovery and skill loading as the
product does, rather than secretly injecting instructions into the tested agent.

## Case authoring and execution contract

Every case needs a stable ID, goal, initial state, exact user turns, fixture or
fault setup, expected behavior by turn, prohibited outcomes, applicable rubric
dimensions, and readiness status. Missing prerequisites must be reported as
blocked or unsupported, never silently omitted or passed.

Use the authored turns in order, waiting for each turn to settle unless a case
explicitly specifies an interruption. Do not expose future turns, hidden fixture
answers, or grading instructions to the agent. At conditional points, use the
documented branch and record it; an unexpected clarification is a behavior to
inspect, not an excuse for an unbounded simulated user to rescue the conversation.
Start with scripted users. Adaptive model-generated users can be explored later
against separately reviewed scenarios.

Each trial starts with fresh session and workspace state, fixed fixture data and
clock where relevant, and isolated tool destinations. Preserve memory within the
conversation. Test cross-session preferences only in cases that explicitly seed
or exercise that capability. Use synthetic or designated test data only. Do not
send to customers, seed a real seller account, use production conversations, or
capture credentials or vault values for these trials.

The proposed initial baseline is three independent trials per execution variant:
63 trials across 20 scenario IDs (21 variants because SQ-07 covers both never-
connected and revoked access). These are not 63 independent scenarios. This is an
exploratory sample, not proof of a population success rate. Record every attempt, including failures;
do not retry until green or select only the best result. The initial authorized paid-run budget was $10; the user subsequently increased
the cumulative authorization to $20. The runner supports either explicitly
authorized total, including inference, judging, and the Square regression gate.
The budget proxy checks live pricing and reserves before each request; total
measured cost remains unknown until execution.

## Run the isolated behavioral baseline

Run from a linked worktree with dependencies installed and Docker available.
Keep the agent instructions and configured model source unchanged. Do not copy
`.env`, `.env.local`, `.env.development`, or `.env.development.local` into the
worktree: the supervisor rejects these files to prevent local application
configuration from overriding the isolated evaluation environment.

The existing runner accepts this complete-suite invocation:

```sh
pnpm eval:agent --conversation-baseline --budget-usd 10
```

The runner requires an authenticated Vercel CLI session for the **fork's team**
and `CONVERSATION_GATEWAY_KEY_FILE`, pointing to a private JSON credential file
with `apiKey`, `keyId`, and `teamId` fields. Use a dedicated Gateway key with an
active **non-refreshing quota equal to the authorized total minus $2**, BYOK
usage included, and a seven-day expiry. That is $8 for a $10 total, or $18 for a
$20 total. The creation example below uses the supported $10 configuration.
The key is retained only by the parent budget proxy; evaluated workers receive
placeholder credentials. No main-checkout dotenv file, OIDC refresh setup, or
real Square account is needed. The isolated database is removed at teardown.
This is an eval path, not an alternative app startup; use `./init.sh` for the
complete local application.

These commands match the installed Vercel CLI. Set the team placeholder to the
fork's actual team ID before running them. Creating another key does not renew
the user's cumulative authorization. Never print the credential file or enable shell
tracing. The create command writes the secret only to a mode-0600 temporary file;
its ordinary status output does not contain the secret.

```sh
umask 077
export CONVERSATION_GATEWAY_TEAM_ID="team_REPLACE_WITH_FORK_TEAM"
export CONVERSATION_GATEWAY_KEY_NAME="jory-conversation-$(date +%s)"
export CONVERSATION_GATEWAY_KEY_DIR="$(mktemp -d)"
export CONVERSATION_GATEWAY_KEY_FILE="$CONVERSATION_GATEWAY_KEY_DIR/credential.json"
pnpm exec vercel ai-gateway api-keys create \
  --scope "$CONVERSATION_GATEWAY_TEAM_ID" \
  --name "$CONVERSATION_GATEWAY_KEY_NAME" \
  --budget 8 --refresh-period none --include-byok --expiration 7d \
  > "$CONVERSATION_GATEWAY_KEY_DIR/api-key.txt"
node --input-type=module -e '
  import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
  import { spawnSync } from "node:child_process";
  const teamId = process.env.CONVERSATION_GATEWAY_TEAM_ID;
  const listed = spawnSync("pnpm", ["exec", "vercel", "ai-gateway", "api-keys", "list", "--scope", teamId, "--format", "json"], { encoding: "utf8" });
  if (listed.status !== 0) throw new Error("Unable to list Gateway keys");
  const matches = JSON.parse(listed.stdout).apiKeys.filter(key => key.name === process.env.CONVERSATION_GATEWAY_KEY_NAME && key.teamId === teamId);
  if (matches.length !== 1) throw new Error("Expected one dedicated key");
  const raw = process.env.CONVERSATION_GATEWAY_KEY_DIR + "/api-key.txt";
  const apiKey = readFileSync(raw, "utf8").trim();
  if (!apiKey.startsWith("vck_")) throw new Error("Unexpected key output");
  writeFileSync(process.env.CONVERSATION_GATEWAY_KEY_FILE, JSON.stringify({ apiKey, keyId: matches[0].id, teamId }), { mode: 0o600, flag: "wx" });
  unlinkSync(raw);
'
```

Wait at least two minutes after creating the key or updating its quota. The
supervisor lists the current keys through the CLI and verifies that this exact
key belongs to the selected team, is active and unexpired, and has an active,
nonarchived quota matching the selected total minus $2, with
`refreshPeriod: none` and BYOK included. It also checks
that the key/quota timestamps are at least two minutes old before inference.
Run the baseline from the linked worktree with the exported credential-file
variable still set:

```sh
pnpm eval:agent --conversation-baseline --budget-usd 10
```

### Increase the authorized total and resume an interrupted run

Increasing the limit requires explicit user authorization. To raise an existing
$10 run to **$20 total**, update the same key's quota to $18; do not create a
replacement key or reset spending. Obtain its nonsecret ID from the credential
file, then use the installed CLI's budget command:

```sh
export CONVERSATION_GATEWAY_KEY_ID="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.env.CONVERSATION_GATEWAY_KEY_FILE, "utf8")).keyId')"
pnpm exec vercel ai-gateway budgets set api-key "$CONVERSATION_GATEWAY_KEY_ID" \
  --scope "$CONVERSATION_GATEWAY_TEAM_ID" \
  --limit 18 --refresh-period none --format json
pnpm exec vercel ai-gateway api-keys list \
  --scope "$CONVERSATION_GATEWAY_TEAM_ID" --format json
```

Verify that the same key remains active, its quota is $18 and non-refreshing,
BYOK remains included, and accumulated spending was retained. Wait at least two
minutes after the quota update. Then resume with the **original timestamp run
ID**, not a new directory or a checkpoint timestamp:

```sh
pnpm eval:agent --conversation-baseline --budget-usd 20 --resume ORIGINAL_TIMESTAMP_RUN_ID
```

Resume preserves completed trial records, their judgments, and the cumulative
ledger. It only starts previously blocked trials with no captured turns and no
paid requests. It refuses attempted partial trials rather than replacing them
with a cleaner result. The prior run must be marked `interrupted` with cleanup
`completed`, all prior costs reconciled, and the same manifest, agent, scenarios,
rubric, agent model, and judge model. Before continuing, it archives the previous
summary, report, budget, and provenance under `checkpoints/<timestamp>/`.
A fresh run may also use `--budget-usd 20` when authorized; `--budget-usd 10`
remains supported with the matching $8 native quota.

When the authorized evaluation work is finished, revoke the dedicated key and
remove its local credential file. Keep the evidence and cumulative budget ledger.
This command reads only the key ID/team for revocation and does not print the key:

```sh
node --input-type=module -e '
  import { readFileSync, unlinkSync } from "node:fs";
  import { spawnSync } from "node:child_process";
  const path = process.env.CONVERSATION_GATEWAY_KEY_FILE;
  const { keyId, teamId } = JSON.parse(readFileSync(path, "utf8"));
  const result = spawnSync("pnpm", ["exec", "vercel", "ai-gateway", "api-keys", "rm", keyId, "--scope", teamId, "--yes"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Key revocation failed; preserve the credential file for cleanup");
  unlinkSync(path);
'
```

The supervisor schedules three trials for each variant: 36 core trials and
27 Square trials. SQ-07 has separate never-connected and revoked variants.
Every trial starts a fresh Eve worker with fresh workspace/session state and follows its exact
scripted user turns. This requires 63 local worker starts so in-memory state cannot leak between trials.
No best-of retries replace failed conversations. The
controlled delay, failure/recovery, ambiguous-customer, and auth fixtures use
synthetic data; they do not contact a seller account or send customer messages.
Failure scenarios report a chosen evaluation threshold of at most three failed
Square HTTP reads per turn (an initial attempt plus two retries). This is a
measurement threshold, not a change to Jory's retry policy. Recovery requires
an order read on the scripted recovery turn; successful location discovery
alone does not count as a successful lookup.

To run only the existing Square regression gate after integration, reuse the
same credential file and cumulative budget ledger through the existing supervisor:

```sh
pnpm eval:agent --conversation-baseline --budget-usd 20 --square-regression-only
```

This creates a separate timestamped run with an empty conversation manifest and
`runKind: square-regression-only` in provenance. It performs the same isolated
database setup, current model lookup, native-quota verification, local spending
checks, and teardown, then invokes the existing Square gate. It does not rerun
the 63 conversation trials or replenish the authorized spending. The option
cannot be combined with `--resume`; use the authorized total of 10 or 20 and its
matching quota. Read `square-regression.log` and the gate's provenance result;
zero conversation trials in this mode is not a behavioral baseline result.

After the 63 baseline trials, the supervisor runs the repository's existing
Square regression gate, separately from the baseline results. Its output is in
`square-regression.log` and its exit status is recorded in provenance. It uses
the same isolated database and spending ledger; failures remain failures.

The **selected cumulative authorization ($10 or $20) covers agent inference,
automated judging, and the Square regression gate together**. The local proxy reserves token costs before
dispatch, using fetched model pricing and bounded input/output estimates. Agent
requests are capped at 4,096 output tokens; judge requests at 2,048. These are
recorded evaluation execution limits, not changes to Jory's authored instructions
or selected model. The judge currently uses `openai/gpt-5.4-mini`; its ratings
are uncalibrated and advisory.

Jory's actual default Exa `web_search` tool remains unchanged: ten results with
highlights of at most 1,000 characters. There is no substituted OpenAI search
tool or imposed hosted-call count. Requests exposing this exact native tool
require the verified dedicated key and add **$2 of operational search headroom**
to the token reservation. That $2 is not a documented maximum charge for the
provider's internal search work. Other hosted tools and multimodal input remain
rejected. Text token reservations use serialized UTF-8 bytes plus 8,192 tokens
for framing, priced at the highest returned tier.

The proxy stops paid dispatch when cumulative charged/reserved spending is
already at least the selected total minus $2 ($8 or $18), or when adding the
next reservation would exceed the selected $10 or $20 total. The dedicated key
supplies the corresponding $8 or $18 native Gateway quota. Native quota
checks occur before requests, but usage accounting and enforcement can lag;
these controls and the headroom are **not an absolute billing guarantee**.
The recorded limits do not promise that all 63 trials will fit.

A reservation is not a measured charge. Returned provider cost reconciles it;
unknown cost retains the reservation and poisons the accounting state, stopping
further paid work. If spending or accounting prevents completion, remaining
trials stay blocked in the report. Inspect native-budget verification, the
ledger, and failure statuses before deciding whether another run is appropriate.
A new invocation creates a new run directory but retains cumulative goal
spending in the shared ledger; it does not replenish the authorization. Reports
separate earlier-run spending from the current run. Do not delete the ledger or
its lock to bypass accounting.

The runner prints its directory under `.eve/conversation-baseline/<run-id>/`:

| Artifact                          | What it records                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `manifest.json`                   | All 63 initially scheduled trial records and stable keys                                       |
| `checkpoints/<timestamp>/`        | Previous report/provenance/budget checkpoint retained before a resume                          |
| `provenance.json`                 | Commit, model/settings, scenario/rubric hashes, pricing source, limits, and cleanup status     |
| `native-budget-verification.json` | Nonsecret key/quota metadata checked before inference                                          |
| `budget.json`                     | Request-level reservations and reported costs, attributed to trial and agent/judge stage       |
| `trials/<key>.json`               | Complete captured turns, message requests, reactions, tool evidence, checks, and judge results |
| `trials/<key>.requests.json`      | Local fixture HTTP outcomes and runner-observed request timing                                 |
| `summary.json`                    | All final records, budget, provenance, and explicit delivery-evidence limits                   |
| `report.md`                       | Full conversations and separate core/Square execution, check, cost, and quality summaries      |
| `review-sample.md`                | Deterministic human-review sample including both packs and observed failures/blocked trials    |

Reports distinguish completed `send_message` requests from channel acceptance,
visible web rendering, and recipient receipt. This harness observes the local
Eve HTTP/SSE conversation and synthetic tool boundaries; it does **not** prove
actual Linq delivery, rendered message grouping, or visible-message pacing.
Reported elapsed times are runner measurements, not recipient latency. Coordinate
those acceptance checks with the separate browser/channel work.

Inspect every failed or blocked trial, judge errors, missing ratings, request
costs, and cleanup status. Execution completion is separate from correctness;
a friendly but wrong answer must remain a failure. Human-review examples are
single baseline conversations, not baseline/candidate comparisons, and do not
establish judge calibration. The requested baseline is complete only after all
63 trial outcomes and their evidence have been inspected; unavailable work must
remain identified rather than being counted as a pass.

## Evidence and reporting

Keep one reviewable report per run, using existing eval artifacts where possible.
No dashboard or production telemetry is required for the first implementation.
Each case/trial should include:

- Commit SHA; agent model and settings; instruction, scenario, fixture, and rubric
  revisions; judge model/settings; trial number; execution mode; channel; timestamps.
- The ordered user-visible conversation with message boundaries, reactions, and
  relevant event times, plus safe tool-result evidence for outcome checks.
- Separate statuses for execution, correctness/boundaries, delivery, quality, and
  human review. Distinguish model/task failure, harness/provider error, blocked
  prerequisite, judge failure, and unobserved channel behavior.
- Quality ratings with cited turn IDs; paired baseline/candidate preference,
  ties, disagreements, and ungraded cases; costs in USD when available.
- Counts and denominators by case, trial, and pack. Show each trial's failures;
  aggregate quality only within the same dimension and list N/A separately.

Report message-tool completion, channel acceptance, visible web rendering, and
recipient receipt as distinct evidence levels. Mark unavailable levels unobserved.
For pacing, measure input acceptance to first meaningful visible response and to
useful completion, plus silent gaps and unwanted message bursts. A typing indicator
or empty acknowledgement does not count as a useful answer. Do not label tool-call
timestamps as visible-message timings. Compare like channels, environments, and
task outcomes; timing targets remain TBD until baseline and human review.

## Implementation sequence after specification review

1. Review the 20 cases and rubric, including authored style anchors. Resolve
   missing product choices without altering runtime instructions in this step.
2. Extend the existing runner to collect whole conversations and per-dimension
   judgments. Add only the missing isolated fixtures/fault controls required by
   these cases. Keep deterministic contract and UI tests separate from paid model
   behavior runs, with scenario IDs linking relevant evidence.
3. Run the budgeted baseline on the current configured agent. Review transcripts,
   calibrate the judge against held-out human judgments, and record disagreements.
   Do not claim calibration from the judge's own explanation or confidence.
4. Once a behavior change is separately undertaken, first preserve its failing
   scenario, then adjust the owning code or instructions and compare matched
   baseline/candidate runs. Follow the existing check/build and Square eval gates.
5. Automate deterministic regressions first. Quality ratings remain advisory until
   calibration and repeatability support a documented threshold. Add a small set
   of channel/browser acceptance journeys for visible pacing and delivery; coordinate
   with existing browser QA rather than driving another agent's active session.

## Research basis

The rubric and scenario choices are a Jory-specific proposal informed by:

- [HumaneBench](https://github.com/buildinghumanetech/humanebench): attention,
  agency, honesty, and wellbeing criteria. Adapting them does not produce an
  official HumaneBench score or require replacing the existing eval runner.
- [Chatbot Usability Scale research](https://d-nb.info/1244027707/34): context,
  understandable information, goal achievement, and waiting experience. Our
  adapted rubric is not the validated administration of BUS-15; the original
  paper itself calls for further validation.
- [Anthropic's agent evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):
  combine verifiable outcomes, model judgments, human review, and repeated trials.
- [LLMs Get Lost in Multi-Turn Conversation](https://arxiv.org/abs/2505.06120):
  test evolving requests and recovery from early assumptions.
- [Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685): account for position,
  verbosity, and self-preference biases when calibrating automated judgments.

These sources motivate the design; none establishes Jory's current quality.

For an explicitly authorized fixture repair, select an authored case and variant, for example `pnpm eval:agent --conversation-baseline --budget-usd 20 --case-id SQ-07 --variant never-connected`. This creates a new run with only those three trials, `runKind: conversation-subset`, and the selection in provenance. It preserves the original evidence and uses the same cumulative ledger and temporary key. The selector validates against the authored manifest, cannot combine with resume or gate-only mode, and skips the legacy Square gate; run that gate separately after integration. A partial repair run is not a replacement for the full baseline or authorization to retry genuine behavior failures.
