# Access and navigation stories

These five stories are derived from the current source, not browser observations. They exercise the local dashboard using only the designated synthetic account `+12025550123` and local development code `000000`. They do not test message delivery, provider authorization, real-user records, or administrative writes. The discovery document was cross-checked after the source pass; route ownership below follows actual `src/app` files because the guide's route table contains older paths.

Action counts treat entering a field, activating a control, and navigating to a URL as individual actions; passive observation is not an action. Ideal counts describe the shortest plausible path for the stated goal, not every audit assertion.

## STORY-001: Sign in and resume a saved dashboard destination

<a id="story-001"></a>

**Provisional ID**: ACCESS-01

**Type**: medium
**Topic**: Access and navigation
**Persona**: A returning user who bookmarked chat history.
**Goal**: Sign in and arrive at the intended destination without finding it again.
**Preconditions**: Local app running, unauthenticated isolated browser, local phone bypass enabled, synthetic account only.
**Ideal path**: 5 — Open the destination, enter a phone number, request a code, enter it, verify it.
**Alternate paths**: Open `/sign-in?callbackUrl=/chat/history` directly; open `/sign-in` and then choose `All chats` after sign-in, at the cost of an additional navigation action.

### Steps

1. Open `/chat/history` → unauthenticated request redirects to `/sign-in?callbackUrl=%2Fchat%2Fhistory`.
2. Read `Hey, Jory` and the local-development notice → the notice explains that no text is sent and code `000000` is used next.
3. Enter `+12025550123` in `Phone Number` → the field accepts the designated synthetic identity.
4. Choose `Send code` → `Verification Code`, `Verify code`, and `Use a different number` replace the phone entry form.
5. Enter `000000` in `Verification Code` and choose `Verify code` → the route becomes `/chat/history` and the heading is `All chats`.
6. Reload → the user remains signed in at the same destination; this needs browser verification, not an assumption based on the form callback.

### Variations

- Open `/` first → successful verification returns to `Workspace` instead.
- Use a destination with query parameters → the proxy preserves pathname and search in the callback.
- Visit `/sign-in` while already authenticated → the server redirects to `/`, regardless of callback.

### Edge Cases

- A callback beginning `//` or an external URL is rejected by the sign-in page in favor of `/`.
- OTP send failure displays `Unable to send a code. Please try again.` unless an explicit Linq error is returned.
- This local bypass does not verify SMS/iMessage delivery or deployed onboarding.

**Sources**: `src/proxy.ts`; `src/app/sign-in/page.tsx`; `src/app/sign-in/_components/otp-form.tsx`; `src/app/(authenticated)/chat/history/page.tsx`.

## STORY-002: Recover from an incorrect verification code

<a id="story-002"></a>

**Provisional ID**: ACCESS-02

**Type**: medium
**Topic**: Access and navigation
**Persona**: A returning user who mistyped the code and needs to recover.
**Goal**: Reach the dashboard without getting stuck after a rejected code.
**Preconditions**: Local unauthenticated browser at `/sign-in`, bypass enabled, synthetic account only.
**Ideal path**: 6 — Phone entry and request, incorrect code and verify, then corrected code and verify.
**Alternate paths**: `Use a different number` resets the send-code state and allows a fresh request. No dedicated `Resend code` control exists in this form.

### Steps

1. Enter `+12025550123` in `Phone Number` and choose `Send code` → verification form appears.
2. Enter `111111` and choose `Verify code` → expect a visible verification error and no authenticated dashboard. Record the actual server response; this negative case is not yet observed.
3. Replace the code with `000000` → the field remains editable after failure.
4. Choose `Verify code` → expect `/` with the authenticated navigation.
5. Check that the error does not remain on the destination and the account footer identifies the synthetic account.

### Variations

- Instead of correcting the code, choose `Use a different number` → the phone form returns; re-enter the same designated account for this audit and request again.
- Submit an empty code → native required-field validation should prevent submission.
- Enter fewer than six digits → native pattern validation and the mutation's six-digit check are both relevant; report which message is actually visible.

### Edge Cases

- The verification error advises requesting a new code, but the available recovery control says `Use a different number`; evaluate whether the intended same-number recovery is discoverable.
- `Sending…` and `Verifying…` disable the respective submit button while pending.
- Do not repeatedly submit guesses or use real phone numbers.

**Sources**: `src/app/sign-in/_components/otp-form.tsx`; `src/app/sign-in/_components/phone-field.tsx`; `src/app/sign-in/_lib/phone-auth.ts`.

## STORY-003: Find chat from the workspace and return home

<a id="story-003"></a>

**Provisional ID**: ACCESS-03

**Type**: short
**Topic**: Access and navigation
**Persona**: A signed-in user deciding where to start a conversation.
**Goal**: Open a new chat from Workspace and return to the dashboard.
**Preconditions**: Authenticated synthetic account at `/`, desktop viewport. Do not send a prompt.
**Ideal path**: 2 — One action opens chat and one returns home.
**Alternate paths**: `WebChat` in Workspace and `Chat` in the Primary sidebar both link to `/chat`; `New chat` in `/chat/history` also links to `/chat`. The `Jory` brand link and `Workspace` sidebar item both return to `/`.

### Steps

1. From Workspace, choose `WebChat` under `Channels` → `/chat` opens the new-chat surface.
2. Choose the `Jory` brand link → `/` returns to Workspace.
3. Choose sidebar `Chat` → confirm it reaches the same `/chat` destination.
4. Choose sidebar `Workspace` → confirm it reaches the same `/` destination.

### Variations

- Navigate through `All chats` and choose `New chat` to compare the third entry point.
- Keyboard navigation should reach the links with clear accessible names.

### Edge Cases

- `WebChat is ready.` is derived from a hardcoded `browserReady = true` in the Workspace page; the label alone does not prove that sending a message works.
- Sidebar active state should identify `Chat` on `/chat/[sessionId]` but `All chats` on `/chat/history`.
- The Workspace heading is visually hidden; judge whether its sections and active navigation orient a sighted user without it.

**Sources**: `src/app/(authenticated)/(workspace)/_components/channels-section.tsx`; `src/app/(authenticated)/(workspace)/page.tsx`; `src/app/(authenticated)/_components/authenticated-navigation.tsx`; `src/app/(authenticated)/layout.tsx`; `src/app/(authenticated)/chat/history/page.tsx`.

## STORY-004: Navigate the dashboard on a narrow screen

<a id="story-004"></a>

**Provisional ID**: ACCESS-04

**Type**: medium
**Topic**: Access and navigation
**Persona**: A signed-in user checking their workspace on a phone.
**Goal**: Move to chat history and browser tasks with clear location and usable navigation.
**Preconditions**: Authenticated synthetic account at `/`, narrow mobile viewport; no real-user data. Record the actual viewport.
**Ideal path**: 4 — Open navigation and select a destination twice; the menu should not require extra dismissal to see the selected page.
**Alternate paths**: The sidebar keyboard shortcut invokes the same toggle where a keyboard is available. Direct `/chat/history` and `/tasks` URLs bypass the menu. Workspace `WebChat` opens chat, but not chat history or tasks.

### Steps

1. Choose `Toggle Sidebar` in the mobile header → the sheet named `Sidebar` opens with Primary navigation.
2. Choose `All chats` → `/chat/history` becomes active. Check whether the sheet dismisses and exposes the page; the navigation link contains no explicit mobile-close handler, so dismissal is an open question for the walker.
3. If the sheet remains, dismiss it using the available sheet interaction and record the additional action → the header should read `All chats`.
4. Open `Toggle Sidebar` again and choose `Tasks` → `/tasks` loads.
5. Check the selected `Tasks` navigation/header against the page heading `Browser traces` → decide whether the vocabulary change makes the destination harder to recognize.
6. Return to `Workspace` through the menu → `/` and the mobile header agree on the destination.

### Variations

- Repeat using keyboard and Escape to inspect focus restoration and dismissal.
- At desktop width, Primary navigation is persistent and the mobile header is hidden.
- An administrator sees an additional Admin group; that role-specific surface is outside this account's assumed permissions.

### Edge Cases

- A persistent mobile sheet could hide successful navigation and add repeated dismissals; this is a source-derived risk, not an observed failure.
- Small screens must still expose the account footer and `Sign out` without trapping scroll.
- Avoid opening any browser trace belonging to someone other than the synthetic test account.

**Sources**: `src/components/ui/sidebar.tsx`; `src/app/(authenticated)/_components/authenticated-navigation.tsx`; `src/app/(authenticated)/tasks/(overview)/page.tsx`; `src/app/(authenticated)/layout.tsx`.

## STORY-005: Sign out and confirm the dashboard requires authentication

<a id="story-005"></a>

**Provisional ID**: ACCESS-05

**Type**: short
**Topic**: Access and navigation
**Persona**: A signed-in user finishing on a shared computer.
**Goal**: End the session and ensure a fresh protected-page request no longer opens their dashboard.
**Preconditions**: Authenticated synthetic account; run last because it changes the browser's authentication state.
**Ideal path**: 2 — Sign out, then request a protected destination to verify the session ended.
**Alternate paths**: None found for a user-facing sign-out control; it is an icon action in the sidebar footer.

### Steps

1. Find the account row showing the phone number and activate `Sign out` → `/sign-in` opens.
2. Open `/` in the same browser → expect a redirect back to sign-in, with no authenticated content.
3. Optionally use browser Back and reload the restored page → a fresh request should still require sign-in; separately record any cached-page flash.

### Variations

- On mobile, first open `Toggle Sidebar` to reach the footer; that adds an action.
- If the user record has no phone number, the account label falls back to `Signed in`.

### Edge Cases

- The implementation redirects in `.finally()` even if the sign-out request fails. Arrival at `/sign-in` alone does not prove session termination; the protected fresh request is decisive.
- The account control is hidden while `useSession()` has no user; examine loading/failure discoverability if it is absent.
- Do not intentionally disrupt authentication service availability during this audit; report failed-response handling as unverified unless it occurs naturally.

**Sources**: `src/app/(authenticated)/_components/account-control.tsx`; `src/proxy.ts`; `src/app/sign-in/page.tsx`; `src/app/(authenticated)/layout.tsx`.

## Redundancy and terminology candidates

- New chat is reachable through Workspace `WebChat`, sidebar `Chat`, and history `New chat`.
- Workspace is reachable through sidebar `Workspace` and the `Jory` brand link.
- Active destination appears in navigation and the mobile header; this can support orientation rather than constitute harmful duplication.
- Sidebar/mobile `Tasks` leads to a page titled `Browser traces`.
- Verification error recovery says to request a new code while the only reset action is `Use a different number`.

## Coverage limits

These paths cover local sign-in, callback return, code recovery, primary navigation, mobile navigation, and sign-out. No long story was added because a 15-action access-only flow would repeat actions without a natural goal. Real Linq onboarding, provider outages, administrator navigation, and screen-reader behavior require separate authorized observations. No browser evidence or runtime success is claimed by this topic document.
