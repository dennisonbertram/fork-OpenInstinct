# Workspace channels, connections, and model

Source-based stories for the dashboard at `/`, generated 2026-09-05. These are expected paths for later browser verification, not recorded passes. Source prefix below: `src/app/(authenticated)/(workspace)/`. Current local preflight reports Google Workspace and Square unavailable and iMessage disabled. External success variants require designated test connectors; do not grant real accounts or send external messages during this audit.

## STORY-006: Find what is available in a new workspace

<a id="story-006"></a>

**Provisional ID**: WORKSPACE-01

**Type**: short
**Topic**: Workspace channels, connections, and model
**Persona**: Maya, a new member checking how to use Jory.
**Goal**: Understand which channels and account connections are available.
**Preconditions**: Signed-in local synthetic account; Google and Square unavailable; Linq absent or missing its assigned phone number.
**Ideal path**: 2 — open Workspace and read one consolidated view of capabilities and setup requirements.
**Alternate paths**: None found for the consolidated readiness view. Chat can be opened directly, but does not provide the same connection overview.
**Sources**: `page.tsx`, `_components/channels-section.tsx`, `_components/google-workspace-action.tsx`, `_components/square-action.tsx`.

### Steps

1. Select **Workspace** in the sidebar → `/` presents **Channels**, **Connections**, and **Infrastructure**.
2. Read the **WebChat** and **iMessage** choices → WebChat is enabled; unavailable iMessage is disabled with an explanation beneath the choices.
3. Read **Google Workspace** and **Square** → both show **Admin setup needed** and deployment setup explanations, rather than an actionable Connect control.
4. Read **Kernel browser**, **Vercel Blob**, and **AI Gateway model** → the page displays connection/setup badges and the current model identifier. Treat Kernel's **Connected** badge as display content: the source renders it unconditionally and it does not prove service health.

### Variations

- Linq connector absent: the explanation includes **Set up Linq to enable iMessage.**
- Linq connector exists without a phone number: the explanation says **Linq is connected. Use its assigned line to start an iMessage.**, while the button remains disabled.
- Image storage absent: Vercel Blob shows **Setup required** and explains private-store setup; configured storage shows **Connected**.
- Narrow screen: verify descriptions wrap and every status remains associated with its service.

### Edge Cases

- A user expects **Admin setup needed** to be clickable: it is a badge; record whether the explanation supplies enough direction.
- No provider configuration exists: record unavailable success branches as blocked; do not infer an OAuth failure from an unavailable badge.
- A ready badge conflicts with a later runtime failure: distinguish readiness copy from observed service behavior.

## STORY-007: Start a web conversation from Workspace

<a id="story-007"></a>

**Provisional ID**: WORKSPACE-02

**Type**: short
**Topic**: Workspace channels, connections, and model
**Persona**: Maya, ready to ask Jory for help after checking setup.
**Goal**: Reach a usable new-chat composer without configuring unrelated integrations.
**Preconditions**: Signed in and viewing `/`; WebChat enabled. Sending a message belongs to the chat-conversation topic.
**Ideal path**: 1 — select WebChat from the workspace channel list.
**Alternate paths**: Sidebar **Chat**; `/chat/history` **New chat**; `/tasks` **Open chat**; direct `/chat`. These all reach the same new-chat route.
**Sources**: `_components/channels-section.tsx`; `src/app/(authenticated)/_components/authenticated-navigation.tsx`; `src/app/(authenticated)/chat/(new)/_components/new-chat.tsx`; `chat/history/page.tsx`; `tasks/(overview)/page.tsx`.

### Steps

1. Select **WebChat** under **Channels** → navigate to `/chat`.
2. Read **What’s on your mind?** and focus **Message Jory** → the new-chat composer offers **Send a message…**, attachment controls, and conversation starters without requiring Google or Square setup.
3. Select **Workspace**, then use sidebar **Chat** → return to the same new-chat surface, confirming that the differently named entry points have the same destination.

### Variations

- Keyboard-only: focus WebChat and activate it; verify keyboard reachability of the composer.
- Mobile: open sidebar from the mobile header, return to Workspace, and follow WebChat again.
- Returning user: **All chats** → **New chat** reaches the same creation screen while preserving existing history.

### Edge Cases

- Existing unsent draft: check whether changing routes loses it and report the observed behavior; this story does not assume draft persistence.
- Slow route loading: distinguish the loading state from a failed navigation.

## STORY-008: Search the model catalog and leave the current model unchanged

<a id="story-008"></a>

**Provisional ID**: WORKSPACE-03

**Type**: medium
**Topic**: Workspace channels, connections, and model
**Persona**: Rafael, evaluating model options before deciding whether to change anything.
**Goal**: Inspect model names, identifiers, and prices, then exit without altering the workspace setting.
**Preconditions**: Signed in on `/`; model catalog service available for populated results. No model selection is required or authorized by this story.
**Ideal path**: 3 — open the chooser, inspect/search options, dismiss it.
**Alternate paths**: None found for this workspace model chooser.
**Sources**: `_components/model-selector.tsx`; `src/components/ai-elements/model-selector.tsx`; `src/components/ui/dialog.tsx`.

### Steps

1. Read and remember the **AI Gateway model** identifier on `/` → establish the visible value for comparison after dismissal.
2. Select **Choose** → the **Choose a model** dialog opens with **Search models…**.
3. Wait for the catalog → provider groups show model names and identifiers; pricing is shown only when both input and output prices exist.
4. Search for a provider or identifier already visible in the results → matching choices remain available. Do not activate a choice: item selection immediately submits the setting mutation.
5. Replace the query with `audit-no-such-model-2099` → if the catalog loaded successfully, **No matching models.** appears.
6. Clear the query → choices return without navigating away from the dialog.
7. Press Escape → expect the dialog to dismiss through its underlying dialog behavior; verify this in the walk because there is no visible close button configured here.
8. Read the **AI Gateway model** identifier again → it remains the previously displayed value.

### Variations

- Keyboard-only: tab to **Choose**, inspect the search input and option focus, then dismiss without pressing Enter on an option.
- Small viewport or large catalog: inspect scroll reachability of provider groups and the dialog's bottom edge.
- A fixture explicitly intended for changing models may exercise selection: choosing an item submits immediately, then the dialog closes and the page refreshes after success. This is outside the non-mutating primary walk.

### Edge Cases

- Catalog pending: **Loading models…** is the empty-state text.
- Catalog fails: an error message may replace the empty state; record the actual response without calling it a no-results search.
- No pricing exists: absence of a price is supported behavior, not a measured zero price.
- Dismissal is undiscoverable: record friction caused by the absent visible close control; do not claim a Cancel button exists.

## STORY-009: Inspect connector actions and recover from an unavailable return

<a id="story-009"></a>

**Provisional ID**: WORKSPACE-04

**Type**: medium
**Topic**: Workspace channels, connections, and model
**Persona**: Rafael, checking whether his workspace can connect a designated Square test account.
**Goal**: Understand connection state and remain able to use the dashboard after a connection failure.
**Preconditions**: Signed in. Primary error-display path can be checked locally using the rendered callback-state URL; it does not simulate or prove OAuth execution. A real Connect success path requires a working deployment connector and a separately designated synthetic provider account. A Disconnect path requires that test account to be connected already.
**Ideal path**: 2 — reach the connection state and see actionable success/failure information after an attempted connection.
**Alternate paths**: Google Workspace has the same dashboard Connect/Disconnect pattern. Chat can show a tool-specific authorization prompt when the agent requires one, but source discovery does not establish that it grants the same scope as these dashboard buttons; do not treat it as an interchangeable success route.
**Sources**: `page.tsx`, `_components/square-action.tsx`, `_components/google-workspace-action.tsx`; `src/app/(authenticated)/chat/[sessionId]/_components/conversation/message/authorization.tsx`.

### Steps

1. Open **Workspace** → inspect the **Square** and **Google Workspace** rows.
2. Classify the visible states → disconnected configured service shows **Connect**; connected service shows **Disconnect**; unavailable service shows **Admin setup needed**. Do not click a real connected account's Disconnect button.
3. Open `/?square=unavailable` directly for the presentation-only test → **Square unavailable** explains that the deployment lacks a working Square OAuth connector; the rest of Workspace remains available.
4. Select sidebar **Workspace** → return to `/` and clear the URL-triggered banner while retaining the underlying service state.
5. Open `/?google=unavailable` → **Google Workspace unavailable** appears with its equivalent explanation.
6. Select **WebChat** → reach `/chat` even though the connector setup is unavailable.

### Variations

- With an isolated configured/disconnected test connector, **Connect** disables while its request is pending and then redirects to the returned authorization location. Stop before granting a real account; a completed OAuth claim requires separate fixture evidence.
- With an isolated connected fixture, metadata shows the connected state. Google may show an account label; Square shows **Square account connected.**.
- A designated disposable grant may be disconnected in a separate authorized fixture run; expected source behavior is request pending, redirect, then a freshly derived state. This audit does not require grant mutation.

### Edge Cases

- Manually adding the query parameter only tests banner rendering. It is not evidence that connection failure recovery works end to end.
- A callback success or provider consent screen is unavailable locally: mark it blocked, not passed or broken.
- **Disconnect** has no confirmation in these components; note the immediate-action affordance without testing against a real grant.

## STORY-010: Understand the iMessage handoff without sending a message

<a id="story-010"></a>

**Provisional ID**: WORKSPACE-05

**Type**: short
**Topic**: Workspace channels, connections, and model
**Persona**: Maya, deciding whether to use the browser or her Messages application.
**Goal**: Identify whether iMessage is available and what choosing it will do.
**Preconditions**: Signed in on `/`. Current local unavailable state is walkable; the enabled handoff requires a configured Linq connector and assigned test line, plus an OS handler for `sms:` links. No message should be sent.
**Ideal path**: 2 — inspect availability and, when configured, open the system messaging handoff.
**Alternate paths**: The sign-in page conditionally offers **Text Linq in Messages**, but that serves onboarding and may not share this configured target. All chats may show an existing **iMessage** main thread; that opens saved conversation history, not the native compose handoff.
**Sources**: `_components/channels-section.tsx`; `src/app/sign-in/_components/otp-form.tsx`; `src/app/(authenticated)/chat/history/page.tsx`.

### Steps

1. Read **iMessage** under **Channels** → determine whether the control is enabled or disabled and read the supporting sentence.
2. In the current unavailable local state, inspect the disabled control → it does not initiate navigation; the copy explains missing Linq setup or an assigned line.
3. If a designated configured test line exists, inspect **iMessage** with accessible label **Open iMessage** → its target is an `sms:` URI and the page states which line it opens. Do not reproduce the line in public evidence.
4. Only with that fixture, activate the handoff → observe any browser/OS confirmation or Messages compose surface, then cancel without sending. If no OS handler exists, record an environment limitation.

### Variations

- Desktop vs mobile: the OS handoff differs; verify the available surface rather than asserting identical behavior.
- Existing Linq history: **All chats** may label one conversation **iMessage** with **Main thread**; following it is a separate history-review action.

### Edge Cases

- Configured connector without assigned phone: control remains disabled even though the explanatory copy says Linq is connected.
- Browser protocol prompts are not an application error.
- No test line or OS handler: enabled handoff remains blocked, while disabled-state coverage can still be observed.
