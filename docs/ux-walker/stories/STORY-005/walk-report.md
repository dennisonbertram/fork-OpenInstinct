# STORY-005 — Sign out and verify protected-page access

Status: **pass**. Walked 2026-09-05 in `ux-walker-auth` using the designated synthetic account. Final browser state is signed out. No source was read during this walk.

## Observed walk and screenshot inspection

1. At the authenticated Workspace, resized to 390×844 and clicked Toggle Sidebar. `mobile-check.png` shows a full-height sidebar with the account and Sign out icon reachable at its bottom. Geometry clean. The Next development badge partly overlays the account's left edge; this is development tooling, not logged as a dashboard defect.
2. Clicked Sign out. Browser reached `/sign-in`; `02-signedout.png` shows the mobile sign-in form and no authenticated navigation.
3. Explicitly opened `http://localhost:3000/` as a fresh protected request. Browser redirected to `/sign-in?callbackUrl=%2F`. `03-protected.png` captured a transient blank state immediately after navigation; it is retained as evidence, not treated as the settled result. `04-protected-settled.png` shows the complete sign-in page after rendering. Geometry clean for both sign-in audits.

Every screenshot was opened and visually inspected. Invisible Agentation geometry was ignored. Final sign-out returned 200; JavaScript errors log is empty. The fresh protected request, not simply arrival at sign-in, establishes the observed session ended. No response bodies or session cookies captured.

## Flow Log

Desktop ideal: 2 actions (sign out, fresh protected request). Actual mobile path: 3 actions (open navigation, sign out, fresh request). The extra action is the documented mobile menu prerequisite, not an unexplained detour. No repeated data entry, ambiguous confirmation, or hidden account action prevented completion. No findings. Browser-back cached content and induced sign-out network failure were not tested.
