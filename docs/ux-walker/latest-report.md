# UX Walker Report — 2026-09-05

The audit documents all 30 catalog stories. Two mobile layout defects were fixed and visually rechecked. Five stories still have observed failures; partial and unavailable journeys remain explicitly incomplete.

## Run Summary

| Measure                           | Result                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| Primary-path passes               | 15                                                                  |
| Partial journeys                  | 2                                                                   |
| Failed journeys                   | 5                                                                   |
| Blocked journeys                  | 8                                                                   |
| Browser-evidenced stories         | 22 (shared evidence is identified, not counted as independent runs) |
| Catalog/report coverage           | 30 story reports; no previous-pass skips                            |
| Unique observed findings          | 8; two resolved layout findings                                     |
| Duration and population pass rate | Not measured; no percentage claimed                                 |

“Pass” covers the stated primary sequence, not every variation. Unavailable OAuth, admin, messaging, approval and browser-worker fixtures are not passes. Native file selection differs from directly populating a file input. Original failures and follow-up outcomes remain separate in each report and `run-history.json`.

## Provenance

Initial walks: localhost:3000, base `f11a3a1d7b93fad16f2c61a4ae7751b5a1672675`. Post-fix walks: isolated localhost:3018, same base plus the two history/task layout patches in [mobile-lists.md](fixes/mobile-lists.md). Desktop 1280×800 and mobile 390×844; designated synthetic local accounts only. No deployment or production-readiness claim follows from this local evidence.

## Findings Summary

| Severity   | Unique findings | Resolved |
| ---------- | --------------- | -------- |
| Critical   | 0               | 0        |
| High       | 3               | 0        |
| Medium     | 3               | 2        |
| Low        | 2               | 0        |
| Suggestion | 0               | 0        |

Categories: layout 2, error-handling 2, flow 1, happy-path 1, consistency 1, accessibility 1. These derive from eight unique IDs. History overflow is one finding (F-001-001), including its STORY-016 follow-up. The shared 404 finding (F-019-001) affects STORY-019/026 and is counted once. Design proposals in ux-flow are not added as observed findings.

| ID        | Finding                                                                                  | Disposition                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| F-001-001 | Mobile history row overflow                                                              | Resolved by title/metadata stacking and containment; fixed list plus owned reopen/reload inspected in STORY-016 |
| F-002-001 | Incorrect-code advice requests a new code while reset action says Use a different number | Low warning, unresolved; corrected code worked                                                                  |
| F-004-001 | Mobile navigation sheet stays open after destination selection                           | Unresolved; issue #124                                                                                          |
| F-013-001 | First turn settles without visible reply/error                                           | Unresolved; issue #125; later reply does not erase first-turn failure                                           |
| F-014-001 | After Stop attempt, follow-up clears without appearing or receiving response             | Unresolved; issue #130; later POST 409 metadata; cancellation acceptance/cause unknown                          |
| F-018-001 | Mobile Tasks headings overlap and guidance clips                                         | Resolved; empty/refresh/open-chat walkthrough plus separately mocked populated list                             |
| F-018-002 | Tasks navigation/page heading Browser traces mismatch                                    | Low warning; naming proposal issue #128                                                                         |
| F-019-001 | White 404 text on cream shell under dark preference                                      | Unresolved across missing/denied routes; issue #126; exclusion itself worked                                    |

## Fixes and Verification

History cards now fit mobile content with title above secondary metadata. Tasks empty/loading guidance wraps outside the table; populated tables retain minimum readable width inside their horizontal container. Only the two owning layout sources changed, with regression assertions and design documentation.

The reporting agent viewed the final multiline draft screenshots for STORY-011, the fixed history and Tasks screenshots, the STORY-016 mobile list and saved-reply reload, and the populated-list start/end images. The original history failure in STORY-001 is preserved; its layout issue is resolved by the separate STORY-016 rewalk. Tasks originally lacked full Refresh/Open chat evidence; STORY-018's final appended walkthrough supplies Refresh 200 and navigation to the blank composer, so its primary sequence now passes with the naming warning.

- `pnpm build`: passed with synthetic CI configuration.
- `pnpm check`: coordinator reports all gates passed, including 1,070 tests before the final test-selector correction; the six-test E2E rerun passed afterward.
- Relevant configured E2E: **6 passed (32.6s)**. An earlier six-test attempt had five pass and one strict-locator failure because hidden duplicate guidance matched; the selector was scoped to the visible Browser trace history region, then all six passed. No application behavior changed for that correction. Runner resources shut down cleanly.
- Populated Tasks: standalone Playwright assertions passed at 390×844, with only `traces.list` mocked to one synthetic BrowserTracePage. Header content fits; container scroll reaches Started; no page overflow. This proves list presentation, not browser-worker execution.

Evidence: [fix report](fixes/mobile-lists.md), [history mobile](fixes/screenshots/history-mobile-after.png), [Tasks empty](fixes/screenshots/tasks-mobile-after.png), [populated table after horizontal scroll](fixes/screenshots/tasks-populated-mobile-after.png). Application-owned names, routes, scope checks and data mutations were preserved.

## Issues Filed

See the authoritative [issues log](issues-filed.md) for fork-owned URLs and final issue count. Seven fork issues were filed: 124 mobile navigation, 125 silent first turn, 126 404 contrast, and 130 failed/stop-attempted follow-up recovery are observed failures; 127 workspace setup, 128 task naming, 129 Personal info/Vault distinction are design proposals.

## UX Patterns and Flow

Direct routes generally remain short: auth callback 5/5 necessary actions; Workspace→Chat→home 2/2; owned history opening 2/2; New chat 1/1. Mobile navigation requires 6 actions for two transitions that should require 4, due to the additional dismissal. Intentional invalid-input checks and audit reloads are not extra product friction. Counts are not averaged across users.

The original two mobile list defects shared a practical problem: metadata/table sizing took room from the content the user needed. Their fixes preserve existing controls. More serious unresolved concerns are clear chat completion/recovery feedback and readable excluded/missing-route screens. Hidden Agentation geometry, intentional unequal starter widths, and development overlay overlap are excluded from product finding counts. Broader simplification proposals are in [UX flow](../ux-flow/report.md).

## Top Five Next Actions

1. Diagnose the first-turn and same-session recovery failures using their concrete screenshots/status metadata; do not assume credits or a particular cancellation race.
2. Close mobile navigation after successful selection and verify focus and destination visibility.
3. Make 404 feedback readable under light/dark browser preferences while retaining correct exclusion.
4. Clarify error recovery and customer-facing task/setup terminology; preserve necessary auth controls.
5. Establish explicit isolated fixtures for approvals, enabled messaging, populated worker traces and admin journeys before calling those paths verified.

## Story Results

| Story                                         | Final primary status | Evidence scope                                                                                                                                     |
| --------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [STORY-001](stories/STORY-001/walk-report.md) | pass                 | Auth/callback passed originally; original mobile list failure resolved by separate post-fix history walk (016).                                    |
| [STORY-002](stories/STORY-002/walk-report.md) | pass                 | Wrong code rejected; corrected code succeeds; low recovery-copy warning.                                                                           |
| [STORY-003](stories/STORY-003/walk-report.md) | pass                 | WebChat/Jory and sidebar alternative observed.                                                                                                     |
| [STORY-004](stories/STORY-004/walk-report.md) | fail                 | Destination changes but sheet remains; extra dismissal.                                                                                            |
| [STORY-005](stories/STORY-005/walk-report.md) | pass                 | Sign-out and fresh protected request passed.                                                                                                       |
| [STORY-006](stories/STORY-006/walk-report.md) | pass                 | Unavailable setup-state primary path only; badges do not prove service health.                                                                     |
| [STORY-007](stories/STORY-007/walk-report.md) | pass                 | Workspace opens composer without connector setup.                                                                                                  |
| [STORY-008](stories/STORY-008/walk-report.md) | pass                 | Populated model search, no-results, matching query and Escape; no setting change.                                                                  |
| [STORY-009](stories/STORY-009/walk-report.md) | partial              | Direct callback-banner presentation only; real OAuth/grants/disconnect blocked.                                                                    |
| [STORY-010](stories/STORY-010/walk-report.md) | blocked              | Disabled iMessage visible; no configured test-line handoff.                                                                                        |
| [STORY-011](stories/STORY-011/walk-report.md) | pass                 | Initially partial; final draft-only walkthrough verified focused starter, actual multiline edit, and unsent /chat endpoint at both viewport sizes. |
| [STORY-012](stories/STORY-012/walk-report.md) | partial              | File input/remove observed; native picker primary interaction unverified.                                                                          |
| [STORY-013](stories/STORY-013/walk-report.md) | fail                 | First turn has no answer/error; follow-up replies; original failure unresolved.                                                                    |
| [STORY-014](stories/STORY-014/walk-report.md) | fail                 | Stop attempted; subsequent short follow-up clears without delivery; POST 409 observed; cancellation acceptance unknown.                            |
| [STORY-015](stories/STORY-015/walk-report.md) | blocked              | No existing pending structured question/approval fixture.                                                                                          |
| [STORY-016](stories/STORY-016/walk-report.md) | pass                 | Owned synthetic history reopened and reloaded; fixed mobile list inspected.                                                                        |
| [STORY-017](stories/STORY-017/walk-report.md) | pass                 | New chat opens blank composer and adds no history row without send.                                                                                |
| [STORY-018](stories/STORY-018/walk-report.md) | pass                 | Original partial/failed mobile layout; final Refresh 200, readable empty state and Open chat verified; naming warning remains.                     |
| [STORY-019](stories/STORY-019/walk-report.md) | fail                 | Missing trace excluded; shared 404 white-on-cream readability failure.                                                                             |
| [STORY-020](stories/STORY-020/walk-report.md) | blocked              | No owned populated real browser-trace/context fixture; mocked list is not runtime proof.                                                           |
| [STORY-021](stories/STORY-021/walk-report.md) | pass                 | Invalid country rejected; synthetic values saved and retained after reload.                                                                        |
| [STORY-022](stories/STORY-022/walk-report.md) | pass                 | Passwordless synthetic login created; matching/nonmatching search; reopening variant untested.                                                     |
| [STORY-023](stories/STORY-023/walk-report.md) | pass                 | Empty category validation/cancel and lower card mobile Save reachability; address/contact lower mobile variants untested.                          |
| [STORY-024](stories/STORY-024/walk-report.md) | pass                 | Header-only invalid CSV rejected; mobile footer reachable; successful import/native picker untested.                                               |
| [STORY-025](stories/STORY-025/walk-report.md) | blocked              | No exact disposable Contact info deletion fixture.                                                                                                 |
| [STORY-026](stories/STORY-026/walk-report.md) | fail                 | Non-admin route excluded; shared 404 readability failure.                                                                                          |
| [STORY-027](stories/STORY-027/walk-report.md) | blocked              | No isolated designated admin overview fixture.                                                                                                     |
| [STORY-028](stories/STORY-028/walk-report.md) | blocked              | No isolated admin lifecycle fixture; no mutation.                                                                                                  |
| [STORY-029](stories/STORY-029/walk-report.md) | blocked              | No isolated admin audit fixture.                                                                                                                   |
| [STORY-030](stories/STORY-030/walk-report.md) | blocked              | No isolated admin webhook records; no outbound drain.                                                                                              |

## Outstanding and Test Data

Failed: 004 navigation; 013 first response; 014 failed/stop-attempt recovery; 019/026 shared 404 readability. Partial: 009 callback banner without OAuth, 012 file-input path without native picker. Blocked: 010 enabled iMessage; 015 structured question/approval; 020 populated worker trace/context; 025 exact disposable deletion fixture; 027–030 isolated admin surfaces.

The main local synthetic account retains the explicitly recorded test profile and passwordless synthetic login, plus synthetic chat turns; no real secrets or external messages were used. Fixture details and untested variants remain in their owning reports. No bulk import, card save, admin lifecycle change, webhook drain, or protected-record access was performed merely to improve coverage.

Independent source/test review by another agent found no blocking issues; the author also performed a separate self-review. These reviews do not promote untested runtime branches.
