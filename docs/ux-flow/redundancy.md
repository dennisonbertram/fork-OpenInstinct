# Dashboard redundancy and information architecture critique

Date: 2026-09-05. Scope: local Jory dashboard at source `f11a3a1`. Evidence: [catalog](../ux-paths/catalog.md), [browser baseline](../ux-walker/preflight/baseline.md), [focused follow-up](../ux-walker/preflight/root-followup.md), all 15 images in `preflight/screenshots/`, and the relevant follow-up screenshots linked below. Images were opened and visually inspected during this critique. No browser actions, implementation changes, or issues were made by this critic.

The main simplification opportunity is to make conversation work easier to recognize and keep deployment details secondary. The repeated chat entrances mostly serve useful starting contexts. They do not justify removing navigation. The clearest measured extra action is the mobile sidebar staying open after a destination is selected; the highest-confidence hierarchy defect is conversation metadata displacing its title on mobile.

Counts below describe reviewed candidates, not independent confirmed defects: **3 duplicate-path groups, 3 repeated-information groups, 2 feature-overlap groups, and 4 hierarchy/IA findings**. Some findings intentionally overlap across sections. No use frequency, conversion rate, time saved, or whole-app step reduction was measured. Admin screens were not available and receive no rendered-screen critique.

## Duplicate Paths

### DP1. Keep the contextual new-chat entrances; use one name for the same action

**Observed:** Workspace offers **WebChat**, global navigation offers **Chat**, history offers **New chat**, and Tasks offers **Open chat**. Each entry appears in a different useful context. The catalog/source maps all four to `/chat`; screenshots establish their presentation, not a completed click-through for every branch. Evidence: [Workspace](../ux-walker/preflight/screenshots/workspace-desktop.png), [history](../ux-walker/preflight/screenshots/all-chats-desktop.png), [Tasks](../ux-walker/preflight/screenshots/tasks-desktop.png), [new-chat destination](../ux-walker/preflight/screenshots/chat-desktop.png); STORY-003, 007, 017, 018.

**Recommendation:** Keep the sidebar as the canonical persistent route and keep the history/empty-task shortcuts. Consider **New chat** for controls that always create a blank composer, and describe Workspace's web channel in surrounding copy instead of introducing a different product name. Decide whether **Open chat** accurately promises a new conversation rather than a previous one.

**Why not remove:** A shortcut beside a relevant empty state saves searching for global navigation. All chats' New chat distinguishes creation from its conversation rows. These are shared destinations, not competing implementations. No step-saving claim is attached to a naming change.

### DP2. Keep Jory home and Workspace navigation

**Observed:** The Jory wordmark/character sits above the **Workspace** navigation item. STORY-003 and `layout.tsx` establish that both return to `/`. Evidence: [desktop Workspace](../ux-walker/preflight/screenshots/workspace-desktop.png).

**Recommendation:** Keep both. A brand-home convention and an explicitly named destination are complementary. The header is visually modest and the navigation item provides an active-state anchor. No demonstrated confusion warrants removing either or the distinctive character.

### DP3. Preserve Vault import/setup shortcuts as shortcuts to one owner

**Observed:** The empty Logins sheet has **Bulk import** and **Add login**, which initiate different input methods. Source/catalog additionally defines `/vault?import=chrome` and agent-provided setup links. Only the sheet itself is visually observed here. Evidence: [Logins sheet](../ux-walker/preflight/screenshots/vault-logins-mobile.png); STORY-022/024.

**Recommendation:** Keep direct links as shortcuts to the same category flow. Do not consolidate Bulk import and Add login into an ambiguous action. Ensure labels and outcomes remain consistent across direct and category entry; the deep-link behavior still needs its own walk evidence.

## Duplicate Information

### DI1. Conversation usage belongs below the conversation identity on narrow screens

**Observed:** All chats shows aggregate usage beneath its heading and per-chat usage on each row. The single-record screenshot happens to repeat the same values, but the underlying scopes differ. On mobile, usage and date remain prominent while the conversation title truncates to **Reply with ex...** and the card extends past its content area. Evidence: [desktop history](../ux-walker/preflight/screenshots/all-chats-desktop.png), [mobile history](../ux-walker/preflight/screenshots/all-chats-mobile.png), [baseline geometry account](../ux-walker/preflight/baseline.md); STORY-016.

**Recommendation:** Keep the workspace total in the page summary; make the row title the first full-width line and put date/usage on a quieter second line at narrow widths. Do not delete the per-chat metric solely because a one-chat fixture matches the aggregate. If the product later determines cost is rarely needed, defer it to conversation detail—but frequency evidence is currently absent.

**Measured versus proposed:** The baseline measured a 21.5px extension beyond the content section and 5.5px beyond the 390px viewport. This critic visually confirmed the clipped row. A stacked layout is a proposal; its usability improvement has not been tested.

### DI2. Vault category counts and in-dialog empty states each have a purpose

**Observed:** Vault says **No saved logins** on the category card; after opening it, the sheet says **Add your first saved login.** and **No saved logins yet.**. Evidence: [Vault mobile](../ux-walker/preflight/screenshots/vault-mobile.png), [Logins sheet](../ux-walker/preflight/screenshots/vault-logins-mobile.png); STORY-022/023.

**Recommendation:** Keep category counts because they let the user scan without opening every category. In the empty sheet, one clear empty explanation plus **Add login** is enough; the subtitle and central empty sentence could be combined when convenient. This is optional copy reduction, not a blocking flow problem.

**Boundary:** The sheet's Add login is partly covered by the development Agentation control in this capture. That overlay is not evidence of a production duplication or an app-owned footer defect.

### DI3. Keep diagnostic summaries scoped; do not merge unobserved detail screens

**Observed:** The local chat's optional Activity panel includes **Usage**, **Tasks**, **No tasks yet**, and **Show full trace**. The global Tasks route is a separate workspace history view. Evidence: [chat follow-up](../ux-walker/preflight/chat-followup.png), [empty Tasks](../ux-walker/preflight/screenshots/tasks-desktop.png); STORY-020. Admin usage/audit/webhook repetition is source-only and blocked by role prerequisites.

**Recommendation:** Keep conversation-local diagnostics distinct from workspace-wide history and label their scope when ambiguous. Do not infer that a populated trace table repeats all useful chat context—the populated state was unavailable. No deletion of admin navigation or summary cards is recommended from unseen screens.

## Overlapping Features

### OF1. Differentiate Personal info from Vault Contact info and Addresses at the point of choice

**Observed:** Personal info has **Identity and contact** and **Mailing address** sections. Its introductory copy says the agent/browser worker can use those values directly and directs passwords/payment details to Vault. Vault independently offers **Addresses** and **Contact info** but its overview gives no matching explanation of their different purpose. Evidence: [Personal info desktop](../ux-walker/preflight/screenshots/personal-info-desktop.png), [Personal info mobile](../ux-walker/preflight/screenshots/personal-info-mobile.png), [Vault desktop](../ux-walker/preflight/screenshots/vault-desktop.png); STORY-021/023.

**Recommendation:** Preserve the separate data/handling contracts. Add a short explanation on Vault or its overlapping category entry explaining when to save a separate protected contact/address versus edit Personal info. Use the actual project's contract; do not invent a unified profile or silently synchronize values. The location of the distinction matters: the user deciding from Vault should not need to remember explanatory prose on another page.

**Unknown:** No populated account comparison or real user confusion was observed. This is a supported ambiguity risk, not proof that users duplicate their data. A future test should ask a new user where they would put their own mailing address and why.

### OF2. Keep manual login creation and bulk import distinct

**Observed/source:** Logins exposes two adjacent actions. Catalog shows manual entry supports passwordless email/phone scenarios, while import accepts password CSV records. Evidence: [Logins sheet](../ux-walker/preflight/screenshots/vault-logins-mobile.png); STORY-022/024.

**Recommendation:** Keep both, with Add login as the visually primary action for this empty single-user category. There is no evidence that a wizard choosing between input methods would reduce steps or decisions. Do not merge these into a generic Import/Add modal merely to reduce the visible button count.

## Hierarchy & IA

### IA1. Selecting a mobile destination should also reveal it

**Observed in follow-up:** Selecting All chats changed the route and active item while the mobile navigation sheet remained over the destination. A second reproduced selection of Tasks did the same; Escape revealed the page. Screenshots were visually reviewed: [All chats after selection](../ux-walker/preflight/mobile-nav-after-click.png), [Tasks after selection](../ux-walker/preflight/mobile-nav-tasks-overlay.png). The [follow-up log](../ux-walker/preflight/root-followup.md) and `mobile-navigation.webm` supply the action/settling evidence; a still image alone would not prove the sequence.

**Recommendation:** Close the mobile sheet when a primary navigation destination is selected. Preserve normal desktop navigation behavior.

**Measured scope:** One extra manual dismissal in each of the two documented mobile transitions. This is not a measured average for all routes/users. The proposed fix would remove that extra action for the reproduced route transitions, subject to regression verification. This is a functional flow change, not a purely visual cleanup.

### IA2. Use one customer-facing term for browser task history

**Observed:** Mobile header and sidebar say **Tasks**, but the heading says **Browser traces**; the empty sentence uses both traces and browser task. The page contains an execution history table rather than a general to-do list. Evidence: [Tasks mobile](../ux-walker/preflight/screenshots/tasks-mobile.png), [Tasks desktop](../ux-walker/preflight/screenshots/tasks-desktop.png); STORY-018/020.

**Recommendation:** Consider **Browser tasks** consistently in navigation and page heading, with a short explanation that this is history. Reserve **Trace events** for detailed diagnostics. This is a label proposal, not a request to introduce a task editor or rename internal records.

**Separate walker defect:** The mobile table headings visibly collide and the empty guidance clips. A simpler empty state can render its guidance outside the table until records exist. Populated mobile presentation needs a real fixture before choosing between stacked rows and horizontal table scrolling.

### IA3. Separate the member's next action from deployment setup detail

**Observed:** Workspace starts with Channels and offers WebChat prominently, which is useful. Below it, Google/Square rows tell the user that a deployment admin must attach an OAuth connector in Vercel Connect. Infrastructure lists **Kernel browser**, **Vercel Blob**, and **AI Gateway model** with the model chooser. On mobile the two nearly identical setup paragraphs wrap into narrow blocks beside status badges, and the model section extends below the first viewport. Evidence: [Workspace desktop](../ux-walker/preflight/screenshots/workspace-desktop.png), [Workspace mobile](../ux-walker/preflight/screenshots/workspace-mobile.png); STORY-006/008/009.

**Recommendation:** Keep the useful Channels entry and service connection status. For unavailable connectors, state the member-facing result briefly and put deployment-specific instructions behind a **Setup details** disclosure or in existing operator documentation. Consider grouping provider infrastructure under a collapsed **Technical settings** area while keeping the model choice reachable if it remains a user capability. Do not create a new settings page or change permissions just to achieve this visual distinction.

**Proposal limits:** This would reduce initial-page technical prose, not necessarily clicks for model selection. It may add a disclosure action for operators. No role usage frequency or time-to-value metric is available, so the tradeoff should be reviewed rather than advertised as a universal reduction.

**Important truth issue:** Catalog/source identifies the Kernel Connected state as unconditional; the visible badge should not be treated as measured health. Any future copy change must preserve that distinction.

### IA4. Preserve the chat welcome hierarchy and optional profile completion

**Observed:** The new-chat screen has a clear prompt, large composer, one dominant submit control, and three subordinate starter chips that reflow cleanly on mobile. Evidence: [desktop chat](../ux-walker/preflight/screenshots/chat-desktop.png), [mobile chat](../ux-walker/preflight/screenshots/chat-mobile.png), [focused starter draft](../ux-walker/preflight/chat-starter.png). There is no setup wizard blocking the composer.

**Recommendation:** No structural simplification is needed for the welcome screen. Preserve the Jory character/wordmark and simple conversational entry. Do not move profile or connector setup ahead of first chat simply because they exist elsewhere in the dashboard.

**Profile follow-up:** Personal info's Save is reachable after scrolling, as visually confirmed in [settled Save screenshot](../ux-walker/preflight/personal-save-reachable.png) and the follow-up log. The earlier unchanged 'bottom/save' captures do not justify calling the form blocked. Whether optional mailing address fields should be collapsed is a future product choice; no actual abandonment or scrolling failure was measured.

## Synthesis handoff

Prioritize the observed mobile navigation dismissal and conversation-title hierarchy, then align the browser-task naming. Treat Workspace's deployment prose and Personal info/Vault distinction as design proposals requiring a scoped follow-up, not automatic fixes. Keep contextual new-chat shortcuts, the brand/home route, manual/import choices, and the successful welcome-screen hierarchy. Admin redundancy remains unassessed visually; populated traces, grants, import, and profile/vault relationship need appropriate fixtures before stronger conclusions.
