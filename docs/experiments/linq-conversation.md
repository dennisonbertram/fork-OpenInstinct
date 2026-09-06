# Linq conversational-path experiment

Status: baseline measured; implementation and treatment verification in progress.

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

Treatment measurements, deployment acceptance and final recommendation: TBD.

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
Postgres container, so its count was different. The production `pnpm build`
also passed after final content cleanup, and `git diff --check` passed.

## Limits

This is a small sequential before/after experiment in one conversation, with
one scored sample per prompt. Repeated calibration prompts, growing history,
provider load and caching can affect the comparison. It cannot establish a
general latency percentile, causal inference-only savings, or a tenfold gain.
