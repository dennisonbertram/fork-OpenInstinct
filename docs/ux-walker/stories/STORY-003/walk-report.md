# STORY-003 — Find chat and return home

Status: **pass**.

Workspace WebChat opened `/chat`; after settling, `chat-settled.png` shows What’s on your mind?, Message Jory, attachment and Submit controls. Jory returned to `/`. Sidebar Chat also reached `/chat`, and Workspace returned home. `home-settled.png` shows the unchanged Workspace. Earlier `webchat.png` and `home.png` captured loading skeletons and are retained; they are not presented as completed screens. Repeated route checks allowed transitions to finish before reading URLs.

Geometry: Workspace clean; chat reports unequal starter widths (104/132/155px) reflecting different label lengths, not a visual defect. No spill or wrapped controls. Shared mobile composer evidence is STORY-012/removed-mobile.png, showing readable layout and wrapped starter group without clipped labels.

Flow Log: ideal 2, core actual 2 (WebChat, Jory). Sidebar alternate adds 2 deliberate verification actions. Initial rapid navigation checks hit transitional states and were repeated after settling; these are operator timing, not proven product detours. WebChat/Chat and Jory/Workspace are confirmed duplicate routes. No send occurred.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.
