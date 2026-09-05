# STORY-012 — Attach and remove a draft file

Status: **pass (file-input path; native picker untested)**.

Uploaded `fixtures/weekend-notes.txt` containing only synthetic weekend notes through the observed file input. `attached.png` shows its filename chip beside the paperclip. Clicking Remove weekend-notes.txt removed it without creating/sending a conversation. `removed-mobile.png` shows the clean composer at 390px with controls visible and no attachment chip. File transfer or model processing was not tested.

Geometry: no overflow or wrapped controls. Script reports attachment-tool widths 40/143px and 4px top drift plus varied starter widths; screenshot shows deliberate icon/chip differences, not malformed siblings.

Flow Log: catalog ideal 3 includes native picker open+choose+remove. Actual automated path 2 (set file input, remove); these counts are not comparable as a friction improvement. Native OS picker open and keyboard Backspace/paste variants remain untested. No unnecessary navigation or data re-entry observed.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.
