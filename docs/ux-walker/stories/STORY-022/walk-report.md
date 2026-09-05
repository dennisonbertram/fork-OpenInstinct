# STORY-022 — Save passwordless login and search metadata

Status: **pass (primary create/search; reopening variation untested)**.

Vault initially showed no saved logins. Opened Logins then Add login (`empty-add.png`), entered a synthetic label UX Reading Club, `https://example.invalid`, and synthetic email, leaving password blank. Save login returned to the list; vault.create returned 200. Searching UX Reading Club showed one row with masked account metadata (`found.png`). Searching no-such-ux-entry showed the no-matches state at 390px (`no-match-mobile.png`). Closed the dialog; later Logins 1 saved was observed when opening bulk import. No secret payload was inspected. The synthetic login remains saved.

Geometry: add-form script reports a 16px form spill corresponding to the full-width footer; screenshot shows deliberate footer alignment inside the dialog. Mobile has no spill; action widths 92/102px reflect label lengths. Development toolbar overlaps part of the lower-right action in mobile screenshot; not counted as an application layout defect.

Flow Log: ideal create 6; actual create 6 (open category, add, three fields, save), then 2 search assertions and Close = 9. The post-create no-match state is recoverable by editing query, but explicit clear-and-reopen verification was not run. Real-password handling, edit/reveal, large lists, and setup links untested.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.
