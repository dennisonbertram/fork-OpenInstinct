# STORY-004: Navigate on mobile

Evidence: ../../ux-walker/preflight/root-followup.md. Screenshots actually viewed: ../../ux-walker/preflight/mobile-nav-tasks-overlay.png, ../../ux-walker/preflight/screenshots/tasks-mobile.png. Initial local evidence is from 2026-09-05, localhost:3000 at f11a3a1; post-fix acceptance is separate.

## Friction Scorecard

- **Verdict:** acceptable, with confirmed extra dismissal.
- **Actual / ideal actions:** 6 / 4 for two destination switches, derived from two observed open/select/dismiss sequences.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** Each destination selection is necessary. One needless dismissal per selection; no data re-entry or confirmation. The remaining sheet hides the selected page and creates hesitation even though the URL changes.
- Timing, user-success rates, and population-wide frequency were not measured.

## Take-away Pass

Keep the navigation sheet and selected-item treatment. Remove the need to dismiss the sheet after a successful destination selection. Do not replace navigation with an additional hub.

## The Simpler Version

1. Open navigation and choose All chats; reveal its page.
2. Open navigation and choose Tasks; reveal its page.

Four actions rather than six across these two switches; close the sheet after navigation succeeds.

## Clarity Issues

Tasks leads to a Browser traces heading. Use consistent destination terminology; this is separate from the dismissal behavior. The observed workaround was Escape, which is less discoverable on touch devices.
