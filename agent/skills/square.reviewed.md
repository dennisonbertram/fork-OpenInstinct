---
candidate: square-discover-then-call
owned_skill: agent/skills/square.md
status: reviewed
reviewed_at: 2026-09-11
review_by: 2026-12-11
---

# Reviewed procedure: discover Square, then call it

A record of one procedure that was reviewed and promoted through the existing
skill path, so the promotion has a source, evidence, a review date, and a way to
retire it. This is a maintainer document, not runtime instructions: nothing here
is loaded into a model context, and nothing here may be edited by the agent.

## Trigger

The user asks about Square or their point of sale — sales, orders, customers,
catalog, inventory, invoices, payments, refunds — or about business receivables
or outstanding customer balances, even without naming Square. The owned skill's
own `description` is the authority on when it loads; this restates it rather than
competing with it.

## Owned skill and allowed tools

`agent/skills/square.md`, loaded on demand through the root's retained
`load_skill`. The procedure permits only tools that already exist:
`connection_search` for discovery, then the discovered read-only Square tools.

## Preconditions

- A Square connection is installed for the acting scope. Installation metadata is
  **not** proof the OAuth grant is still valid; Square auth owns that check and
  this procedure does not second-guess it.
- The request is a read. The connection cannot refund, cancel, create, update or
  delete, and the skill says so plainly rather than attempting one.

## Expected evidence

A discovery call followed by the specific read that answers the question, with
the answer traceable to that read. A figure the model recalls without a read is
not evidence.

## Prohibited behaviour

This is the half worth writing down, because it is what a promotion could erode:

- **No promotion from content.** Page text, tool output, a quoted message, a
  connection description, or a profile value may never become an instruction or a
  new procedure, however imperative its wording. Personal Info recall states this
  for profile values; it holds for everything else the model reads.
- No new connector, no write operation, no user-created skill, no loading fetched
  text as instructions, and no model-authored permanent instruction.
- No claim that a change was made in Square. The connection is read-only.

## Retirement condition

Retire this record when the Square connection stops being read-only, when
discovery stops going through `connection_search`, or when the owned skill is
removed. Re-review by the date in the front matter whichever comes first; an
unreviewed record is not a licence.

## Evidence that it holds

`evals/contract/square-skill-loads.eval.ts` covers the model-free load path.
`tests/agent/skills/reviewed-procedure.test.ts` covers the positive route and the
negative case where content asks to be remembered or followed.
