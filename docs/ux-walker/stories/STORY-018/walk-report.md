# STORY-018 — Understand an empty browser-task history and refresh it

Status: **pass for post-fix empty/Refresh/Open chat primary path; naming warning remains**. Evidence captured by the coordinator/baseline walker on 2026-09-05 at `http://localhost:3000`, source `f11a3a1`, designated synthetic local account. This report consolidates those observations; its author did not perform a new browser run. All linked decisive PNGs were opened and visually inspected.

## Observed walk

The baseline opened Tasks. Desktop screenshot shows Browser traces, explanatory text, Open chat, Refresh, and the empty history sentence. No browser trace records exist in the displayed state. Mobile screenshot shows overlapping table headings and clipped empty guidance.

## Measured baseline evidence

The baseline recorded a 358px table with 414px scrollWidth (56px spill); Status width 32.22px versus 48px scrollWidth and Duration width 28.63px versus 61px scrollWidth. These values come from the copied existing geometry evidence; no new measurement was performed here. Sidebar/mobile header says Tasks while the page heading says Browser traces.

## Flow log and limits

This covers the empty display, not the full catalog sequence. Refresh was not activated in the baseline and its pending/settled recovery is unverified. Open chat's control was visible, but this report does not claim its click was performed. The missing Refresh step makes overall status partial; the mobile rendering failure is independently observed. Baseline reports no JavaScript errors or failed completed requests.

Evidence: `../../preflight/baseline.md`; copied desktop/mobile screenshots and `snapshots/mobile-geometry.json`.

## Separate post-fix verification

The coordinator supplied `../../fixes/screenshots/tasks-mobile-after.png`, which this reporting agent opened and visually inspected: the empty guidance now wraps, and unused table headers are no longer shown in the empty state. The coordinator reports five relevant regression E2E tests passed. This is separate layout-fix evidence on port 3018; it does not retroactively claim the original Refresh/Open chat story steps were walked. Preserve the partial full-story status. The task naming observation remains unchanged. The exact code/fix SHA and broader verification gates belong to the coordinator's delivery record.

## Completed primary-path follow-up on port 3018

The same reporting agent then walked the remaining steps using `ux-fixed-openinstinct`. Selected Tasks from history, observed the loading skeleton (`refresh-before.png`), and waited for the empty list (`refresh-before-settled.png`). The settled desktop image shows clear empty guidance without unnecessary table headers; geometry clean after excluding development overlays.

Selected Refresh once and waited for the request. `snapshots/network-tail.txt` contains a completed traces.list GET200; `refreshed-mobile.png` at390×844 still shows the empty state and readable wrapped guidance. The transient disabled/spinner state completed too quickly to capture, so its appearance is not claimed. Mobile geometry has zero page overflow and no product spills/wrapped controls.

Selected Open chat and waited for `/chat`; `open-chat.png` shows the mobile blank composer. All these screenshots were opened and inspected. This finishes the actual empty-state navigation/refresh sequence without sending an assignment. The primary route takes Tasks→Open chat (two actions, equal to the catalog ideal); Refresh adds one deliberate verification action. No JavaScript errors were reported in `errors-after.txt`. F-018-001 is now verified resolved for this empty primary path; populated table behavior is covered by the coordinator's separate regression work, not claimed here. F-018-002 task naming remains a low warning.
