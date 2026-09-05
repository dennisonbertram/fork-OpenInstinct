# STORY-026 — Keep administration unavailable to a regular member

Status: **fail on shared 404 readability; correct exclusion observed**. Evidence captured by the coordinator/baseline walker on 2026-09-05 at `http://localhost:3000`, source `f11a3a1`, designated synthetic local account. This report consolidates those observations; its author did not perform a new browser run. All linked decisive PNGs were opened and visually inspected.

## Observed state

The coordinator reports the non-admin restricted route correctly returned 404. The decisive screenshot `not-found.png` visibly presents **404** and **This page could not be found.** without protected record content. The text appears almost white on the cream background; it is difficult to distinguish in the rendered capture. No admin content is visible.

## Confirmed shared visual finding

F-019-001 is the single shared **high accessibility** finding for STORY-019 and STORY-026. The coordinator separately reproduced it on port 3018 using the same base source plus only list-layout fixes. Computed observations: `prefers-color-scheme: dark` matched; 404 H1/H2 color was `rgb(255,255,255)`; ancestor MAIN background was `lab(97.3777 0.138849 3.82259)` (cream); BODY was black with inherited white text. This establishes a dark-preference/light-shell mismatch without asserting its implementation cause. No numeric contrast ratio has been invented.

The reporting agent opened and inspected `../../preflight/404-measured.png`; its white text on cream is consistent with the original missing/denied screenshots. Keep this as one systemic finding, not two issue counts. `STORY-026/findings.json` is empty only to avoid duplicating F-019-001, not because its rendered error screen passed.

## Flow log and limits

This report establishes the reported 404 and inspected visual presentation. It does not claim the catalog's full return-navigation sequence or every admin route was walked. Correct exclusion/not-found behavior is separate from readable error feedback. No whole-story step count is available. The screenshot and coordinator task record supply the 404 observation; a separate HTTP log is not included here.
