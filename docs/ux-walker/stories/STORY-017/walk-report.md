# STORY-017 — Leave history for a new chat without sending

Status: **pass for populated-history primary path**. Walked 2026-09-05 using `ux-fixed-openinstinct` at `http://localhost:3018`, designated synthetic account. Runtime is the coordinator's isolated local app with the reviewed history/task layout fixes. No application source was read or edited during this walk. Every captured PNG listed below was opened and visually inspected. Development Agentation geometry is excluded when hidden; no production conclusion follows from local checks.

## Observed walk and visual inspection

1. From the populated mobile All chats view in STORY-016, selected New chat. `/chat` displayed What’s on your mind? with an empty Message Jory composer. `mobile-new-chat.png` shows contained controls and starters wrapping by whole chip; mobile geometry clean.
2. Switched to 1280×800. `desktop-new-chat.png` shows the same empty composer and clear submit action. Geometry only flags the intentional 104/132/155px starter widths plus hidden development elements; no visible defect.
3. Selected All chats without entering or submitting text. `history-return.png` shows the same two existing conversations. Opening the blank composer did not add a third history row.

## Flow log and limits

One New chat action reached the intended composer, equal to the ideal count. Returning to history is a second verification action, not unnecessary friction. No prompt was sent in this story. Empty-history and keyboard variants were not exercised; this pass covers the populated list and responsive composer route.
