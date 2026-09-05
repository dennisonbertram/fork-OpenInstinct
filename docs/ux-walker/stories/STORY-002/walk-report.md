# STORY-002 — Recover from an incorrect verification code

Status: **pass with a copy warning**. Walked 2026-09-05 in `ux-walker-auth`; desktop 1280×800, mobile 390×844. No source was read during this walk.

## Observed walk and screenshot inspection

1. From sign-in, entered the designated synthetic phone and clicked Send code. `01-request.png` shows the verification form, aligned controls, and clear primary action; same clean geometry as STORY-001's code form.
2. Entered 111111 and clicked Verify code. The request returned **400**, and `02-rejected.png` visibly says: “That code could not be verified. Request a new code and try again.” The user remained unauthenticated on the verification form. Desktop geometry clean.
3. `mobile-check.png` shows the same error at 390×844 with readable wrapping and both actions visible; geometry clean. The mascot occupies substantial space but the task controls still fit this viewport.
4. Replaced the incorrect code with 000000, clicked Verify code, and reached `/`. The verify request returned **200**. `03-recovered.png` shows the authenticated Workspace and synthetic account footer, with no lingering error. Geometry clean.

Every screenshot was opened and visually inspected. Invisible Agentation elements excluded. `errors.txt` is empty. Network log confirms one negative verification (400), followed by corrected verification (200). Console records the expected failed 400 resource request; no unexpected JavaScript error was reported.

## Flow Log

Ideal: 6 actions. Actual: 6 (phone entry, request, incorrect code entry, verify, corrected entry, verify). No extra request was necessary: the correct code worked after the rejection. The error asks for a new code, while the reset action is labelled Use a different number, which is a copy/discoverability mismatch. This walk corrected the existing code rather than requesting another. No claim is made that the reset branch was exercised. Session preparation sign-out and direct sign-in navigation are excluded from the core recovery count.

Finding: F-002-001 (low error-handling). Blank/short codes and actual provider-delivery failure remain untested.
