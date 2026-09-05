# STORY-021 — Save and validate synthetic personal information

Status: **pass**.

The initial profile fields were empty in the rendered snapshot. Entered Alex, alex.ux@example.com, and invalid Country code `1!`; Save personal info showed Couldn't save personal info with the country/email/date advice (`invalid.png`). Corrected to US and saved: `saved.png` shows Saved. Reload retained Alex/email/US, confirmed from the rendered inputs; `reloaded-mobile.png` shows the mobile fields with normal vertical flow. Update returned 200. Only synthetic profile fields were changed and left saved.

Geometry: desktop error and mobile profile clean, zero horizontal overflow. The form extends vertically, so lower fields/save require scrolling; this is not a broken container. Screenshots show consistent two-column desktop and single-column mobile fields.

Flow Log: happy-path ideal 4. Actual 6 input/control actions including intentional invalid-country rejection and correction, plus 1 reload verification. Difference comes from the planned negative case, not redundant user work. Shared error wording doesn't identify only the invalid field, but the observed message explicitly mentions country code and recovery succeeded. No server-outage or Saved-after-edit persistence variant tested.

All listed screenshots were opened and visually inspected. Walk date: 2026-09-05. Browser: `ux-walker-openinstinct`, http://localhost:3000; desktop 1280×800 and mobile 390×844. No application source was read during the walk. Only designated synthetic account data was used. Invisible Agentation panels are excluded from geometry conclusions. Batch JavaScript errors were empty. Status-only network evidence is in `../STORY-024/snapshots/batch-network.txt`; it contains earlier shared-session requests too and is not a count of this story's actions. No network bodies or vault plaintext were captured.
