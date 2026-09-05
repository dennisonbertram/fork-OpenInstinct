# STORY-008 — Search model catalog without changing model

Status: **pass**.

Choose opened the populated model catalog (`chooser.png`). Searching `no-such-model-ux` showed No matching models (`no-results.png`); replacing it with `gpt` restored a populated filtered list (`results.png`). Mobile results fit 390px with readable prices and names (`mobile.png`); geometry clean. Escape dismissed the dialog. Workspace still displayed `openai/gpt-5.6-sol-fast` afterward (STORY-003/home-settled.png), and no model-update request appears in the batch network log. Models list returned 200.

Flow Log: ideal 3; actual 4 (open, nonexistent query, matching query, Escape), with one additional intentional no-results assertion. The catalog sequence's clear-to-empty variant was not performed; recovery to a matching query was observed instead. No model selection occurred. A CSS wait timed out despite the role control becoming available; role-based click then worked. No visible close button exists in the screenshot, but Escape completed the requested flow; log as a potential discoverability concern rather than measured user hesitation.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.
