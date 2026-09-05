# App Discovery: Jory / OpenInstinct dashboard

Generated: 2026-09-05. Scope: the local web dashboard, with the surrounding application mapped for context. This is source discovery, not a claim that every workflow has been exercised in a browser. Audit checkout: `fork-OpenInstinct-ux-audit`, pinned to `f11a3a1`.

## Application Type

An authenticated web dashboard for a personal assistant called Jory. The app manages connections and model selection, web conversations, browser assignment history, personal information, and encrypted vault entries. A conditional admin area provides workspace and operational oversight.

## Tech Stack

Next.js App Router (`next` 16.3.3 in `package.json`), React, local UI primitives, Better Auth phone authentication (1.7.2), tRPC application requests, Drizzle/Postgres scoped storage, and Eve agent sessions (`eve` ^0.49.0). Versions are package declarations, not independently verified deployed versions.

Repository instructions and topology were read in `AGENTS.md` and `docs/AGENT_GUIDE.md`. No nested AGENTS.md or CONTEXT.md files were found. The guide's route table is stale: source currently uses `/chat/history` and `/tasks/[sessionId]`, not `/chats` or `/runs/[groupId]`. This document follows actual route files.

## User Roles

- Visitor: phone sign-in and code verification; protected dashboard access requires authentication.
- Authenticated workspace member: dashboard, scoped chat and browser traces, connections, personal info, vault, and model choice.
- Deployment administrator: additionally sees admin navigation and may inspect system data, suspend/reactivate workspaces, and drain webhook deliveries. `src/lib/admin.ts` checks the authenticated phone against `ADMIN_PHONE_NUMBERS`; `admin/layout.tsx` returns not-found for non-admins.
- Developer in local/allowed preview environments: may see additional chat activity and usage surfaces. This is conditional visibility, not a separate customer membership role.

## Feature Map

All page paths below are relative to `src/app/(authenticated)/` unless specified.

### 1. Access and navigation

- `/sign-in`: phone number entry, request code, code verification, use a different number, conditional first-time Linq instructions and Messages link. Sources: `src/app/sign-in/page.tsx`, `_components/otp-form.tsx`, `_components/phone-field.tsx`.
- Persistent navigation: Workspace, Vault, Personal info, Chat, All chats, Tasks; optional Admin, Workspaces, Audit log, Webhooks, Usage. Source: `_components/authenticated-navigation.tsx`.
- Mobile header with sidebar trigger and current section label; current-route active styling. Account phone label and Sign out. Sources: `_components/authenticated-navigation.tsx`, `_components/account-control.tsx`, `layout.tsx`, `src/components/ui/sidebar.tsx`.
- Authenticated loading/error boundaries: `loading.tsx`, `error.tsx`; route authorization in `src/proxy.ts` and `src/lib/request-scope.ts`.

### 2. Workspace setup and connections

- `/`: Channels section links WebChat to `/chat`; conditional iMessage opens a native `sms:` URI. Disabled states describe absent Linq configuration. Sources: `(workspace)/page.tsx`, `_components/channels-section.tsx`.
- Google Workspace and Square Connect/Disconnect actions, connected account/status, unavailable deployment explanation and redirect-result alerts. Sources: `(workspace)/page.tsx`, `_components/google-workspace-action.tsx`, `_components/square-action.tsx`.
- Infrastructure displays Kernel browser and private image storage status; AI Gateway model opens a searchable choice dialog and updates the workspace model. Sources: `(workspace)/page.tsx`, `_components/model-selector.tsx`.
- Important source caveat: Kernel Connected is rendered unconditionally, so the badge is not a live health test.

### 3. Chat creation and continuation

- `/chat`: Jory introduction, Message Jory composer, Send, Attach files, remove draft attachments, three starter chips (Explore, Make a plan, Think it through). Chips fill the draft and focus the composer. The first session navigates to `/chat/[sessionId]`. Sources: `chat/(new)/_components/new-chat.tsx`, `chat/_components/composer-attachments.tsx`.
- `/chat/[sessionId]`: persisted conversation, follow-up messages, older history, streaming and cancel, attachments, error/recovery presentation, agent questions and responses. Sources: `chat/[sessionId]/_components/chat-session.tsx`, `input/index.tsx`, `conversation/index.tsx`, `use-session-agent.ts`.
- Conditional interaction: authorization links and completion/decline/failure/timeout state; questions with choices or freeform answers; browser action approvals show relevant material terms. Sources: `conversation/message/authorization.tsx`, `input-request.tsx`.
- Optional developer activity pane and trace view selection. Source: `chat/[sessionId]/_components/activity/index.tsx`; conditional gate passed from chat page.

### 4. Conversation history and browser task review

- `/chat/history`: All chats, workspace usage total, individual conversation title/usage/date, iMessage main-thread marker, New chat, no-chats state. Source: `chat/history/page.tsx`.
- `/tasks`: page title Browser traces, history with assignment/outcome/duration/domains, Refresh, pagination, Open chat, empty/load-error states. Sources: `tasks/(overview)/page.tsx`, `_components/trace-history.tsx`.
- `/tasks/[sessionId]`: All traces back link, task title/status/result, timing breakdown, event timeline table and Refresh; absent owned trace yields not-found. Source: `tasks/[sessionId]/page.tsx`.
- These are review surfaces, not a task creation/scheduling editor. Do not invent dashboard scheduling, search, deletion, or export controls.

### 5. Vault and personal information

- `/vault`: category dialogs for Logins, Cards, Addresses, Contact info. Browse safe metadata, search by name/account, progressively load more by scrolling, add items, back to list, close dialog, remove items. Sources: `vault/page.tsx`, `_components/section.tsx`, category `index.tsx` and `form.tsx` files.
- Logins import: Google Password Manager export instructions/link, CSV upload/selection/import, import completion and failure feedback. Source: `vault/_components/logins/import.tsx`.
- Other vault metadata appears only when identity/phone/token records exist; no matching dashboard add form is present. Source: `vault/_components/other.tsx`.
- Removal is an immediate mutation in the row handler; no confirmation or undo is visible in that source. Treat it as a review finding candidate, not an invitation to delete existing records.
- `/personal-info`: identity/contact and mailing-address fields; Save personal info, Saving, Saved, and validation/server error text. Source: `personal-info/_components/personal-info-form.tsx`. The copy distinguishes these directly usable values from vault passwords/payment data.
- No vault edit/reveal control was found in the mapped category/list UI; do not invent one.

### 6. Admin operations

- `/admin`: system-count and monthly usage/webhook summary cards. Source: `admin/(overview)/_components/overview-dashboard.tsx`.
- `/admin/workspaces`: workspace list, pagination, suspend/reactivate controls with a confirmation dialog. Source: `admin/workspaces/_components/workspace-table.tsx`.
- `/admin/audit`: filter by workspace ID and paginate audit rows. Source: `admin/audit/_components/audit-log-table.tsx`.
- `/admin/webhooks`: recent delivery attempts, outcome/attempt/response information, Drain now with result/error feedback. Source: `admin/webhooks/_components/webhook-deliveries.tsx`.
- `/admin/usage`: usage table. Source: `admin/usage/_components/usage-table.tsx`.
- Admin navigation is repeated inside each admin page, in addition to the global sidebar. Source: `admin/_components/admin-shell.tsx`.

## Navigation Structure

Sign-in leads to the protected application shell. Desktop sidebar is the principal navigation; the mobile header exposes it through a trigger. Workspace WebChat, sidebar Chat, All chats New chat, and Tasks Open chat all reach `/chat`. All chats opens saved sessions; Tasks opens browser trace details with an All traces return link. Vault categories open dialogs with nested create/import modes, rather than new routes. Admin uses both global sidebar and its own repeated link list.

## Data Entities

- Auth session: create through phone verification, read current account, end through sign-out.
- Personal profile: read/update identity, contact, and address fields.
- Vault item: create, metadata read/search, remove; logins may be imported. Plaintext secret disclosure is outside this review.
- Chat/session/message/attachment/input response: create and read; cancel an active turn; resume history.
- Browser trace/event: read/paginate/refresh; generated by agent assignments.
- Connection grant: connect/disconnect and status read.
- Workspace model setting: read/update from catalog.
- Admin workspace: read and suspend/reactivate; audit, usage, and webhook delivery records: read; webhook queue: controlled drain.

Storage/service owners are under `src/db/services`; authentication and access scope, not supplied workspace IDs, govern dashboard ownership.

## Integrations and Non-page Entry Points

Google Workspace and Square authorization use Vercel Connect. Linq powers phone/iMessage behavior. Eve serves sessions and streams; Kernel runs delegated browsers; Vercel Blob supplies private artifacts; AI Gateway supplies model choices/inference. Dashboard requests use `/api/trpc/[trpc]`, auth uses `/api/auth/[...all]`, and artifacts use `/artifacts/[artifactId]`.

Context-only API routes include `/v1/agents`, `/v1/agents/[agentId]`, revision/publish descendants, `/v1/usage`, and `/api/cron/drain-webhooks`. These are not dashboard UI journeys. Agent-internal tools, public API client journeys, and deployment operations are excluded.

## States, Flags, and Browser Preconditions

Cover empty and populated lists, dialogs and draft cancellation, invalid form entries, pending submission, failure feedback, deep links, mobile navigation, keyboard focus, and scroll reachability as variations of each topic.

Relevant conditions: administrator phone allow-list; server `developerActivity` setting; configured Google/Square connectors; Linq connector/phone; image storage availability; owned pre-existing conversations/traces and admin records. Current browser preflight reported Google and Square as Admin setup needed and iMessage disabled. Those external success journeys must remain blocked until an appropriate test connector exists.

Use designated synthetic local data only. Do not require real vault data, grant third-party accounts, send external messages, drain real deliveries, or suspend real workspaces merely to finish an audit. Branches requiring unavailable roles or fixtures should be recorded as blocked, not counted as passed. Source-supported behavior and browser-observed behavior must remain separate.

## Recommended Story Topics

1. **Access and dashboard navigation** (`access-navigation`) — phone login/recovery/sign-out, route discoverability, responsive and keyboard shell use, unauthorized/deep-link states.
2. **Workspace channels, connections, and model** (`workspace-setup`) — startup readiness, chat entry, external connection states, model selection and failure recovery.
3. **Chat creation and continuation** (`chat-conversation`) — starter draft, attachments, first send, continuation/cancel, questions/approvals/authorization, error recovery.
4. **History and task review** (`history-tasks`) — saved sessions, older messages and optional activity, browser assignment list/detail and refresh, empty and missing states.
5. **Vault and personal information** (`vault-personal-info`) — safe synthetic add/search/import/remove, nested dialogs, profile save/validation, and the distinction between personal values and secrets.
6. **Admin oversight** (`admin-oversight`) — conditional navigation, overview/workspaces/audit/webhooks/usage, confirmation flows and role protection; mutations require isolated fixtures.

## Redundancy Candidates for Consolidation

- New chat entry exists in four places: sidebar Chat, Workspace WebChat, All chats New chat, Tasks Open chat.
- Admin pages repeat sidebar destinations in their own header navigation.
- Personal info contact/address fields overlap conceptually with Vault Contact info/Addresses; evaluate whether the distinction in handling is understandable.
- Browser progress/results appear in chat activity, trace list, and trace detail; assess whether each has a distinct purpose.
- Usage appears in All chats totals and rows, conditional chat activity, and admin summaries/tables; distinguish workspace, conversation, and operator scope before calling this redundant.
