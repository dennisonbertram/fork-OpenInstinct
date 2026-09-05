# STORY-004 — Navigate the dashboard on a narrow screen

Status: **fail**. Evidence captured by the coordinator/baseline walker on 2026-09-05 at `http://localhost:3000`, source `f11a3a1`, designated synthetic local account. This report consolidates those observations; its author did not perform a new browser run. All linked decisive PNGs were opened and visually inspected.

## Observed walk

1. From Personal info on a 390×844 viewport, opened Toggle Sidebar and selected All chats. The route changed to `/chat/history` and All chats became active, but the sheet continued covering the page (`all-chats-overlay.png`).
2. Repeated from All chats to Tasks. After two seconds of settling, `/tasks` and active Tasks were selected but the sheet still covered the destination (`tasks-overlay.png`).
3. Escape revealed the destination. `videos/mobile-navigation.webm` records the successful reproduction. The coordinator noted a stale-ref attempt after recording reset before the successful sequence; it is not additional product evidence.

## Flow log and limits

Ideal catalog path: four actions for two transitions (open menu, select destination, twice). The recorded transitions each required one additional dismissal. This confirms two extra dismissal actions across these two route transitions, not a measured average across the app. Screenshot/sequence evidence establishes a navigation-state defect. No geometry measurements are invented for the sheet.

Source evidence: `../../preflight/root-followup.md`. Other mobile keyboard/focus and all-destination variations remain untested.
