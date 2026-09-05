# STORY-011 — Turn a starter into a specific draft

Status: **partial**. Evidence captured by the coordinator/baseline walker on 2026-09-05 at `http://localhost:3000`, source `f11a3a1`, designated synthetic local account. This report consolidates those observations; its author did not perform a new browser run. All linked decisive PNGs were opened and visually inspected.

## Observed walk

The coordinator selected Make a plan. The textarea filled with the expected starter text and received focus; `starter-filled.png` visibly shows the filled draft and focus border. No message was sent by selecting the chip alone. The coordinator then replaced the draft and submitted a synthetic request as part of STORY-013.

## Flow log and limits

Starter selection/focus is observed. The catalog's exact Saturday edit, Shift+Enter multiline step, and leave-unsent endpoint were not walked as a complete sequence. The edit-and-submit continuation is accounted for in STORY-013 and must not be counted as a second independent full pass here. Other chips and replacement of an already substantial draft remain unverified.

Evidence: `../../preflight/root-followup.md`. No whole-story actual/ideal ratio is claimed.

## Final draft-only completion

Root completed the outstanding safe sequence on localhost:3000: opened Chat, chose Make a plan, observed focused prefilled draft, then edited it to two actual lines without submitting. Viewed screenshots/multiline-mobile.png and multiline-desktop.png show the text fully inside the composer; URL remained /chat with no new conversation. Geometry showed zero page overflow and only hidden Agentation reports. Initial edited-unsent/mobile captures used literal backslash-n; the later multiline captures supersede those for newline verification. Returned to Workspace without sending. Final primary status: **pass**. Core starter/edit actions: two, equal to ideal; opening route and audit viewport changes excluded.
