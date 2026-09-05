# STORY-007 — Start a web conversation from Workspace

Status: **pass**.

Shared observed route walk with STORY-003: WebChat on Workspace reached `/chat` and the settled composer exposed Message Jory without requiring Google/Square setup. Sidebar Chat reached the same route. Evidence: `../STORY-003/screenshots/chat-settled.png`, `home-settled.png`, and STORY-012's mobile composer. The composer accepted the safe file attachment in STORY-012, providing interaction evidence beyond a static route.

Geometry: same clean route surfaces as STORY-003, with intentional variable-width starter chips. No additional screenshots were taken solely to duplicate the same evidence.

Flow Log: ideal 1, actual core 1 (WebChat). Returning through Workspace and sidebar Chat adds 2 alternate-path checks, not friction. No prompt sent. Keyboard-only and navigation-away draft retention were not tested.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.
