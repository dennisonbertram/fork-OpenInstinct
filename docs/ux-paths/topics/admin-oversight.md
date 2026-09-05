# Admin oversight

Five source-derived stories, generated 2026-09-05. Source paths below are relative to `src/app/(authenticated)/admin/`. These are expected paths, not browser passes. Only the non-admin exclusion story is available without a designated admin fixture. Do not create administrator grants, inspect unrelated real operational records, suspend workspaces, or drain outbound deliveries to make an audit complete.

## STORY-026: Keep administration unavailable to a regular member

<a id="story-026"></a>

**Provisional ID**: ADMIN-01

**Type**: short
**Topic**: Admin oversight
**Persona**: Maya, a regular workspace member without operator privileges.
**Goal**: Continue using her dashboard without seeing cross-workspace administrative data.
**Preconditions**: Signed-in synthetic non-admin account; its phone is not included in the deployment admin allow-list.
**Ideal path**: 2 — open a restricted URL and return to permitted navigation.
**Alternate paths**: All protected admin pages share the admin layout; `/admin/workspaces`, `/admin/audit`, `/admin/webhooks`, and `/admin/usage` are equivalent exclusion checks for their respective destinations.
**Sources**: `layout.tsx`; `src/lib/admin.ts`; `src/app/(authenticated)/_components/authenticated-navigation.tsx`.

### Steps

1. Open `/` and inspect navigation → the regular member sees primary destinations but no Admin navigation group.
2. Open `/admin` directly → not-found behavior conceals the administrative surface; do not expect a permission-request or self-upgrade button.
3. Open `/admin/workspaces` → the same layout protection prevents workspace records from rendering.
4. Return to `/` → regular workspace navigation remains usable.

### Variations

- Check `/admin/audit`, `/admin/webhooks`, and `/admin/usage` for the same absence of admin content without probing any records.
- Mobile: inspect the sidebar opened from the header for the same role-dependent visibility.

### Edge Cases

- An expired session may redirect to sign-in; that proves a different access branch from the non-admin not-found response.
- Framework-generated not-found wording is not prescribed by the route source; record observed wording later.
- Do not add the account to `ADMIN_PHONE_NUMBERS` merely to unlock subsequent stories.

## STORY-027: Read the system overview and compare usage scopes

<a id="story-027"></a>

**Provisional ID**: ADMIN-02

**Type**: medium
**Topic**: Admin oversight
**Persona**: Morgan, a designated development administrator reviewing synthetic system activity.
**Goal**: Understand system counts and inspect usage details without changing resources.
**Preconditions**: Existing designated admin test account and isolated synthetic operational data, or an empty isolated admin environment. Blocked when this role/fixture is unavailable.
**Ideal path**: 2 — open Admin overview and then Usage for per-workspace detail.
**Alternate paths**: Sidebar **Admin** opens `/admin`; header **Overview** opens the same page. Sidebar **Usage** and admin header **Usage** both open `/admin/usage`. Direct URLs are also supported.
**Sources**: `(overview)/_components/overview-dashboard.tsx`; `usage/_components/usage-table.tsx`; `_components/admin-shell.tsx`; `src/app/(authenticated)/_components/authenticated-navigation.tsx`.

### Steps

1. Select sidebar **Admin** → `/admin` displays **Admin overview** and **Cross-workspace operational status and recent system activity.**.
2. Wait through **Loading overview…** → inspect **Workspaces**, **Agents**, **Verified phone identities**, **Active conversations**, **Active API credentials**, and **Webhook endpoints**.
3. Inspect **Usage this month**, **Webhook delivery outcomes**, **Recent audit events**, and **Recent agent activity** → read only designated synthetic values.
4. Select **Usage** in the page header → `/admin/usage` displays **Workspace**, **Kind**, and **Quantity**.
5. Read the description **Usage aggregates by workspace and recorded usage kind. Top 50 by volume.** → distinguish this ranking from chat-level usage and the overview's monthly summary; do not assume identical denominators or periods.
6. Select header **Overview** → return to `/admin` and compare navigation with the equivalent sidebar route.

### Variations

- Empty data: overview cards/sections may show **No events yet.** or **No activity yet.**; usage shows **No usage events yet.**.
- Mobile: verify cards wrap and all table columns remain intelligible.

### Edge Cases

- Overview failure: **Unable to load overview.**; recent activity has its own **Unable to load recent agent activity.** alert.
- Usage failure: **Unable to load usage data.**, not a zero-use result.
- A summarized chat ID in Recent agent activity is plain table content in this source, not a chat link.

## STORY-028: Inspect a workspace lifecycle confirmation and dismiss it

<a id="story-028"></a>

**Provisional ID**: ADMIN-03

**Type**: medium
**Topic**: Admin oversight
**Persona**: Morgan, verifying which workspace a lifecycle action would affect before making a decision.
**Goal**: Read workspace status and inspect confirmation safely without applying a change.
**Preconditions**: Existing designated admin account plus a synthetic active or suspended workspace safe to inspect. No real-workspace state mutation is part of this walk. Blocked absent those fixtures.
**Ideal path**: 3 — find the workspace, open the lifecycle confirmation, and dismiss it.
**Alternate paths**: Sidebar **Workspaces**, admin header **Workspaces**, or direct `/admin/workspaces` all open the same table.
**Sources**: `workspaces/_components/workspace-table.tsx`; `_components/admin-shell.tsx`; `src/components/ui/dialog.tsx`.

### Steps

1. Open **Workspaces** → read **Workspace**, **Plan**, **Lifecycle**, **Members**, **Agents**, **Model tokens**, and **Action** for the designated synthetic workspace.
2. If necessary, select **Load more** → another cursor page loads; inspect whether the control's wording accurately reflects replacement versus accumulation of rows.
3. Select **Suspend** for an active fixture or **Reactivate** for a suspended fixture → **Confirm lifecycle change** opens and names the target/action.
4. Read the confirmation without pressing **Confirm** → verify the target matches the selected fixture.
5. Dismiss via the dialog close control or Escape → the confirmation closes and the original lifecycle remains unchanged.
6. Reopen **Workspaces** → inspect the same fixture state; do not perform an actual lifecycle transition.

### Variations

- Deleted or otherwise non-transitionable lifecycle: the row shows **No action**.
- Empty list: **No workspaces yet.** replaces rows.
- Only a separately authorized isolated mutation run may press Confirm: source expectation is **Saving…**, then dialog close and table refetch on success.

### Edge Cases

- Table read error: **Unable to load workspaces.**.
- A mutation fixture failure would show **Unable to update the workspace lifecycle.** inside the dialog; no mutation is needed for this primary story.
- A workspace without display name uses its ID in the table but **this workspace** in the confirmation copy; assess whether that leaves the target clear enough.

## STORY-029: Filter audit records for a designated workspace

<a id="story-029"></a>

**Provisional ID**: ADMIN-04

**Type**: medium
**Topic**: Admin oversight
**Persona**: Morgan, investigating a synthetic workspace's operational history.
**Goal**: Find the relevant audit events and clear the filter predictably.
**Preconditions**: Existing designated admin account with isolated audit fixtures and a known synthetic workspace ID. Populated/pagination branches are blocked if no matching fixtures exist.
**Ideal path**: 3 — open Audit log, enter the workspace ID, apply the filter.
**Alternate paths**: Sidebar **Audit log**, admin header **Audit log**, or direct `/admin/audit`. Overview **Recent audit events** repeats a summary but has no per-item drill-down link in the mapped source.
**Sources**: `audit/_components/audit-log-table.tsx`; `(overview)/_components/overview-dashboard.tsx`; `_components/admin-shell.tsx`.

### Steps

1. Open **Audit log** → inspect **When**, **Action**, **Workspace**, **Outcome**, and **Target**.
2. Enter the known fixture ID in **Workspace ID**, whose placeholder is **Filter by workspace ID** → the input changes but filtering is not yet submitted.
3. Select **Filter** → results use the trimmed ID and pagination resets.
4. If available, select **Load older events** → inspect the next cursor page of matching events.
5. Replace the input with `audit-nonexistent-workspace-2099` and select **Filter** → expect **No events yet.** when the query succeeds with no matches.
6. Clear the field and select **Filter** → remove the filter and reset its pagination; inspect only the isolated fixture environment's records.

### Variations

- Submit the form with Enter instead of the Filter button.
- Leading/trailing spaces around a valid fixture ID are trimmed before querying.
- Mobile: verify the ID input and Filter button fit and table data remains readable.

### Edge Cases

- Request failure displays **Unable to load audit events.**; do not confuse it with no matching events.
- No next cursor means **Load older events** is absent.
- Changing the text without submitting does not change the active filter; evaluate whether this is understandable.

## STORY-030: Inspect webhook delivery outcomes without dispatching work

<a id="story-030"></a>

**Provisional ID**: ADMIN-05

**Type**: short
**Topic**: Admin oversight
**Persona**: Morgan, checking whether designated synthetic webhook attempts succeeded.
**Goal**: Read delivery states and understand the manual action without sending anything.
**Preconditions**: Existing designated admin fixture and isolated empty or synthetic delivery records. Do not click Drain now against a real or unknown queue. Blocked absent a safe admin data environment.
**Ideal path**: 1 — open Webhooks and read recent delivery attempts.
**Alternate paths**: Sidebar **Webhooks**, admin header **Webhooks**, or direct `/admin/webhooks`. Overview **Webhook delivery outcomes** gives aggregates, not the detailed attempts table.
**Sources**: `webhooks/_components/webhook-deliveries.tsx`; `(overview)/_components/overview-dashboard.tsx`; `_components/admin-shell.tsx`.

### Steps

1. Open **Webhooks** → read **Recent delivery attempts and a controlled manual delivery drain.**.
2. Inspect **When**, **Event**, **Endpoint**, **Outcome**, **Attempt**, and **Response** for designated synthetic rows, or **No deliveries yet.** for a successful empty query.
3. Locate **Drain now** without activating it → identify that it initiates delivery work rather than refreshing the table. This completes the primary read-only story.
4. Return through header **Overview** → compare the summary **Webhook delivery outcomes** with the detailed attempts, noting their different levels of detail.

### Variations

- Synthetic outcomes can include delivered, pending, dead, and other warning-state labels.
- A separate explicit isolated dispatch fixture may exercise **Drain now**: source shows **Draining…**, disables the button, then presents a summary and refetches attempts. Such execution is not required for this audit.
- Mobile: inspect long synthetic endpoint URLs and whether truncation leaves enough context; keep any real destination out of evidence.

### Edge Cases

- Table request failure displays **Unable to load webhook deliveries.**.
- A separately authorized fixture drain failure would display **Unable to drain webhook deliveries.**.
- Missing HTTP response status renders an em dash; it is not a success status.
- There is no separate read-only Refresh control in this component. Do not use Drain now as a substitute.
