# UX Flow Critique — 2026-09-05

Completed critique of eight selected dashboard journeys, using the [journey catalog](../ux-paths/catalog.md), [walker reports](../ux-walker/latest-report.md), and [cross-cutting review](redundancy.md). All recommendations below are proposals unless explicitly marked implemented.

## Run Summary

| Metric             | Result                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Journeys critiqued | 8                                                                                                                                 |
| Evidence           | Same-day walker screenshots, baseline and focused follow-up; initial app revision f11a3a1                                         |
| Verdicts           | 2 minimal; 5 acceptable (some partial); 0 demonstrated convoluted; 1 ungraded because the first-send outcome failed               |
| Metrics            | Action counts only where logs support them; no timing study, user sample, prevalence, or measured savings beyond mobile dismissal |

A broken outcome is not evidence of a convoluted journey. The silent first chat turn remains distinct from the simplicity assessment. The completed synthetic profile walk verified validation recovery, saving, and reload. Screenshot evidence was viewed, not inferred from source.

## Friction Scorecard

| Journey                                            | Actual / ideal actions                                                    | Needless decisions or re-entry              | Dead end / friction                                                   | Verdict                             |
| -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| [001 Sign-in callback](journeys/STORY-001.md)      | 5 / 5                                                                     | None observed                               | Correct destination retained; mobile list defect separate             | Minimal                             |
| [004 Mobile navigation](journeys/STORY-004.md)     | 6 / 4 across two switches                                                 | None                                        | Extra dismissal per selection; destination hidden by sheet            | Acceptable, defect confirmed        |
| [006 Workspace readiness](journeys/STORY-006.md)   | Reading sequence unmeasured / 2                                           | Not measured                                | Member-facing screen includes admin setup detail                      | Acceptable, screen-only             |
| [008 Model search](journeys/STORY-008.md)          | 4 / 3 including intentional no-results query                              | None observed                               | Escape works; visible close control absent                            | Acceptable, observed search/dismiss |
| [011 Chat starter](journeys/STORY-011.md)          | 2 / 2 observed starter/edit subset                                        | None                                        | Draft focuses and stays unsent                                        | Minimal                             |
| [013 First reply/follow-up](journeys/STORY-013.md) | 5 actions in recovery subset / 5 ideal with different outcome             | Recovery prompt, not duplicated known input | First response absent with no visible status/error; follow-up replied | Ungraded: failed first-send outcome |
| [016 History reopen](journeys/STORY-016.md)        | 2 / 2 for core find/open; reload separate                                 | Not measured                                | Original mobile title/metadata hierarchy failed                       | Acceptable; reopen/reload verified  |
| [021 Profile save](journeys/STORY-021.md)          | 6 / 4 including 2 deliberate validation-recovery actions; reload separate | No valid-field re-entry or confirmation     | Invalid country rejected; correction saved and persisted after reload | Acceptable, observed                |

## Redundancy Map

The [cross-cutting review](redundancy.md) examined 3 duplicate-path groups, 3 repeated-information groups, 2 overlap groups, and 4 hierarchy topics. These are candidate groups, not 12 independent defects. The evidence supports these distinctions:

- Workspace WebChat, sidebar Chat and history New chat can be deliberate shortcuts into the same composer; their existence alone is not drift.
- Total usage and individual conversation usage are different scopes, though usage should remain subordinate to conversation recognition.
- Personal info and Vault include related address/contact concepts; their handling differs. Clarify the distinction before proposing a merge.
- Mobile page name and content title provide orientation; repeated headings are not automatically removable noise.

## Simplification Proposals

Priority reflects centrality and observed impact, not an invented traffic model or numerical ROI. Effort is provisional design judgment, not an implementation estimate.

1. **Make every completed chat turn visibly understandable.** The first live synthetic turn ended with only its user message and usage; a later prompt received Hi!. Diagnose the missing reply and require clear pending/completed/failed feedback before changing retry behavior. No measured step saving; avoids making the user guess what to do. Effort unknown until diagnosis. Evidence: [STORY-013](journeys/STORY-013.md), `../ux-walker/preflight/chat-result.png`, `chat-followup.png`.
2. **Dismiss mobile navigation when its destination opens.** Two switches needed six actions rather than the intended four. Closing after successful selection saves one dismissal per observed navigation. Effort S/M pending lifecycle review. Evidence: [STORY-004](journeys/STORY-004.md), `../ux-walker/preflight/mobile-nav-tasks-overlay.png` and recorded reproduction.
3. **Let conversation titles lead the history list.** Put metadata below the title on mobile and keep the card within the viewport. Implemented and visually verified: the fixed cards measure 358px within the 358px mobile content column, with metadata below the title. The browser regression also passed. See [before/after proof](../ux-walker/fixes/mobile-lists.md). No measured click saving, but recognition improves. Effort S. Evidence: [STORY-016](journeys/STORY-016.md), original `all-chats-mobile.png` and fixes report.
4. **Separate member readiness from deployment setup detail.** Keep usable channels/connection status first; disclose repeated connector-attachment instructions and infrastructure settings when relevant. No additional setup wizard. No measured step saving. Effort M. Evidence: [STORY-006](journeys/STORY-006.md), workspace desktop/mobile screenshots.
5. **Give the model chooser an obvious close control.** The no-result state is clear, but the viewed dialog only had search/content; Escape works. Preserve the three-action inspect/dismiss path and avoid accidental selection. No measured step reduction. Effort S. Evidence: [STORY-008](journeys/STORY-008.md), `model-no-results.png`.
6. **Improve stage-specific auth and profile wording.** The code form still instructs phone entry; profile “browser worker” and “Country code” require extra interpretation. Keep the authentication contract intact. The profile walk recovered successfully from an invalid country code; field-specific feedback would make the required correction more precise than the observed three-field checklist. Effort S for copy, unknown for broader profile changes. Evidence: [STORY-001](journeys/STORY-001.md), [STORY-021](journeys/STORY-021.md).

## Already Minimal

The observed sign-in/callback path performs five necessary actions and returns the user directly to the saved destination. Chat starters offer editable, focused drafts without sending prematurely. Neither needs a new screen, confirmation, or workflow redesign.

## Scope and Remaining Evidence

This critique does not claim all eight full stories passed. Some model/history variants remain outside these eight critique artifacts. Profile saving, invalid-country recovery, and rendered reload were observed using an initially empty synthetic account profile; native email and server-outage variants remain untested. Normal/error synthetic chat E2E later passed; that does not resolve the separately observed live first-send failure. The two mobile layout fixes were verified in the browser. Populated Tasks presentation used a mocked synthetic list and does not prove browser-worker execution. Seven follow-up issues were filed for four observed defects and three design proposals; see the issue table below.

## Filed follow-ups

| Issue                                                                   | Decision or defect                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [#124](https://github.com/dennisonbertram/fork-OpenInstinct/issues/124) | Reveal the selected mobile destination by closing navigation         |
| [#125](https://github.com/dennisonbertram/fork-OpenInstinct/issues/125) | Investigate first chat turn with no visible reply or failure         |
| [#126](https://github.com/dennisonbertram/fork-OpenInstinct/issues/126) | Make authenticated 404 text readable under a dark browser preference |
| [#127](https://github.com/dennisonbertram/fork-OpenInstinct/issues/127) | Simplify member-facing workspace setup information                   |
| [#128](https://github.com/dennisonbertram/fork-OpenInstinct/issues/128) | Use consistent browser-task history naming                           |
| [#129](https://github.com/dennisonbertram/fork-OpenInstinct/issues/129) | Explain Personal info versus protected Vault address/contact entries |
| [#130](https://github.com/dennisonbertram/fork-OpenInstinct/issues/130) | Recover after Stop before accepting a follow-up                      |

The model chooser close affordance and stage-specific wording remain lower-priority report suggestions. They are not treated as measured user failures.
