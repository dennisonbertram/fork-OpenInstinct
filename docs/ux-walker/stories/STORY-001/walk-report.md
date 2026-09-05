# STORY-001 — Sign in and resume a saved dashboard destination

Status: **fail (mobile destination layout)**. Authentication, callback return, and persistence passed. Walked 2026-09-05 on http://localhost:3000 in isolated session `ux-walker-auth`, at 1280×800 and 390×844, using the designated synthetic phone and local bypass. No source was read during this walk.

## Observed walk and screenshot inspection

1. Opened `/chat/history`; browser redirected to `/sign-in?callbackUrl=%2Fchat%2Fhistory`. `01-signin.png` shows a balanced desktop form and mascot, aligned input/button edges, and one dominant Send code action. Geometry clean.
2. Entered the synthetic phone and clicked Send code. `02-code.png` shows Verification Code with Verify code and the secondary Use a different number action. Geometry clean. One immediate snapshot preceded the async form swap; a redundant Send code lookup found no matching button after the swap. It did not click anything or constitute a product detour.
3. Entered local code 000000 and clicked Verify code. URL became `/chat/history`. `03-history.png` shows All chats, two synthetic conversation rows, correct selected navigation, and a visible account footer. Desktop geometry clean.
4. Reloaded; remained at `/chat/history` with the same signed-in content.
5. Resized to 390×844. `mobile-check.png` shows conversation rows extending beyond the right edge: titles are clipped and usage/date metadata disappears. Geometry measured 353px content spill and 369px list spill, despite pageOverflowX=0. This is a confirmed container-layout problem, not page-level horizontal scrolling.

All saved screenshots were opened and visually inspected. Invisible Agentation controls were excluded from geometry conclusions. No JavaScript errors were reported when checked. Network evidence shows send-otp 200, verify 200, get-session 200; no response bodies or cookies were captured.

## Flow Log

Ideal: 5 actions. Actual core: 5 (open destination, phone entry, request, code entry, verify). Reload and resize are audit checks, not friction. No credential re-entry or lost callback. The user reaches the correct page without a detour. On mobile, the destination's history row layout fails inspection. All chats is repeated in the mobile header and page heading as orientation, not counted as a defect. Sign-out used to prepare the next story is excluded from this goal's count.

Finding: F-001-001 (medium layout). Error/offline and real message-delivery variations were not exercised.
