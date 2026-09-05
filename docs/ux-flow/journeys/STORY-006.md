# STORY-006: Understand workspace readiness

Evidence: ../../ux-walker/preflight/baseline.md. Screenshots actually viewed: ../../ux-walker/preflight/screenshots/workspace-desktop.png, ../../ux-walker/preflight/screenshots/workspace-mobile.png. Initial local evidence is from 2026-09-05, localhost:3000 at f11a3a1; post-fix acceptance is separate.

## Friction Scorecard

- **Verdict:** acceptable (read-only screen critique).
- **Actual / ideal actions:** Full reading/action count unmeasured / catalog ideal 2. One navigation to the consolidated page observed.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** No setup decision was completed. Disabled iMessage and admin-only connections are stated explicitly; no failed Connect interaction was induced. The member cannot complete admin setup from this screen, but that prerequisite is not itself a convoluted flow.
- Timing, user-success rates, and population-wide frequency were not measured.

## Take-away Pass

Keep channel readiness and concise connection status. Defer deployment-specific connector attachment prose and infrastructure/model controls for members who only want to start using Jory. Preserve admin access to those details through disclosure rather than deleting required configuration.

## The Simpler Version

1. Open Workspace and see what is usable now.
2. Choose WebChat to start, or expand a service’s setup details when responsible for configuration.

Proposal changes information priority, not a measured saving in clicks.

## Clarity Issues

“Linq,” “Kernel browser,” “Vercel Blob,” and “AI Gateway model” require platform knowledge. “A deployment admin must attach … in Vercel Connect” repeats for two services. The visible Connected badges are not independent service-health verification.
