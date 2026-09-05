# Chat creation and continuation stories

These stories are code-derived catalog entries, cross-checked against `discovery.md`; they are not observed passes. Use the designated synthetic local account. Prompts and files below are proposed synthetic test data. A healthy agent runtime is required for actual message execution, and model-produced questions, approvals, and authorizations cannot be assumed to appear on demand. The composer arrow's actual accessible label is `Submit`, although discovery describes its function as Send.

Action counts count field entry, control activation, and route navigation separately; passive inspection is not an action.

## STORY-011: Turn a starter into a specific draft

<a id="story-011"></a>

**Provisional ID**: CHAT-01

**Type**: short
**Topic**: Chat creation and continuation
**Persona**: A new user who needs a starting point for planning.
**Goal**: Prepare an editable, specific prompt without sending it prematurely.
**Preconditions**: Authenticated synthetic account at `/chat`; no active conversation.
**Ideal path**: 2 — Choose a starter and edit the resulting draft.
**Alternate paths**: Enter the entire draft directly in `Message Jory`. Other starter buttons are `Explore` and `Think it through`; each fills a different draft.

### Steps

1. Choose `Make a plan` below `What’s on your mind?` → `Message Jory` receives `Help me plan my day and decide what to tackle first.` and focus moves to the textarea.
2. Edit it to `Help me plan a quiet Saturday with a morning walk and two hours of reading.` → the edit remains a draft; no session should be created by choosing a starter alone.
3. Use Shift+Enter to add `Keep the afternoon free.` on a new line → verify multiline editing without sending.
4. Leave the draft unsent → verify this review did not request agent work.

### Variations

- `Explore` fills `Help me research a topic and compare the best options.`
- `Think it through` fills `Help me turn an idea into a clear, actionable plan.`
- Navigate to `/chat` using Workspace `WebChat`, sidebar `Chat`, or history `New chat`.

### Edge Cases

- Choosing another starter replaces the existing text rather than appending; examine whether this is surprising after a user has written a detailed draft.
- Enter submits, while Shift+Enter adds a line; composition input has a guard against premature Enter submission.
- Draft persistence across navigation/reload is not promised by this component.

**Sources**: `src/app/(authenticated)/chat/(new)/_components/new-chat.tsx`; `src/components/ai-elements/prompt-input.tsx`.

## STORY-012: Attach a synthetic file and remove it before sending

<a id="story-012"></a>

**Provisional ID**: CHAT-02

**Type**: short
**Topic**: Chat creation and continuation
**Persona**: A user who selected the wrong document.
**Goal**: Confirm a draft attachment can be identified and removed before submission.
**Preconditions**: Authenticated account at `/chat`; a local file `weekend-notes.txt` containing only synthetic text such as `Saturday: walk and reading.` exists. Do not use workspace files containing private data.
**Ideal path**: 3 — Open the file picker, choose the file, remove its chip.
**Alternate paths**: The shared textarea supports pasting clipboard files. Pressing Backspace with an empty textarea removes the last attachment. Use the same `Attach files` control in an existing conversation.

### Steps

1. Activate `Attach files` → the native file picker opens.
2. Choose `weekend-notes.txt` → a filename chip appears in the composer footer.
3. Activate `Remove weekend-notes.txt` → the chip disappears without submitting a message.
4. Type a short draft and inspect its layout → the attachment control and `Submit` remain reachable.

### Variations

- Select multiple synthetic files → each has a distinct removal control.
- Use a long filename → it is visually truncated; inspect whether the accessible removal name still identifies it.
- On an existing `/chat/[sessionId]`, repeat without submitting.

### Edge Cases

- Backspace on an empty draft removes the last attachment; this keyboard shortcut may surprise users who cannot see the chip clearly.
- The call sites use `multiple` without explicit file-type/count/size limits; do not assume a visible format guarantee or test huge files during this audit.
- File-only messages are permitted by the app's submission guard, but actual model support for the chosen file type requires a separate observed send.

**Sources**: `src/app/(authenticated)/chat/_components/composer-attachments.tsx`; `src/components/ai-elements/prompt-input.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/input/index.tsx`; `src/app/(authenticated)/chat/_lib/message-input.ts`.

## STORY-013: Start a conversation, continue it, and reload

<a id="story-013"></a>

**Provisional ID**: CHAT-03

**Type**: medium
**Topic**: Chat creation and continuation
**Persona**: A user planning a small personal activity.
**Goal**: Receive a response, refine it, and retain the conversation after reload.
**Preconditions**: Authenticated synthetic account at `/chat`; working local Eve and model connection. Use text-only, non-external prompts. If the runtime fails, record the failure rather than substituting a source claim.
**Ideal path**: 5 — Enter and submit the first message, enter and submit a follow-up, reload to verify continuity.
**Alternate paths**: Enter submits the draft instead of clicking `Submit`; a starter may initialize the first draft. Saved conversations reopen from `All chats` at `/chat/history`.

### Steps

1. Enter `Suggest three quiet indoor activities for a rainy afternoon. Do not browse or contact anyone.` in `Message Jory`.
2. Activate `Submit` → a session is created and the URL becomes `/chat/[sessionId]`; inspect that the user message appears once.
3. Wait for the response → inspect readable assistant content and whether the working indicator settles. Do not prescribe the exact model wording.
4. Enter `Which one requires the fewest supplies?` and activate `Submit` → a follow-up appears in the same session and a relevant response follows.
5. Reload the page → both user turns and their assistant responses restore without duplication.
6. Open `All chats` and select this synthetic conversation → the saved conversation reopens; compare its title with the first prompt.

### Variations

- Use Enter to submit, keeping Shift+Enter available for multiline drafts.
- A file-only first turn derives its title from the first filename; the standard text title uses the first 240 characters.
- Narrow viewport: inspect composer visibility, scrolling, bubble width, and the most recent response.

### Edge Cases

- The initial `saveChat` failure is caught and navigation still proceeds; successful session navigation alone does not prove the chat appears in history.
- Empty/whitespace-only text with no files is ignored by the submission handler.
- A session restoring with no messages disables `Submit`; inspect whether the loading state explains the wait.

**Sources**: `src/app/(authenticated)/chat/(new)/_components/new-chat.tsx`; `src/app/(authenticated)/chat/_lib/message-input.ts`; `src/app/(authenticated)/chat/[sessionId]/_components/input/index.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/use-session-agent.ts`; `src/app/(authenticated)/chat/history/page.tsx`.

## STORY-014: Stop a response and continue, or recover from a failed turn

<a id="story-014"></a>

**Provisional ID**: CHAT-04

**Type**: medium
**Topic**: Chat creation and continuation
**Persona**: A user who realizes the requested answer is too long.
**Goal**: Stop ongoing generation and make a shorter follow-up request in the same conversation.
**Preconditions**: Owned synthetic `/chat/[sessionId]` with an established history; functioning runtime and a response long enough to expose `Stop`. Do not create artificial infrastructure outages or send external-action prompts.
**Ideal path**: 5 — Enter and submit a request, stop it, enter and submit the shorter request.
**Alternate paths**: During streaming the textarea can accept a new message; pressing Enter can submit it with the application's steer policy. The visible primary button remains `Stop`, so this alternate requires separate usability observation. There is no dedicated retry button in the mapped failure alert.

### Steps

1. Enter `Give me a detailed fictional itinerary for a day spent reading at home. Do not browse or contact anyone.` and activate `Submit`.
2. While generation is active, activate `Stop` → request cancellation; verify the UI eventually stops indicating active work. A button click alone is not proof the runtime cancelled.
3. Enter `Please replace that with three short bullet points.` → the draft remains editable once the submitted phase ends.
4. Activate `Submit` when available → the conversation receives a new turn and a shorter reply.
5. Reload → verify the resulting history is coherent and does not appear stuck in a permanent active state.

### Variations

- If a turn naturally fails, inspect `Jory couldn’t finish this request` and its recovery description. Send the safe message again once the runtime is available and record whether the error clears.
- The normal recovery description is `Please try sending your message again.`; local developer activity may replace it with a diagnostic.
- If the response finishes too quickly to stop, record this branch as untested instead of claiming cancellation passed.

### Edge Cases

- The new-chat page does not pass agent status or an `onStop` callback to its submit control; this stop story intentionally starts in an established session.
- `cancel()` is invoked without local success feedback in the composer; observe the stream and button state before declaring completion.
- Failed async submission is intended to preserve a draft in the shared input component. A model turn failing after accepted submission may need the user to re-enter the message; distinguish these cases.

**Sources**: `src/app/(authenticated)/chat/[sessionId]/_components/input/index.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/use-session-agent.ts`; `src/app/(authenticated)/chat/[sessionId]/_components/conversation/index.tsx`; `src/components/ai-elements/prompt-input.tsx`; `src/app/(authenticated)/chat/(new)/_components/new-chat.tsx`.

## STORY-015: Answer a question or review a conditional action request

<a id="story-015"></a>

**Provisional ID**: CHAT-05

**Type**: medium
**Topic**: Chat creation and continuation
**Persona**: A user whose assistant needs additional input before continuing.
**Goal**: Understand a pending request, answer it once, and see that the response was registered.
**Preconditions**: An owned synthetic conversation contains a real pending structured question generated by the runtime or an existing approved local fixture. A normal text question is not equivalent. Approval/authorization variations require their own isolated fixture and are blocked if none exists; do not induce real purchases, messages, deletion, or third-party grants.
**Ideal path**: 2 — Select an option or type an answer, then activate `Answer`.
**Alternate paths**: A question may offer selectable options, freeform `Answer`, or both according to its metadata. Tool action requests instead render direct buttons using runtime-provided labels; those are a separate interaction, not a universal `Answer` form.

### Steps

1. Read the structured question's actual prompt and offered choices → record the visible wording; it is supplied by the runtime, so this catalog does not invent it.
2. Choose an appropriate option or enter a synthetic response in the field named `Answer` with placeholder `Type your answer…`.
3. Activate `Answer` → the response is submitted to this request, not as an unrelated new message.
4. Wait for `Responded:` and the selected label/text → controls should no longer allow a second response to the same request.
5. Observe the subsequent conversation → determine whether it clearly continues or communicates a failure.

### Variations

- A browser-action fixture shows an approval alert with material terms. Inspect merchant/item/quantity/total for purchases, recipient/content for messages, target/impact for deletion, or the submit description. Record actual option labels; do not assume they say Approve/Decline.
- In an isolated fixture only, use its non-committing rejection option and verify `Responded:`. Do not approve an external action merely to complete coverage.
- An authorization fixture displays `Connect {displayName}`, optional instructions/code, and `Sign in with {displayName}` opening a new tab. Completion may show connected, declined, failed, or timed out; provider grant completion is blocked without an authorized test connector.

### Edge Cases

- Question controls are disabled while the agent is busy or resuming and after a response; inspect whether users can tell why they cannot interact.
- Freeform input is omitted when options exist and `allowFreeform` is false.
- An invalid browser approval projection suppresses the detailed summary; do not treat that as permission to proceed.
- No appropriate pending fixture means this story remains blocked; asking an unconstrained model for a question does not guarantee the structured component appears.

**Sources**: `src/app/(authenticated)/chat/[sessionId]/_components/conversation/message/input-request.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/conversation/message/authorization.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/conversation/index.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/use-session-agent.ts`.

## Redundancy and coverage notes

- Starter buttons and direct typing both prepare a draft, but starters contribute example wording rather than duplicate a separate conversation feature.
- Button submission and Enter share a normal goal; while streaming, the visible button stops and keyboard submission may steer, which warrants particular discoverability review.
- Tool action buttons, structured question `Answer`, and provider authorization links are distinct interaction types; consistent feedback matters more than combining them.
- Attachment transfer/model processing, naturally occurring server failures, stop timing, structured questions, browser approvals, provider authorization, and older-history pagination need their specific runtime prerequisites. Source inspection does not pass them.
- Two short and three medium stories are sufficient here; a 15-step story would combine unrelated features or rely on unavailable conditional events.
