# STORY-013 — Start a conversation, continue it, and reload

Status: **fail**. Evidence captured by the coordinator/baseline walker on 2026-09-05 at `http://localhost:3000`, source `f11a3a1`, designated synthetic local account. This report consolidates those observations; its author did not perform a new browser run. All linked decisive PNGs were opened and visually inspected.

## Observed walk

1. After the starter check, replaced the draft with a synthetic request for exactly Ready for review and no tools, then submitted. A session URL was created. This was an equivalent harmless text-only route exercise rather than the catalog's rainy-afternoon wording.
2. Settled UI showed the user bubble only, with no assistant reply, progress indicator, or visible error. `first-send.png` records that state. Usage appeared, but usage is not proof of a delivered answer.
3. Reloaded the same session. `first-send-reloaded.png` shows the same user-only outcome, so the first-response expectation remained unmet.
4. Submitted a follow-up asking for a short greeting. The coordinator observed Stop during pending generation, followed by an assistant **Hi!**. `followup-desktop.png` and `followup-mobile.png` show the delivered follow-up and both user turns.

## Outcome, errors and limits

First-turn response/feedback failed in this observed sequence. Follow-up delivery recovered in the same conversation. The cause is unknown: no provider/credit diagnosis follows from these screenshots. Coordinator reported no JavaScript errors. Mobile geometry was clean apart from invisible Agentation diagnostics; the visible development controls can overlay the composer corner and are not production UI.

A reload after the delivered Hi and an All chats reopen after that success were not documented, so complete two-answer persistence is not verified. Exact waits/actions sufficient for a whole-story friction score were not recorded; the observed reload is a troubleshooting action, not evidence of successful initial continuity.

Evidence: `../../preflight/root-followup.md`.
