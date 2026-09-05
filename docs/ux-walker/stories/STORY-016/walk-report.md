# STORY-016 — Find and reopen a saved conversation

Status: **pass for owned synthetic history and reload**. Walked 2026-09-05 using `ux-fixed-openinstinct` at `http://localhost:3018`, designated synthetic account. Runtime is the coordinator's isolated local app with the reviewed history/task layout fixes. No application source was read or edited during this walk. Every captured PNG listed below was opened and visually inspected. Development Agentation geometry is excluded when hidden; no production conclusion follows from local checks.

## Observed walk and visual inspection

1. Selected All chats. `list.png` shows two existing designated synthetic conversations, clear titles, row usage/date and a workspace usage summary. Desktop geometry has no product spill.
2. Selected **say The first synthetic business reply arrived.**. The initial `opened.png` was captured while Next displayed Compiling and navigation had not completed. A premature reload therefore still captured history in `reloaded.png`; neither is a conversation result.
3. Selected the row again and explicitly waited for the owned `/chat/wrun_...` URL. `opened-settled.png` shows both saved user messages and their two assistant replies. The settled URL is recorded in `snapshots/owned-url.txt`.
4. Reloaded the actual conversation URL and waited for restore. `reloaded-settled.png` shows the same two user/assistant exchanges, with no missing or duplicate turn observed. This proves retention of the existing fixture, not production model generation.
5. Returned to All chats. `mobile-list.png` at 390×844 shows both rows within the content column with titles on their own line and quieter usage/date below. Geometry has zero horizontal page overflow and no product list spill. The original pre-fix history overflow is separately recorded in baseline evidence; this walk exercises the revised layout.

## Geometry and scope

Conversation geometry reported 11–12px spill associated with the optional developer Show full trace switch/fieldset. The screenshots show the label and control intact without visible collision, so this was not promoted to a user-visible layout finding. Hidden Agentation measurements are excluded. Lists are clean at both widths.

## Flow log

Core find/open goal is two actions (All chats, target row), equal to the catalog ideal. The actual audit additionally used a reload and a second row selection because its first reload interrupted local compilation. That is recorded as test-harness timing overhead, not a demonstrated extra product requirement. A subsequent settled reload and list return verified continuity. iMessage history, large/older history, and cross-account data were not tested.
