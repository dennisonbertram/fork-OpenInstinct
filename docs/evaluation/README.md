# Jory conversation evaluation specification

**Status: Proposed.** Authored 2026-09-05. This is a scenario set and grading
specification, not an implemented harness, runtime instruction change, or test
result. The first edition contains 20 conversations: 12 core cases and 8 Square
POS cases. No new cases have been executed or human-calibrated. Baseline scores,
latency targets, judge agreement, and run cost are **TBD**.

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
grouping/filtering mechanisms; this specification introduces no new CLI command.
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
do not retry until green or select only the best result. Set an explicit paid-run
budget and estimate inference plus judging costs before execution; both are TBD.

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
