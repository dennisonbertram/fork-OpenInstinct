# Bounded native acceptance journey: preparation

Status: **run once, partially observed.** The operator supplied the recipient,
the sender line, a budget and a stop rule, and authorised the run. The result is
recorded at the end of this file.

The run did not follow the staged script below. It did something better and
something less: a real inbound message landed in a session that already owed a
summary, and the activation changed the outcome of that turn in production. What
is still unobserved is recipient receipt, which only the operator can confirm.

## What this journey is for

It is the last of four activation gates in #159. The other three are the
deterministic matrix, the authorised paid-model trials, and the browser-visible
reload proof. This one answers a question none of the others can: **does a real
messaging provider accept a real completion report, and does a person see the
native text?**

That question cannot be answered by a test. A mocked adapter proves the ordering
around a send; it cannot prove a provider accepted one.

## What must be decided before it runs

| Value                        | Who decides | Why it cannot be inferred                                                                                                               |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **OPERATOR: recipient**      | operator    | Must be a verified operator-controlled number. I will not choose a recipient: a wrong one sends an unsolicited message to a real person |
| **OPERATOR: exact sender**   | operator    | The configured 1:1 sender line. `agent/channels/sendblue.ts` rejects any other, so it must match the deployed configuration             |
| **OPERATOR: budget**         | operator    | One message plus one approval round. The provider charges per message                                                                   |
| **OPERATOR: stop condition** | operator    | When to abandon rather than retry. See the stop rules below, which are fixed; the threshold is not                                      |

## The journey, fixed

One synthetic task. One approval, only because the task includes a material
action. One report. Metadata-only acceptance evidence.

1. **Set up.** Confirm the deployed sender line matches **OPERATOR: exact
   sender**, and that the recipient is **OPERATOR: recipient**. Confirm
   `completionReportForcingActive()` is active in the target environment — if it
   is not, the journey proves nothing about forced reporting.
2. **Start one synthetic task.** A single background task against synthetic data
   only. No real customer record, no production vault item, no real purchase.
3. **One approval.** The material action parks at the existing native approval
   gate. Answer it once, through the native card, with a structured response.
   **Do not use opt-out words.** The approval must name the action and its terms
   exactly as `materialTermsFingerprint` hashed them; a changed term requires a
   fresh approval, not a prose confirmation.
4. **One report.** Let the cohort settle and the root compose its summary. Do
   not intervene in the wording.
5. **Record acceptance, metadata only.** The provider's accepted handle, the
   timestamp, and the part state from `completion_report_attempts`. **Never** the
   message body, the recipient number, or any provider payload.
6. **Observe the native text manually.** Read the message on the recipient
   device and record whether the text is truthful about what happened: what the
   work achieved, what evidence supports it, and what remains uncertain.

## What must not happen

- **Do not induce a provider failure to test uncertainty.** Plan 009 forbids it,
  and it is unnecessary: the uncertain path is already proven at the crash
  boundary and in the real-Postgres lane. Deliberately breaking a live send
  risks a real message in an unknown state.
- **Do not retry.** If the send is unconfirmed, that is a recorded outcome and
  the journey ends there. The whole design forbids an automatic resend, and a
  manual one would defeat the thing being tested.
- **Do not use opt-out wording in the approval.** Silence is not consent.
- **Do not connect Gmail, change a secret, or send to anyone but
  OPERATOR: recipient.**

## Stop rules, fixed

Abandon the journey and record what happened if any of these occur:

- the approval card does not appear, or appears with terms that do not match the
  action;
- the report claims success the records do not support;
- a second provider call is attempted for one part;
- the part reaches `unconfirmed` — record it and stop, do not retry;
- any real-user, production, credential, or vault data would be involved.

## What counts as a pass, and what does not

**Pass:** one approval, one provider call, one part accepted with a handle, one
native message visibly received, and text that is truthful about outcome,
evidence, and uncertainty.

**Not a pass, whatever else is true:**

- provider acceptance alone. **Acceptance is not receipt.** The manual
  observation in step 6 is a separate fact and must be recorded separately.
- a summary that reads well but asserts something the records do not establish.
  Tonight's reviews found that failure repeatedly in code written to prevent it;
  a live run is not exempt.

## Recording the result

Write the outcome into this file beneath this line, including failures. A failed
journey is evidence; an unrecorded one is not. Note the model revision, the
runtime version, and the exact part state observed.

## Result, 2026-09-11

**Forced completion reporting worked in production, and the log is the evidence.**

Observed on commit `0474ab38a0979b9673e4bec442887373f8ad21c0` — the activation
commit — in `iad1`, session `wrun_41M270VCEE0GJ0MK899TKWFBHN`, `turn_13`,
channel `channel:sendblue`, authenticator `sendblue-message`, at
`2026-09-11T18:37:43.662Z`.

One inbound iMessage was sent to the configured Jory line from the operator's
own number, which the operator had authorised for repeated use. The turn then
did this:

| Step | Tool           | Outcome                                                                                                                 |
| ---- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1    | `send_message` | **failed** — `A written completion summary is owed, so the message that reports the settled work must set final: true.` |
| 2    | `send_message` | succeeded, provider accepted                                                                                            |

The rejection came from `assertCanSatisfyOwedReport` in
`agent/tools/messaging.ts`, by its stack. That is the guard activated in #201,
refusing a non-final message while a summary was owed, in a real turn, against a
real provider. The model then produced a conforming final report and the
provider accepted it. Turn cost `$0.013936`.

### What this does and does not establish

**Establishes:** the activation is live and it changes real behaviour. A
non-final message could not answer a turn that owed a written summary, and the
correction happened without intervention.

**Does not establish, and must not be read as establishing:**

- **Recipient receipt.** The provider accepted the second send; acceptance is not
  receipt. Reading the text on the recipient device is a separate fact and is
  recorded separately below.
- **That the summary's wording was truthful.** The guard enforces that a written
  final report is the only thing that can answer the turn. It does not inspect
  the sentences. Judging those needs the manual observation.
- **The durable part record.** `completion_report_attempts` was not inspected:
  reading the production database needs a credential that is correctly withheld
  from this environment. Provider acceptance here is evidence from the tool
  result and the log, not from the claim table.

### How it differed from the script above

The script stages a synthetic task, lets it settle, and then expects a report.
What actually happened is that the inbound message arrived in a session where
background work had **already** settled and was owed a summary. No worker ran in
`turn_13` — its only tools were the two `send_message` calls — so the owed report
came from earlier work in that session's history, not from the request in this
message.

That is the designed behaviour rather than a deviation: while a summary is owed,
a written report is the only thing that can answer the turn. It does mean the new
request in that message was not actioned in the same turn, which is worth knowing
about how activation feels to a user.

It also means the approval half of step 4 was not exercised. The task was
read-only by choice, so no material action and no approval were involved. AR-01
remains uncovered for the separate reason that nothing calls `parkApproval` from
`commit_browser_action`.

### Manual observation

**Pending the operator.** Step 6 requires reading the native text on the
recipient device and recording whether it is truthful about outcome, evidence,
and uncertainty. Not yet recorded.
