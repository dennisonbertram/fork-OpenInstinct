# STORY-021: Save personal profile

Evidence: [completed walker](../../ux-walker/stories/STORY-021/walk-report.md), with inspected screenshots [invalid country](../../ux-walker/stories/STORY-021/screenshots/invalid.png), [saved state](../../ux-walker/stories/STORY-021/screenshots/saved.png), and [reloaded mobile profile](../../ux-walker/stories/STORY-021/screenshots/reloaded-mobile.png). Same-day localhost:3000 baseline at f11a3a1; post-fix acceptance is separate. The earlier [scroll reachability check](../../ux-walker/preflight/root-followup.md) remains supporting evidence.

## Friction Scorecard

- **Verdict:** acceptable; synthetic save, validation recovery, and reload observed.
- **Actual / ideal actions:** 6 input/control actions versus happy-path ideal 4, plus a reload assertion. The extra two actions intentionally test invalid-country rejection and correction; they are not needless production friction. Core successful entry still needs three field entries and Save.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** The initially empty profile accepted synthetic first name and email. Invalid Country code `1!` triggered a visible error. Correcting it to US and saving showed Saved.; reload preserved all three values. No confirmation or forced re-entry of valid fields occurred. No dead end observed. Whether authentication phone should prefill profile phone remains a product decision, not demonstrated redundant entry.
- Timing, user-success rates, and population-wide frequency were not measured. The network update returned 200, and the rendered reload established persistence beyond that response.

## Take-away Pass

Keep Identity and contact / Mailing address grouping and the explanation that passwords/payment details belong in Vault. The synthetic user could save only three values, so there is no evidence a mandatory onboarding wizard would help. Optional address fields could be disclosed later if user testing supports that choice; no action saving is claimed.

## The Simpler Version

1. Enter the small profile needed now.
2. Optionally add mailing details.
3. Save once, with feedback attached to any invalid field.

This describes a clarity proposal, not a measured action reduction. Preserve successful partial-profile saving and the visible Saved. acknowledgement.

## Clarity Issues

The observed error said Couldn't save personal info and advised checking email, birth date, and two-letter country code even though the deliberately invalid value was only the country code. It was actionable enough for successful recovery, but a Country code inline error would identify the correction more precisely. Native email validation and server-outage feedback were not exercised.

“Agent and browser worker” exposes runtime terminology where “Jory” could explain the benefit. Vault’s Contact info/Addresses are separate records; their relationship needs explanation, not an assumed automatic merge. Mobile profile uses a readable single column and requires ordinary vertical scrolling. Geometry audits reported no horizontal overflow or malformed sibling layout. Save reachability was independently confirmed in the earlier settled mobile check (y=787.58, h=32 at an 844px viewport).
