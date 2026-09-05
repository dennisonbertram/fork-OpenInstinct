# History and task review

Five source-derived stories, generated 2026-09-05. Expected results are catalog requirements for later browser verification, not observations. Use owned designated synthetic conversations and traces only. This topic never sends a message or starts a browser assignment to manufacture history. Paths below are relative to `src/app/(authenticated)/`.

## STORY-016: Find and reopen a saved conversation

<a id="story-016"></a>

**Provisional ID**: HISTORY-01

**Type**: medium
**Topic**: History and task review
**Persona**: Maya, returning to an earlier planning conversation.
**Goal**: Find the correct chat and read its saved messages after a reload.
**Preconditions**: Signed-in synthetic account with at least one known owned chat containing designated test messages; know that chat's visible title without inspecting unrelated records.
**Ideal path**: 2 — open All chats and choose the intended conversation.
**Alternate paths**: A known owned `/chat/[sessionId]` deep link opens the same conversation. Browser history can revisit that URL. Sidebar Chat creates a new-chat surface and is not an equivalent saved-chat route.
**Sources**: `chat/history/page.tsx`, `chat/[sessionId]/page.tsx`, `chat/[sessionId]/_components/use-session-agent.ts`, `chat/[sessionId]/_components/conversation/index.tsx`.

### Steps

1. Select **All chats** → `/chat/history` shows **Every conversation in this workspace · Usage** followed by a formatted total.
2. Locate the known synthetic conversation → its row shows a title, formatted usage, and date.
3. Select that row → navigate to the owned `/chat/[sessionId]`; wait for recent messages to load.
4. Read the known test messages → confirm the intended saved conversation is present without sending a follow-up.
5. Reload the page → the same session URL rehydrates its saved conversation rather than opening a new chat.
6. Select **All chats** → return to the list and find the same conversation.

### Variations

- A designated owned Linq conversation may appear as **iMessage** with **Main thread** rather than its stored title; follow only synthetic history.
- Desktop and narrow mobile widths: verify title, usage, and date can be understood and the row remains usable.
- Keyboard-only: reach and activate the saved-chat link.

### Edge Cases

- Usage appears both as a workspace total and per-chat value; they have different scopes and should not be mistaken for duplicate charges.
- A long title is truncated in source styling; evaluate whether the user can still identify the conversation.
- History request failure or prolonged **Loading recent messages**: record the actual failure; do not count an empty viewport as an empty conversation.

## STORY-017: Leave history for a new chat without sending

<a id="story-017"></a>

**Provisional ID**: HISTORY-02

**Type**: short
**Topic**: History and task review
**Persona**: Rafael, who wants a separate conversation for a new question.
**Goal**: Discover the new-chat entry point from history.
**Preconditions**: Signed in, viewing `/chat/history`; either an empty or populated list is acceptable. No message submission is needed.
**Ideal path**: 1 — choose New chat from the history page.
**Alternate paths**: Sidebar **Chat**, Workspace **WebChat**, Tasks **Open chat**, or direct `/chat` all reach the same new-chat surface.
**Sources**: `chat/history/page.tsx`, `chat/(new)/_components/new-chat.tsx`, `_components/authenticated-navigation.tsx`, `(workspace)/_components/channels-section.tsx`, `tasks/(overview)/page.tsx`.

### Steps

1. Inspect **All chats** → populated rows are shown, or an alert says **No chats yet.**.
2. Select **New chat** → navigate to `/chat` with **What’s on your mind?** and **Message Jory**.
3. Select **All chats** without sending → return to history; merely opening the composer should not create a sent conversation.

### Variations

- Empty account: verify **New chat** is available alongside **No chats yet.**.
- Populated account: a new-chat action should be distinguishable from reopening a row.
- Mobile: ensure the page title and **New chat** control remain discoverable together.

### Edge Cases

- The composer may contain an unsent local draft from another interaction; do not submit or infer durable chat creation from that draft.
- Different labels reach the same route; record redundancy and its usefulness rather than inventing different chat modes.

## STORY-018: Understand an empty browser-task history and refresh it

<a id="story-018"></a>

**Provisional ID**: HISTORY-03

**Type**: short
**Topic**: History and task review
**Persona**: Maya, checking whether Jory has performed any browser assignments.
**Goal**: Understand an empty task list and locate the way to ask for work.
**Preconditions**: Signed-in synthetic workspace with no browser trace records.
**Ideal path**: 2 — open Tasks and follow the empty state's route to chat if needed.
**Alternate paths**: Direct `/tasks` reaches this history. Sidebar **Chat** or Workspace **WebChat** reaches the same new-chat screen as **Open chat**.
**Sources**: `tasks/(overview)/page.tsx`, `tasks/(overview)/_components/trace-history.tsx`.

### Steps

1. Select **Tasks** → `/tasks` displays the heading **Browser traces** and explains assignments, verified outcomes, time, and domains.
2. Wait for loading to settle → the table shows **No browser traces yet. Give the agent a browser task from the chat.**.
3. Select **Refresh** → the control disables during fetching; an empty fetch may show **Loading browser traces…** before returning to the empty state.
4. Select **Open chat** → navigate to `/chat`; stop before sending a browser assignment.

### Variations

- Mobile: inspect readability of the table headers **Task**, **Status**, **Duration**, **Domains**, **Result**, **Started**, even when there are no rows.
- Keyboard-only: reach Refresh and Open chat in an understandable order.

### Edge Cases

- Failed fetch: a destructive alert may coexist with the empty table. An error is not proof that no assignments exist.
- A trace appears during refresh from other authorized test activity: continue under the populated-history story; do not force the account back to empty.
- The sidebar says Tasks but the page says Browser traces; assess whether the description explains the difference.

## STORY-019: Recover from a missing browser trace

<a id="story-019"></a>

**Provisional ID**: HISTORY-04

**Type**: short
**Topic**: History and task review
**Persona**: Rafael, reopening a bookmarked trace that is no longer available.
**Goal**: Recognize that the trace cannot be shown and return to usable navigation.
**Preconditions**: Signed in; `/tasks/audit-nonexistent-trace-2099` is a known synthetic nonexistent identifier, not a guessed identifier belonging to another user.
**Ideal path**: 2 — open the unavailable link and return to the task list.
**Alternate paths**: Direct `/tasks` or the browser Back action returns to the list; the sidebar **Tasks** is usable if the not-found presentation retains the authenticated shell.
**Sources**: `tasks/[sessionId]/page.tsx` calls `notFound()` when `readBrowserTrace(scope, sessionId)` yields no record; `_components/authenticated-navigation.tsx`; `src/db/services/browser-traces.ts`.

### Steps

1. Open `/tasks/audit-nonexistent-trace-2099` → the route presents not-found behavior rather than a trace belonging to someone else. Exact framework-generated copy is not specified by this source.
2. Inspect available navigation → use sidebar **Tasks** if present; otherwise use browser Back or open `/tasks` directly.
3. Confirm `/tasks` renders the owned trace list or its empty state → the missing bookmark does not prevent further dashboard use.

### Variations

- Expired authentication is an access-navigation branch; record sign-in redirection separately from a missing owned trace.
- Mobile: check whether a retained shell provides a discoverable sidebar trigger on the not-found screen.

### Edge Cases

- A database or server error differs from `notFound()`; record its actual presentation instead of labeling every failure a missing record.
- Do not probe arbitrary account/session identifiers to manufacture authorization test data.

## STORY-020: Review a completed assignment and its conversation context

<a id="story-020"></a>

**Provisional ID**: HISTORY-05

**Type**: medium
**Topic**: History and task review
**Persona**: Maya, checking the result and timing of a previous browser assignment.
**Goal**: Follow a known synthetic assignment from the history summary into its detailed events, then inspect associated conversation history separately.
**Preconditions**: An owned designated synthetic browser trace and its known parent chat already exist. Older-trace/message pagination requires sufficiently large fixtures. If no trace fixture exists, this story is blocked; do not launch a real browser job to satisfy it.
**Ideal path**: 3 — open Tasks, choose the assignment, and read its details; conversation context is a separate deliberate check.
**Alternate paths**: Known owned `/tasks/[sessionId]` deep link opens the same trace. Developer-enabled chat activity may show assignment summaries, but is conditional and is not the same event-table route. The detail page does not provide a direct parent-conversation link in the mapped source.
**Sources**: `tasks/(overview)/_components/trace-history.tsx`, `tasks/[sessionId]/page.tsx`, `tasks/[sessionId]/_components/refresh-button.tsx`, `chat/history/page.tsx`, `chat/[sessionId]/_components/conversation/index.tsx`, `chat/[sessionId]/_components/activity/index.tsx`.

### Steps

1. Select **Tasks** → locate the known synthetic assignment by its visible task text.
2. Read its **Status**, **Duration**, **Domains**, **Result**, and **Started** → compare the summary with the fixture's known outcome; do not infer a successful browser action from an unrelated badge.
3. If **Load older traces** appears and the target is older, select it → more rows load; loaded/succeeded counters describe the currently loaded collection.
4. Select the assignment's task link → `/tasks/[sessionId]` displays task title, outcome badge, timing, any result message, and activity-duration breakdown.
5. Inspect **Trace events** → read **Time**, **Event**, and **Detail**, or **No events recorded for this trace.** if the fixture has no events.
6. Select **Refresh** → a pending control state precedes the refreshed detail; previously completed data remains understandable.
7. Select **All traces** → return to `/tasks`.
8. Select **All chats** and open the known parent conversation → inspect the relevant synthetic exchange. This deliberately records the extra navigation because no parent-chat shortcut exists on the trace page.
9. If **Load older messages** appears, select it → it shows **Loading…** while fetching and reveals the older conversation segment needed for context.

### Variations

- Running, Failed, Error, Cancelled, and Succeeded fixtures exercise distinct displayed status labels.
- With developer activity enabled, compare the chat activity summary with the trace list/detail. These repeated facts may serve different purposes; do not count the optional developer panel as universally visible.
- Long task/result/domain strings: inspect truncation and desktop title hints, then assess mobile access to the same information.

### Edge Cases

- Null duration shows an em dash in the list and **Duration unavailable** on detail; these are absence markers, not zero elapsed time.
- No domains or result: the list shows an em dash; detail omits absent supplemental values.
- No older-page cursor means no **Load older traces** control; no older messages means no corresponding chat control.
- Missing populated fixtures limit the audit to empty, missing, and history navigation branches; do not report this complete story as passed.
