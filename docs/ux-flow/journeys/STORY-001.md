# STORY-001: Sign in and resume a saved destination

Evidence: ../../ux-walker/stories/STORY-001/walk-report.md. Screenshots actually viewed: ../../ux-walker/stories/STORY-001/screenshots/01-signin.png, ../../ux-walker/stories/STORY-001/screenshots/02-code.png, ../../ux-walker/stories/STORY-001/screenshots/03-history.png. Initial local evidence is from 2026-09-05, localhost:3000 at f11a3a1; post-fix acceptance is separate.

## Friction Scorecard

- **Verdict:** minimal (authentication path).
- **Actual / ideal actions:** 5 / 5; measured by STORY-001 walker. Reload/resize excluded.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** Phone identity and code are necessary inputs. No needless decisions, re-entry, confirmation, or callback detour observed.
- Timing, user-success rates, and population-wide frequency were not measured.

## Take-away Pass

The two form states each have one navy primary action. Keep the different-number escape hatch and local bypass notice. The mascot is optional decoration but does not displace the form at the observed desktop size.

## The Simpler Version

1. Open the intended destination.
2. Enter phone and request the code.
3. Enter the code and verify; return directly to the saved destination.

These grouped steps contain the same five measured actions; no step reduction proposed.

## Clarity Issues

Verification state still says “Enter your phone number to request a sign-in code” above a Verification Code field. Change the instruction to match the current step; retain the actual auth flow. Mobile history layout failure belongs to STORY-016, not authentication complexity.
