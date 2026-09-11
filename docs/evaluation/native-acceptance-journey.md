# Bounded native acceptance journey: preparation

Status: **prepared, not executed.** Plan 009 step 4 asks for exactly this — a
single synthetic native acceptance journey documented before it is run, and not
run without separate operator authorisation. Everything below is fixed except
the four values marked **OPERATOR**, which only the operator can supply.

Nothing in this document has been executed. No provider has been contacted.

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

**Result: not yet run.**
