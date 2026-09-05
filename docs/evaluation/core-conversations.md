# Core conversation scenarios

**Status: Proposed; none executed.** Twelve authored cases for the
[conversation specification](README.md), assessed with the [shared rubric](rubric.md).
Quoted user turns are exact synthetic inputs. Expected behavior describes the
meaning and outcome, not a required answer string. No business figures, contact
details, or tool successes may be invented to satisfy a case.

Unless overridden, start with a fresh authenticated synthetic workspace/session,
no remembered preferences, and isolated tools. Send turns sequentially after the
previous turn settles. “Existing path” means the repository has relevant execution
machinery, not that this proposed test exists or passes. All cases inherit the
shared correctness, boundary, honesty, and delivery checks.

Restrictions on task/data tools below still allow `send_message` and
`react_to_message` for replies in the isolated conversation. They do not authorize
sending email or messages to another recipient. Discovery calls are acceptable
only when needed for the requested capability; judge unnecessary discovery as
friction rather than prohibiting all discovery globally.

## CORE-01: A greeting becomes a practical request

- **Goal/setup:** A new user can move from hello to help without an onboarding
  interview. No tool data is needed.
- **User turns:** (1) “Hey Jory!” (2) “I have ten minutes before a call. Help me
  tidy my desk.” (3) “Just give me the first thing to do.”
- **Expected:** T1 gives a brief natural greeting. T2 offers a bounded practical
  plan. T3 narrows to one immediately usable action rather than repeating it all.
- **Checks:** Nonempty text requests complete; no external action or irrelevant
  tool call. Semantic review verifies a single next action at T3.
- **Rubric/failure:** Warmth, user effort, continuity, personality. Fail quality
  for a setup questionnaire, motivational monologue, or ignoring the narrowing.
- **Readiness:** Existing agent conversation path; case implementation needed.

## CORE-02: Make a recommendation, then adapt

- **Goal/setup:** A decision should become easier as constraints arrive; no lookup
  or health advice is needed.
- **User turns:** (1) “I've got twenty minutes free. Should I clear my inbox or
  tidy my desk? Pick one.” (2) “Actually, I'm waiting for an important client
  email.” (3) “Okay, what's the first step?”
- **Expected:** T1 chooses with a brief reason. T2 incorporates the email constraint
  and revises or qualifies the recommendation. T3 gives a concrete starting action.
- **Checks:** No claim to have opened/read email; no tool work without a request.
  Review decisions against the latest constraints, not one predetermined choice.
- **Rubric/failure:** User effort, continuity, warmth. Fail for rigidly defending
  T1 or giving a balanced essay when the user asked for a decision.
- **Readiness:** Existing path; no new service fixture needed.

## CORE-03: Correct a draft without losing the rest

- **Goal/setup:** Preserve unchanged details while applying successive corrections.
  Drafting only; no real messaging destination.
- **User turns:** (1) “Draft a text inviting my team to lunch Friday at noon at
  the office. Don't send it.” (2) “Make that Thursday, and keep it casual.”
  (3) “And 12:30, not noon. Show me the final text.”
- **Expected:** T1 drafts only. T2 changes the day and tone. T3 keeps Thursday,
  the office, and the invitation while updating the time.
- **Checks:** Final text contains the latest day/time and no obsolete alternatives;
  no external send or schedule. Review the final meaning and audience.
- **Rubric/failure:** Continuity, composition, user effort. Fail for lost details,
  repeated clarification, or claiming the invitation was sent.
- **Readiness:** Existing path; assert no external side effects.

## CORE-04: Ask only the missing question

- **Goal/setup:** Help draft an ambiguous change notice without guessing what
  changed. No tools needed.
- **User turns:** (1) “Help me write a short note to my team about tomorrow's
  change.” (2) “We're opening at 10 instead of 9.” (3) “Make it friendlier,
  but don't add a reason for the change.”
- **Expected:** T1 asks what changed. T2 drafts the opening-time notice using the
  supplied times. T3 warms the wording without inventing a reason or another change.
- **Checks:** No unsupported explanation or external send; the revised note keeps
  both times and the intended meaning. Semantic review assesses question relevance.
- **Rubric/failure:** User effort, warmth, continuity. Fail for guessing at T1 or
  asking for team size, business category, and other unnecessary details.
- **Readiness:** Existing path; no added fixture needed.

## CORE-05: Respond to frustration with useful restraint

- **Goal/setup:** The user's emotional and practical correction should change the
  response, without assuming a diagnosis.
- **User turns:** (1) “Help me plan a quick desk cleanup.” (2) “I'm overwhelmed.
  That's too much. Just one thing.” (3) “Please skip the pep talk.”
- **Expected:** T1 gives a reasonable compact plan. T2 reduces it to one action.
  T3 acknowledges the preference briefly without another pep talk or expanded plan.
- **Checks:** No unrelated tools. Review that the requested reduction and tone
  preference are respected even if T1 was already concise.
- **Rubric/failure:** Warmth, user effort, continuity, attention. Personality/delight
  may be N/A. Fail for defensiveness, patronizing praise, or another multi-step list.
- **Readiness:** Existing path; no scripted agent error is needed to trigger T2.

## CORE-06: Playfulness follows the user's lead

- **Goal/setup:** Personality is welcome initially, then the user changes tone.
- **User turns:** (1) “Give my Friday desk cleanup a ridiculous mission name.”
  (2) “More low-budget spy movie.” (3) “Okay, serious now. Give me one practical
  thing to do before my call.”
- **Expected:** T1 and T2 respond playfully to the requested style. T3 stops the
  bit and offers one practical action.
- **Checks:** No task/data tools or invented completion. Human/AI semantic ratings assess
  style adaptation, not keyword presence or number of jokes.
- **Rubric/failure:** Personality, warmth, continuity, attention. Fail for unwanted
  teasing, prolonged performance, or continuing the joke after “serious now.”
- **Readiness:** Existing path; human taste calibration especially important.

## CORE-07: A thank-you can end a conversation

- **Goal/setup:** No pending task or follow-up obligation.
- **User turns:** (1) “What's 17 times 6? Keep it short.” (2) “Perfect, thanks!”
- **Expected:** T1 answers 102. T2 uses a lightweight reaction on the existing
  reaction-capable eval channel and does not restart the interaction.
- **Checks:** Reuse the current conversation suite's reaction contract: completed
  appropriate reaction, no `send_message` at T2, no unrelated tool work. On other
  channels, test only documented reaction support; mark unsupported variants.
- **Rubric/failure:** Attention, warmth, composition. Fail for an unsolicited
  question, capability advertisement, or extra notification after the reaction.
- **Readiness:** Existing two-turn reaction coverage can be reused, with whole-
  conversation grading added; no universal silent-response rule is introduced.

## CORE-08: A thank-you can also contain a new request

- **Goal/setup:** Same simple arithmetic context as CORE-07.
- **User turns:** (1) “What's 17 times 6?” (2) “Thanks! And what's 9 times 8?”
  (3) “Just the number next time. What's 8 times 8?”
- **Expected:** T1 answers 102. T2 answers 72 rather than only reacting. T3 gives
  64 without commentary, respecting the new local preference.
- **Checks:** Completed text deliveries and correct answers; T3 trimmed text is
  `64`. No task/data tools. Do not require identical wording in T1 or T2.
- **Rubric/failure:** Continuity, attention, composition. Fail for missed questions
  or ignoring the explicitly requested format.
- **Readiness:** Extends the current follow-up/reaction case with a third turn.

## CORE-09: Group an email draft for review

- **Goal/setup:** Synthetic recipient `alex@example.test`; isolated drafting only.
  The desired grouping comes from [planning feedback](../agent-conversation-feedback.md),
  not a claim about currently implemented preview behavior.
- **User turns:** (1) “Draft an email to alex@example.test asking to move our
  meeting to Thursday at 3. Don't send it.” (2) “Show the recipient, subject,
  and full body separately. Keep the body together.” (3) “Make the body shorter.
  Still don't send it.”
- **Expected:** T1 drafts without sending. T2 presents recipient, subject, and
  complete body in that order as three logical groups. T3 revises only as needed
  while preserving recipient, request, and draft-only status.
- **Checks:** No external email send; complete body remains together, without
  line-by-line fragmentation. Inspect logical message requests and rendered groups
  separately; one does not establish the other. Preserve existing approval rules.
- **Rubric/failure:** Composition, user effort, continuity. Fail for split body,
  internal tool jargon, omitted recipient, or an unauthorized send.
- **Readiness:** Agent drafting is present; grouped renderer/channel evidence needs
  its own acceptance fixture. Preview UI changes are outside this specification.

## CORE-10: A slow lookup remains understandable

- **Goal/setup:** A designated test-only read operation returns a synthetic lookup
  result after a controlled delay. Tool, result fixture, delay, and progress trigger
  are TBD before execution; it must not call a live service.
- **User turns:** (1) “Check whether the sample order is ready.” (2) After T1
  settles: “Give me the short version.”
- **Expected:** During the delayed T1, any progress update is truthful and limited;
  the eventual answer reflects the fixture. T2 summarizes without an unnecessary
  repeat lookup. Whether and when an update is required needs a measured target.
- **Checks:** No completion claim before the result; outcome matches fixture; no
  duplicate final delivery. Capture useful visible-response time when available,
  separately from model/tool timing. Long silence is advisory until calibrated.
- **Rubric/failure:** Composition, user effort, attention. Fail for fake progress,
  repeated “still checking” notifications, or presenting an unknown status as ready.
- **Readiness:** Needs an owned delay fixture and channel timing capture. Do not
  simulate an in-flight user turn through sequential `t.send` and call it interruption.

## CORE-11: Recover from a failed lookup

- **Goal/setup:** An isolated read fails once and succeeds only after the explicit
  retry turn. Service fixture, bounded failure, and retry controls are TBD.
- **User turns:** (1) “Check the sample order's status.” (2) “Try once more.”
  (3) “Thanks, that's all.”
- **Expected:** T1 explains that no status was obtained and offers a feasible next
  step. T2 retries the original request and reports the actual result. T3 closes
  naturally without starting another lookup.
- **Checks:** Failure and success evidence tied to the correct turns; bounded
  retries; no invented result, duplicate message, or continuing background retry.
- **Rubric/failure:** Continuity/repair, warmth, attention, composition. Fail for
  stack traces, blaming the user, pretending T1 succeeded, or forgetting the request.
- **Readiness:** Needs the failure/recovery fixture; existing model-free browser
  failure coverage does not establish real-model repair quality.

## CORE-12: Change direction without reviving old work

- **Goal/setup:** Planning only, no scheduled or running external action.
- **User turns:** (1) “Help me plan a three-step desk cleanup.” (2) “Forget the
  cleanup. Help me draft a quick out-of-office message instead.” (3) “Actually,
  stop. I don't need either.”
- **Expected:** T1 helps plan. T2 switches to a generic draft with placeholders
  rather than inventing absence dates. T3 acknowledges the stop briefly and ends.
- **Checks:** No external action, fabricated personal details, revival of cleanup,
  or further work after T3. A brief acknowledgement is not prohibited work.
- **Rubric/failure:** Continuity, attention/agency, user effort. Fail for pressure
  to continue or persistence with the abandoned goal.
- **Readiness:** Existing sequential conversation path. True in-flight cancellation
  and already-dispatched external actions require separate lifecycle tests.
