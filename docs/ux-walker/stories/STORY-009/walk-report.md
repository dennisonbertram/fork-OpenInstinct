# STORY-009 — Inspect connector actions and recover from an unavailable return

Status: **pass for callback-banner presentation; live OAuth branches blocked**. Walked 2026-09-05 using `ux-fixed-openinstinct` at `http://localhost:3018`, designated synthetic account. Runtime is the coordinator's isolated local app with the reviewed history/task layout fixes. No application source was read or edited during this walk. Every captured PNG listed below was opened and visually inspected. Development Agentation geometry is excluded when hidden; no production conclusion follows from local checks.

## Observed walk and visual inspection

1. Opened `/?square=unavailable`. `square.png` shows a clear Square unavailable banner above the ordinary workspace sections. Both Google/Square remain Admin setup needed. Geometry: no page overflow, uneven rows, spills or wrapped controls.
2. Opened `/?google=unavailable` at 390×844. `google-mobile.png` shows readable Google Workspace unavailable copy with the normal channel controls beneath it. Geometry clean; setup descriptions wrap narrowly but remain contained.
3. Selected Workspace on desktop and waited for navigation to settle. URL became `/`; `cleared-settled.png` shows the banner gone while service states remain unchanged. `cleared.png` is an earlier immediate capture before the navigation settled and still shows the Square banner; it is not a failure or final-state artifact.
4. Reopened the Google banner state and selected WebChat. URL became `/chat`; `chat-after-banner.png` shows the blank composer and starters. Geometry has intentional starter widths 104/132/155px, with no product spill; differing label widths are not a consistency defect.

## Flow log and limits

No OAuth call or account grant was performed: direct query URLs test presentation only. Once viewing the unavailable banner, WebChat required one selection to reach the composer; clearing the banner required one Workspace selection. The catalog's two-action benchmark is about reaching state/feedback, not all extra banner variants in this audit.

Initial screenshot saves used a relative path that the persistent browser daemon resolved elsewhere and failed; absolute output paths fixed artifact capture. An initial sidebar click was attempted while the browser was still mobile with its sheet closed, and was correctly rejected as covered. Explicit desktop viewport and a fresh snapshot resolved that test setup issue. No product defect is inferred from either automation problem. External configured/connected success and Disconnect remain blocked by missing test grants.
