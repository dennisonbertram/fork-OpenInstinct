# STORY-024 — Reject an invalid synthetic vault import

Status: **pass for invalid-file guard and mobile footer reachability**.

Opened Logins → Bulk import. `import.png` shows export instructions, file chooser, caution, and disabled Choose a CSV. Uploaded only a header-only synthetic CSV `title,notes`. `invalid.png` shows Couldn't import this file and explains required url, username, password columns. `mobile.png` shows the same readable error at 390px. No valid credentials, password export, import mutation, or external Password Manager link was used. Logins back and Close returned to Vault.

Geometry: desktop and mobile audits reported no overflow/spill/wrapped controls after ignoring Agentation. The invalid state grows vertically, moving the footer below the visible area. A scrollintoview attempt produced `footer-mobile.png`, still showing the upper error area; the footer's complete mobile reachability was not established. No claim that it is broken or unreachable is made without further observation. The invalid file never became import-ready.

Flow Log: ideal 3 preparation actions. Actual 3 via category, Bulk import, and setting file input, plus back+close =5. Native file picker interaction is untested. One read command used unsupported syntax and did not interact with the UI; excluded from action counts. Successful import, partial rows, file-size limits, and direct import URL are untested.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.

## Settled mobile follow-up

The import footer is now verified after scrolling the actual dialog container and observing a later settled frame. `screenshots/footer-mobile-settled.png` visibly shows the disabled Choose a CSV button beneath the invalid-file error and explanatory note. Measured top/bottom: 796.16/828.16 within the 844px viewport; disabled=true. The initial unchanged scrollintoview screenshot did not establish a UI failure. The same header-only nonsecret fixture was selected again, without an import or data write. Native operating-system file-picker interaction remains untested.
