# STORY-008: Search models and dismiss

Evidence: ../../ux-walker/preflight/root-followup.md. Screenshots actually viewed: ../../ux-walker/preflight/model-no-results.png. Initial local evidence is from 2026-09-05, localhost:3000 at f11a3a1; post-fix acceptance is separate.

## Friction Scorecard

- **Verdict:** acceptable (partial search/dismiss observation).
- **Actual / ideal actions:** 3 / 3 for observed Choose → unmatched search → Escape subset. Populated catalog inspection and price comparison unmeasured.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** Query choice is necessary. No mutation, confirmation, or re-entry observed. Escape recovered from no results. Mouse/touch discovery of dismissal remains uncertain.
- Timing, user-success rates, and population-wide frequency were not measured.

## Take-away Pass

The no-results dialog is appropriately small and does not offer irrelevant controls. Keep the searchable list. A small explicit close control would make the existing Escape behavior discoverable without an extra screen.

## The Simpler Version

1. Open model chooser.
2. Search or inspect models.
3. Close without changing the setting.

No action-count reduction; propose only a visible dismissal affordance and clear current-model context.

## Clarity Issues

“No matching models.” is clear. The viewed dialog has no visible close button. A person using touch should not need to infer that tapping the backdrop dismisses it; that interaction was not tested here.

## Completed walker evidence

[STORY-008 walk](../../ux-walker/stories/STORY-008/walk-report.md) verified populated search, no-results recovery to gpt, mobile display and Escape without model mutation. Four actions versus ideal three includes one deliberate negative query, not avoidable friction. Clear-to-empty is an untested variant.
