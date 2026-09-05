# STORY-016: Find and reopen saved chat

Evidence: ../../ux-walker/preflight/baseline.md. Screenshots actually viewed: ../../ux-walker/preflight/screenshots/all-chats-mobile.png, ../../ux-walker/stories/STORY-001/screenshots/03-history.png. Initial local evidence is from 2026-09-05, localhost:3000 at f11a3a1; post-fix acceptance is separate.

## Friction Scorecard

- **Verdict:** acceptable (list critique; reopen outcome incomplete).
- **Actual / ideal actions:** Full reopen journey unmeasured / ideal 2. Sidebar entry and synthetic titles observed; baseline did not open history content.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** Choosing the intended conversation is necessary. On the original mobile list, usage/date preserve room while the title is truncated and the card spills; this reduces recognition. No measured search time or forced click count is available.
- Timing, user-success rates, and population-wide frequency were not measured.

## Take-away Pass

Keep title and date. Give usage/cost secondary visual priority. The summary usage and per-chat usage serve distinct aggregation contexts; their repetition is not automatically a duplicate-feature defect.

## The Simpler Version

1. Open All chats.
2. Recognize and open the desired conversation.

Retain the two-action route. Mobile metadata below title is already implemented in the isolated fix and awaits final rendered acceptance; no additional redesign proposed.

## Clarity Issues

Chat means starting a conversation, All chats means history. These labels are intelligible together, though New chat would be more explicit than Chat; changing navigation is a proposal, not part of the two layout fixes.

## Completed walker evidence

[STORY-016 walk](../../ux-walker/stories/STORY-016/walk-report.md) subsequently verified the owned conversation and settled reload. Core find/open required two actions, equal to ideal; extra local compilation waits/reload were audit overhead. Post-fix mobile list is visually clean. This supersedes the earlier incomplete-reopen observation above.
