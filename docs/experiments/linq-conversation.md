# Linq conversational-path experiment

Status: bounded experiment complete with a negative latency result. The
treatment candidate is not promotion-ready.

## Question and fixed conditions

Does a smaller initial instruction and tool surface reduce arrival time for
ordinary iMessage replies without losing correctness? Keep
`openai/gpt-5.6-luna-fast` fixed. This experiment adds no classifier call and
does not compare models. A capability-dependent request may incur an extra
model step to escalate; that tradeoff must be reported.

The test uses the owner's authorized local Messages conversation with the
deployed OpenInstinct line. Inputs are synthetic. It preserves the same durable
conversation and authorization path, so its history grows across phases.
No production message contents or vault data are captured in new telemetry.

## Measurement

Each record uses local Unix millisecond timestamps immediately before pressing
Return, at the start of the last accessibility snapshot without a response,
and after the first snapshot containing the response. The latter two bound
reply arrival rather than pretending to measure it exactly. This includes
routing, inference and delivery, and is distinct from server turn completion.

The eight prompts and exact replies are in
[`linq-conversation-baseline.json`](linq-conversation-baseline.json). Score the
visible request: a relevant greeting, exact arithmetic answer, six whitespace
delimited words, acknowledgment of temporary context, correct context recall,
correct context revision, a one-sentence explanation, and a short text
acknowledgment. Report capability side effects separately.

Baseline source: `d09f4e9a5308ac82657f13c1b3c8cbc617fcea38`.
Baseline deployment: `dpl_D1eUMmZsLY737t7daavHrrkp4Lv8`.

Baseline results: 7/8 visible replies correct. The six-word greeting had seven
words. Median arrival was bounded by 10.114–10.699 seconds. The imaginary bag
setup invoked profile save, and its update invoked profile remove plus save,
despite being temporary conversation facts. Those additional operations are
part of the observed baseline, not hidden from the comparison.

Three initial sampling failures are retained in the JSON as excluded calibration
records. One had a long manual observation gap; two exposed parser problems.
The corrected parser matches the response description independently of
accessibility attribute order. All eight scored timing records use successful
response detection.

## Treatment and acceptance

The treatment is off by default and scoped to one verified workspace through
server configuration. It replaces the interactive role's longer task guidance
with a compact conversational role while preserving authoritative safety rules.
Five project tool groups are withheld until explicit escalation. Framework
capabilities that cannot be changed mid-turn remain available and are governed
by the initial instructions. The full task guidance is returned on escalation
as tool content; it is not a replacement system instruction.

Acceptance requires the same eight live messages, correctness scoring, observed
capability escalation, focused failure/recovery tests, repository checks, build,
Square eval evidence, and deployment provenance. Health or mocked tests alone
do not prove the live treatment works.

Wave 1 is committed as source `2ede1f2e6450dc8a69e9cba6db22094a8d8ae454` and
its synthetic records are preserved in
[`linq-conversation-candidate-wave1.json`](linq-conversation-candidate-wave1.json)
and
[`linq-conversation-candidate-wave1-runtime.json`](linq-conversation-candidate-wave1-runtime.json).
Although the production environment was read back with the mode enabled and an
exact workspace match, the runtime record showed no escalation and temporary
facts still used profile-memory operations. Activation was therefore not
proven, and those nine messages are not a valid lightweight-path performance
comparison.

A later candidate at `a0f0883` was built but was not made canonical and did
not receive a test message. The corrected candidate
`2322babb1330a0c5969f7fa36a610fadf596cd6a` was then promoted temporarily as
`dpl_FQoec6rS5WhW4gv2JsvVPLgAjfHU`. Its confirmed synthetic records are in
[`linq-conversation-confirmed.json`](linq-conversation-confirmed.json) and
[`linq-conversation-confirmed-runtime.json`](linq-conversation-confirmed-runtime.json).

All scored turns 44 through 52 recorded actual treatment role selection and
initial project-capability suppression. The preceding activation turn 43
escalated and completed its read-only scheduled-reminder count through
`schedules-list`. This proves the scoped treatment was active for the confirmed
wave; it does not prove that every framework capability was hidden.

## Confirmed result

The eight scored treatment replies were all correct. Their median arrival was
bounded by 13.689–14.2705 seconds, compared with 10.114–10.699 seconds for the
eight scored baseline replies. The treatment was therefore slower in this
bounded comparison, while correctness improved from 7/8 to 8/8. The same
durable conversation was retained and its history, cache state, and provider
conditions changed between phases, so this is not evidence of a causal
slowdown and does not support a tenfold performance claim.

The ninth, capability-dependent web request arrived in 17.716–18.314 seconds,
compared with 21.163–21.775 seconds in the baseline. It is one non-comparable
sample and does not reverse the main result.

Six simple scored conversational turns still used two model calls. The
temporary-fact setup and revision each used four calls and profile-memory
operations despite the temporary-fact instruction. Framework memory and
`web_fetch` remained callable without escalation. The compact project tool
surface therefore did not remove those framework paths. Turn 53 successfully
removed the synthetic picnic-bag profile memory and replied "Done."

The live workspace model was verified at 2026-09-06T13:28:58Z as
`openai/gpt-5.6-luna-fast`, with conversation mode on and the exact workspace
target match.

## Timing boundaries

The current Evlog record is a final turn record, not an ingress or delivery
trace. In the installed Evlog Eve hook, `turn.started` creates the turn logger
(`node_modules/evlog/dist/eve/index.mjs:447-489` and `666-671`), while
`turn.completed` finalizes it (`506-522` and `922-925`). The logger computes
its duration from creation to final emission and assigns the event timestamp at
that emission. The timestamp therefore does not identify user-message ingress
or the first visible reply.

Subtracting `durationMs` from the final timestamp gives an approximate logged
turn start. The interval from local send to that derived start was
6.907–12.951 seconds across the eight confirmed scored turns; the six simple
turns span 6.907–12.671 seconds. For the greeting, local send to that derived
logged start was 10.043 seconds; derived logged start to visible-reply bound
was 2.930–3.501 seconds. Final emission was 4.181 seconds after the observed
reply bubble. These are approximate cross-machine UTC-clock comparisons with
no clock-skew calibration.

The logged runtime interval excludes admission before `turn.started`; it cannot
attribute that earlier gap entirely to a provider, network, or any other single
stage. The nearby request-log ingress times (13:23:31/32) and workflow times
(13:23:38/39) are metadata only and cannot be correlated to event types here.
Likewise, `ai.calls` counts completed model steps but does not separate
inference from orchestration or post-delivery work. Tool durations cover their
action lifecycle and do not prove visible Messages delivery. Subtracting tool
duration from total turn duration is therefore not a model-latency measure.

## Verification record

The first required Square run on the candidate finished at
2026-09-06T12:30:14.709Z with `Results: 7 passed, 1 failed, 5 scored (13 total)`
and `Gates: 92 passed, 1 failed`. Case `square/square/0011` returned
`DELIVERY_COMPLETE` for "Thanks!" without a delivery tool call. The five scored
cases passed hard gates but missed the soft tone score. This run uses
`channel:eve` and the synthetic `local-dev` identity, so it verifies the normal
path and does not exercise the workspace-scoped Linq treatment. The failure
must be resolved before the required delivery gates can pass.

The second Square run, after an attempted acknowledgment instruction repair,
finished with `Results: 9 passed, 2 failed, 2 scored (13 total)` and
`Gates: 88 passed, 5 failed`. The acknowledgment case still returned the
terminal marker without delivery. Case `0007` asked whether the user meant
Square invoices or personal IOUs instead of checking invoices. The ineffective
global acknowledgment instruction was removed; these failures remain
merge blockers and are not grounds for rerunning until a lucky pass.

Focused candidate tests initially passed 60 checks across five files. The first
full check exposed lint/type issues and a schedules test tied to the previous
dynamic-tool lifecycle. After the final content cleanup, `pnpm check` passed
1,180 tests with two skipped (146 files passed, one skipped). The earlier run
included the removed instruction assertion and auto-detected the running eval
Postgres container, so its count was different.

Activation diagnostics were added after wave 1. An installed-library review of
that proposed diagnostic found two defects: it used a top-level `experiment`
field, which can persist in an Evlog session snapshot, and a later
non-suppressed resolver wrote `projectCapabilitySuppressed: false`, overwriting
the first-step observation. These defects were not observed in the live wave.
The corrected record is turn-scoped at `eve.linqConversation`; it writes
`projectCapabilitySuppressed: true` only after an actual suppression. A real
Evlog lifecycle regression confirms that this metadata is present on its
originating finalized turn and absent from the following turn.

After those corrections, the focused Linq and Evlog tests passed 11 tests.
`pnpm check` passed 1,183 tests with two skipped, the synthetic-environment
production `pnpm build` passed, and `git diff --check` passed. These checks do
not establish live activation or performance.

All five CI checks passed for `2322babb1330a0c5969f7fa36a610fadf596cd6a` in
run `34035796214`. Browser acceptance remains incomplete: Safari rendered the
existing chat, but its composer and navigation actions had no effect, so no new
web request was submitted. The candidate is not promotion-ready because this
web acceptance is incomplete and the Square delivery gate remains red.

After the confirmed wave, production was restored to
`dpl_D1eUMmZsLY737t7daavHrrkp4Lv8`. Its canonical alias, readiness state, and
health endpoint were verified. Both temporary conversation experiment flags
were removed.

## Limits

This is a small sequential before/after experiment in one conversation, with
one scored sample per prompt. Repeated calibration prompts, growing history,
provider load and caching can affect the comparison. It cannot establish a
general latency percentile, a causal slowdown, inference-only savings, or a
tenfold gain. The baseline scored records ran in case order 2, 3, 4, 5, 6, 7,
8, 1, while the confirmed records ran in order 1 through 8 because the
baseline greeting was a calibration replacement. The same prompts are matched
by case ID, and the temporary-context sequence 4, 5, 6 is preserved, but the
overall prompt order is not matched.

Do not promote this candidate. Retain the experiment evidence in draft PR 138.
The next bounded instrumentation should identify the inbound, authorization,
queue, and session-start gap before optimizing first inference and send/delivery
stages. A faster model is not yet justified. After those timings are separated,
measure whether fewer model calls and less context improve the first useful
reply while keeping task success and the same safety, authorization, and
approval boundaries. That requires a new experiment; this result does not
prove another implementation fix.
