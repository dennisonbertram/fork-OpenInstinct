# Jory Product Component Catalog

Source: `/Users/dennison/develop/jory/apps/web/src` (read-only, not edited). All values quoted from source or resolved via `src/lib/design-tokens.ts`. Anything not stated in the code is marked "not specified." Hex literals not present in `design-tokens.ts` are flagged **OFF-TOKEN**.

## Design tokens (`src/lib/design-tokens.ts`)

```
colors: bg #FAF7F0, ink #071B36, ink2 #16233B, muted #E6E6E6, mutedInk #5A6A82,
  joryJ #4434E8, joryO #F7B313, joryR #7467E8, joryY #FF5A32,
  mustard #D4A72C, skin #F4A261, cta #061A33, ctaHover #0F2A4D,
  softPurple #EDE8FF, softYellow #FFF1CF, softGreen #E9F8E8, softRed #FFE7DF,
  bubbleUser #F1F5F9, bubbleJory #E0E7FF,
  accentIndigo #4F46E5, accentOrange #F97316, accentGreen #22C55E
typeScale: display 96px, hero 240px, h1 56px, h2 36px, h3 24px, bodyLg 20px, body 16px, caption 14px, micro 12px
lineHeights: tight 1.02, display 1.08, heading 1.15, body 1.5
letterSpacing: hero -0.04em, display -0.03em, heading -0.02em, body 0em, caps 0.08em
fontWeights: regular 400, medium 500, semi 600, bold 700, extra 800, black 900
spacing: s1 4px, s2 8px, s3 12px, s4 16px, s5 24px, s6 32px, s7 48px, s8 64px, s9 96px, s10 128px, container 1200px, gutter 24px
radii: input 12px, card 16px, bubble 18px, pill 999px
shadows: card "0 2px 10px rgba(0,0,0,0.04)", cardHover "0 6px 20px rgba(0,0,0,0.06)", float "0 12px 40px rgba(7,27,54,0.10)"
motion: fast 120ms, base 180ms, slow 280ms, ease cubic-bezier(0.2,0.7,0.2,1)
```

Note: several files reference CSS custom properties (`var(--color-ink)`, `var(--radius-pill)`, `var(--shadow-card)`, etc.) rather than the TS token object directly. These vars are presumed (by name match) to mirror `globals.css`, which was out of scope for this pass — recorded as "presumed" below, not independently verified against `globals.css`.

Verification (2026-09-03, after the pass): `apps/web/src/app/globals.css` defines the same values in its `@theme` block (`--color-bubble-jory: #E0E7FF`, `--color-bubble-user: #F1F5F9`, `--color-accent-green: #22C55E`, `--color-accent-orange: #F97316`, `--radius-card: 16px`, `--shadow-card: 0 2px 10px rgba(0,0,0,.04)`). Every "presumed" value below matches.

---

# 1. Dashboard shell and Overview (`app/dashboard/`)

## DashboardShell

File: `dashboard-shell.tsx`. Purpose: app chrome — sidebar nav + topbar + content area, wraps every `/dashboard/*` page.

- Layout: root `display:flex`, `minHeight:100dvh`. Sidebar `width:220px`, `flexShrink:0`, `padding: 24px 16px` (s5 s4), `gap:32px` (s6), column flex. Content `padding:32px` (s6), `flex:1`, `overflowY:auto`.
- Colors: page `background: colors.bg` #FAF7F0, `color: colors.ink` #071B36. Sidebar `borderRight: 1px solid colors.muted` #E6E6E6. Topbar `borderBottom: 1px solid colors.muted`.
- Type: wordmark "Jory" — 24px, `fontWeights.extra` 800. Nav link — `fontWeights.medium` 500, color `colors.mutedInk` #5A6A82 (no explicit size, inherits). Active nav link — color `colors.ink`, background `colors.softPurple` #EDE8FF. Business name (topbar) — 18px, `fontWeights.semi` 600. Role chip — 14px, `fontWeights.medium`.
- Shape: nav link `borderRadius: radii.input` 12px. Role chip `borderRadius: radii.pill` 999px, background `colors.softYellow` #FFF1CF, `padding: 4px 16px` (s1 s4).
- States: nav link active = background `softPurple` + ink text (vs. default `mutedInk` text, transparent bg).
- Responsive (`RESPONSIVE_STYLES`, `max-width:768px`): sidebar becomes a horizontal row (`flex-direction:row`, `border-right:none`, `border-bottom:1px solid muted`, `gap:16px`); nav becomes horizontally scrollable (`overflow-x:auto`, `container-type: scroll-state`); nav links get `padding-left/right:22px` and don't shrink; a sticky right-edge gradient fade (`.dashboard-shell-nav-fade`, 48px wide, `linear-gradient(to right, transparent, colors.bg)`) becomes visible only while `@container scroll-state(scrollable: right)` matches (pure-CSS scroll affordance, no JS); main column `min-width:100%`.
- Implementation: inline `React.CSSProperties` + one literal `<style>` tag for the media/container-query block. No off-token colors.

## OverviewView (`overview-view.tsx`)

Purpose: `/dashboard` home — 3 summary tiles, optional by-location grid, "Needs follow-up" list, "Recent activity" list.

- **Summary tiles** (`styles.tile`): flex row, `gap:24px` (s5), wrap; each tile `padding:24px` (s5), `minWidth:160px`, `borderRadius: radii.card` 16px, `boxShadow: shadows.card`. Background: Ready/Unsigned-policies tiles `colors.softPurple`; "Needs follow-up" tile conditional — `colors.softRed` #FFE7DF if count > 0, else `colors.softGreen` #E9F8E8. Value text 36px/`fontWeights.extra`(800); label `colors.mutedInk`/`fontWeights.medium`.
- **By-location grid** (owner-only, when present): flex-wrap tiles, `gap:16px` (s4), `background: colors.bg`, `borderRadius: radii.input` 12px, `padding:16px`; name `fontWeights.semi`, counts `colors.mutedInk`/14px.
- **Needs-follow-up list**: rows `background: colors.bg`, `borderRadius: radii.input`, `padding:16px` (s4). Row title 14px/`semi`; StatusPill inline; detail line `colors.mutedInk`/13px; "Evidence" side-link `colors.accentIndigo` #4F46E5, `fontWeights.medium`/14px, separated by `borderLeft:1px solid colors.muted`. Disclosure line above list (`NUDGE_DELIVERY_DISCLOSURE`): "Nudges sent from the dashboard don't currently reach the employee's phone." — `colors.mutedInk`/14px.
  - **Empty state**: title "You're all caught up" (`fontWeights.semi`/16px) + body "No one needs a nudge right now — training and policy sign-offs are current." (`colors.mutedInk`).
- **Recent activity list**: row `flex justify-between`, `padding: 8px 0` (s2), `color: colors.ink2` #16233B. Linked rows `colors.accentIndigo`/`medium`; unlinked rows render plain text (never a dead 404 link). Time column `colors.mutedInk`/14px, `whiteSpace:nowrap`, via `formatRelativeTime` ("2h ago" / "3d ago" / "just now", clock-skew-safe).
  - **Empty state**: "Nothing to show yet — activity will show up here as it happens." (`colors.mutedInk`).
- Card wrapper (shared by both list sections): `background:#fff` **OFF-TOKEN**, `borderRadius: radii.card`, `padding:24px`, `boxShadow: shadows.card`; title 18px/`semi`, `marginBottom:16px`.
- Implementation: 100% inline style objects.

## StatusPill (`status-pill.tsx`)

Purpose: the single shared status/badge component used by Overview, Evidence, Team roster, and Chat capability cards.

- Layout: `padding: 4px 12px` (s1 s3), `borderRadius: radii.pill` 999px, `whiteSpace:nowrap`, `fontSize:13px`.
- Tone table (all background/text resolved):
  | status                                       | background                  | text                      | weight     |
  | -------------------------------------------- | --------------------------- | ------------------------- | ---------- |
  | overdue                                      | `colors.joryY` #FF5A32      | `#FFFFFF` **OFF-TOKEN**   | semi 600   |
  | pending                                      | `colors.softYellow` #FFF1CF | `colors.ink` #071B36      | medium 500 |
  | check_failed                                 | `colors.softRed` #FFE7DF    | ink                       | medium     |
  | manager_review                               | `colors.softPurple` #EDE8FF | ink                       | medium     |
  | blocked                                      | `colors.muted` #E6E6E6      | `colors.mutedInk` #5A6A82 | medium     |
  | acknowledged / completed / ready / published | `colors.softGreen` #E9F8E8  | ink                       | medium     |
  | cancelled / draft                            | `colors.muted`              | mutedInk                  | medium     |
  | needs_follow_up                              | `colors.softRed`            | ink                       | medium     |
  | fallback (unknown)                           | `colors.muted`              | mutedInk                  | medium     |
- States: tone selection _is_ the state mechanism — one fixed visual per backend status string; `overdue` is the only solid/high-urgency treatment, everything else is a soft tint.
- Label text sourced from `statusLabel()` in `status-labels.ts` (one vocabulary module: `pending`→"Pending", `overdue`→"Overdue", etc.; unknown values are humanized snake_case → Title Case rather than shown raw).

## EvidenceItemsTable (`evidence-items-table.tsx`)

Purpose: the one canonical per-employee record table (Item / Status / Received / Acknowledged / Completed); reused verbatim by both the Evidence page and Chat's onboarding-status capability card.

- Card: `background:#fff` **OFF-TOKEN**, `borderRadius:radii.card` 16px, `padding:24px`, `boxShadow:shadows.card`.
- Table: `width:100%`, `borderCollapse:collapse`. `th`: `textAlign:left`, `padding:12px` (s3), `color:colors.mutedInk`, `fontWeight:medium`, `fontSize:14px`, `borderBottom:1px solid colors.muted`. `td`: `padding:12px`, `borderBottom:1px solid colors.muted`.
- In-row markers: "In today's needs-follow-up list" and "Nudged {x} ago" (`formatLastNudgeAt`, from `nudge-marker.ts`) — `display:block`, `marginTop:4px` (s1), `colors.mutedInk`/13px. Nudge/Review deep-link — `colors.accentIndigo`/`medium`/14px, `display:inline-block`, `marginTop:8px`; **suppressed** (not disabled — removed) for 24h after a nudge via `isRecentlyNudged`.
- **Empty state**: "Nothing assigned yet" (`semi`/16px) + "Once training or policies are assigned, proof shows up here." (`mutedInk`).
- Implementation: inline styles.

---

# 2. Dashboard: Account, Chat, Handbook (`app/dashboard/{account,chat,handbook}/`)

## Account page

- **AccountView page wrapper**: flex column, `gap:24px` (s5), `maxWidth:560px`.
- **Info card** (Business / My role / Locations, 3 repeats): `padding:24px`, `background:#fff` **OFF-TOKEN**, `borderRadius:radii.card` 16px, `boxShadow:shadows.card`. Title 16px/`semi`; value 18px/`semi`; detail lines `colors.mutedInk`, `marginTop:4px`. Empty state: "No locations assigned." List items `colors.ink`, `gap:4px` (s1).
- **Read-only notice**: "Read-only — text Jory to change this." (same `detail` style, `mutedInk`).
- **Logout button**: `padding:8px 24px` (s2 s5), `background:#fff` **OFF-TOKEN**, `color:colors.ink`, `border:1px solid colors.muted`, `borderRadius:radii.pill`, `fontWeight:medium`. No hover/active/disabled styling coded.

## Chat (`chat/chat-view.tsx`, `capability-card.tsx`, `capability-renderers.tsx`)

Chat is the only surface mixing Tailwind (page/composer/message shell, via `@/components/ai-elements/*` + CSS vars) with inline-styled capability-result bodies.

- **ChatView shell**: `flex h-[calc(100vh-160px)] min-h-[480px] flex-col gap-3 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)]` → height `calc(100vh-160px)`, min-height 480px, radius 16px (presumed `radii.card`), padding 16px, gap 12px, background white.
- **Empty state** (`ConversationEmptyState`): title "Ask Jory anything", description "Check readiness, nudge a teammate, or search what's been taught."
- **Suggestions row** (empty state only): 4 chips from `SUGGESTED_PROMPTS` ("Who needs training this week?", "Nudge everyone with unsigned policies", "What's changed since yesterday?", "Search what's been taught about closing") via the `Suggestion` primitive, plus one `Button variant="outline" size="sm"` pill "Teach Jory a procedure" linking to `/dashboard/knowledge`.
- **ThinkingMessage** (loading, `status==="submitted"`): assistant bubble containing `Shimmer` with text "Thinking…" (Shimmer = animated gradient-text sweep, 2s linear infinite, see ai-elements section).
- **Chat submit error banner**: `rounded-[var(--radius-input)] bg-[var(--color-soft-red)] px-3 py-2 text-sm text-[var(--color-ink)]` → radius 12px, background `softRed` #FFE7DF, text `ink`, 14px; "Try again" pill button (`bg-white`, `border-[var(--color-muted)]`, 12px medium); conditional sub-note (12px, `mutedInk`) when the failed turn had attachments: "Attachments aren't sent again — they may already be saved as knowledge drafts. Re-attach them if your message needs them."
- **Upload error banner**: same treatment (`softRed` bg, `ink` text, radius 12px), copy from `FRIENDLY_UPLOAD_ERRORS` map.
- **AttachmentPreviews chip**: `rounded-[var(--radius-pill)] bg-[var(--color-soft-purple)] px-3 py-1 text-xs text-[var(--color-ink)]` — pill, `softPurple` #EDE8FF bg, `ink` text, 12px; `{filename} ×`; empty state = renders nothing.
- **ChatMessage bubble** (`Message`/`MessageContent`): user variant `group-[.is-user]:bg-[var(--color-bubble-user)] rounded-[var(--radius-bubble)]` → `bubbleUser` #F1F5F9, radius 18px. Assistant variant `group-[.is-assistant]:bg-[var(--color-bubble-jory)] rounded-[var(--radius-bubble)] px-4 py-3` → `bubbleJory` #E0E7FF, radius 18px, padding 16px/12px.
- **CopyAction** (hover-reveal copy button on assistant turns): `opacity-0 transition-opacity group-hover:opacity-100` (hidden until parent hover); `CheckIcon`/`CopyIcon` at `size-3.5` (14px); shows check for 1500ms after copy.
- **PromptInput composer**: textarea `aria-label="Message Jory"` placeholder "Message Jory"; accepts `image/*,audio/*,video/*,application/pdf,text/plain`, max 3 files; attach button wraps `PaperclipIcon size-4` (16px), tooltip "Attach a file".

### Capability-card bodies (rendered inside chat turns; `chat/capability-card.tsx`)

- **CapabilityCard outer shell**: `Artifact` primitive, `border-[var(--color-muted)] bg-white`.
- **ReadinessTable**: `flex flex-col gap-4` wrapping optional `MiniBarChart` + `<table className="w-full border-collapse text-sm">`; header cells `text-[var(--color-muted-ink)] font-medium`, `border-b px-2 py-1 text-left`; status-like columns render `StatusPill`. Falls back to `PrettyValue` for malformed shapes.
- **MiniBarChart** (a status-count breakdown, implemented as divs not `<svg>`, `role="img"`): row `flex items-center gap-2 text-xs`; label `w-24 shrink-0 truncate text-[var(--color-muted-ink)]`; track `h-4 flex-1 bg-[var(--color-muted)] rounded-[var(--radius-pill)] overflow-hidden`; fill from a **local literal palette, all OFF-TOKEN**: `CHART_COLORS = ["#6C5CE7","#00B894","#FDCB6E","#E17055","#0984E3","#D63031"]`; value `w-6 text-right font-medium`. Bar width floors at 4% of max even for near-zero values.
- **KnowledgeItemCard**: `flex flex-col gap-1 text-sm`; delegates array `results` to a memory-search-results list; status line `text-[var(--color-muted-ink)]`.
- **ActionProposalCard** (Yes/Cancel confirm flow — states `pending | confirming | done | error | cancelled`):
  - Buttons row `flex items-center gap-2`. Confirm: `rounded-[var(--radius-pill)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50`, background `bg-[var(--color-destructive)]` when `payload.danger===true` else `bg-[var(--color-ink)]` — **`--color-destructive` has no value defined in files read; flagged unresolved/OFF-TOKEN-risk**. Cancel: outline pill, `border-[var(--color-muted)]`.
  - Disabled state = `disabled:opacity-50` on both buttons while `confirming`; label swaps "Yes, do it" → "Working…".
  - Done: reply text `text-[var(--color-ink)]`; optional "View team" link (`text-xs font-medium text-[var(--color-muted-ink)] underline`) for roster-mutating intents; nested `CapabilityCard`s for `state.results`.
  - Cancelled: "Cancelled -- nothing was changed." (`text-sm text-[var(--color-muted-ink)]`).
  - Error: message `text-[var(--color-ink)]` + "Try again" outline pill button re-invoking confirm.
- **PrettyValue** (generic fallback): object → `<dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">`, key `font-medium text-[var(--color-muted-ink)]`; non-object → `<pre className="whitespace-pre-wrap text-sm">`.

### Chat capability-renderers (`chat/capability-renderers.tsx`, inline-styled, purpose-built payload views)

- **ReadinessResult tiles + list**: reuses the Overview tile pattern (`softPurple` "Ready" tile, conditional `softRed`/`softGreen` "Needs follow-up" tile, both `radii.card`/`shadows.card`, value 28px/`extra`); row list `radii.input`, background `colors.bg`. Empty: "No one needs training this week — everyone's ready."
- **Nudge confirmation**: single line, `colors.ink`/14px: "1 nudge sent by text." / "{n} nudges sent by text."
- **Memory-search-results list**: rows `radii.input`, `background:colors.bg`, title 14px/`semi`, type label 12px/`medium` uppercase-adjacent, detail 13px `mutedInk`, snippet truncated at 140 chars + "…". Empty: "Nothing taught about that yet." + "Teach it in Knowledge" link.
- **Onboarding-status rows**: delegates entirely to `EvidenceItemsTable` (no local styling).

## Handbook (`handbook/handbook-view.tsx`)

- **Empty state** (no handbook or no sections): card (`#fff` **OFF-TOKEN**, `radii.card`, `shadows.card`, `padding:24px`); title "Nothing taught yet" (`semi`/16px); body "Text Jory about how you run things -- opening, closing, how you make things -- and your handbook will start showing up here, section by section." (`mutedInk`, `marginTop:8px`).
- **Header**: title (from `handbook.title`) 22px/`semi`; subtitle (`statusLine()`: "Published · version N" / "Unpublished changes since version N" / "Not yet published") 14px `mutedInk`; rollup line ("3 of 5 sections complete") 15px/`medium`, shown only pre-publish with ≥1 applicable section.
- **Export control** (published): "Download PDF" button, `background:colors.cta` #061A33, text `#fff` **OFF-TOKEN**, `radii.pill`, `medium`; states — `idle` enabled; `busy` = `disabled` (no visual busy indicator beyond the disabled attribute, no spinner); `failed` → error text "Export failed — try again." in `#B3261E` **OFF-TOKEN**/13px; `unpublished` (404) → falls back to PublishHint instead of showing the button.
- **PublishHint** (unpublished): `maxWidth:220px`, `textAlign:right`, 13px. Non-owner: "Ask the owner to publish, or text Jory, to enable a PDF export." Owner: linked "Publish the handbook" (`colors.accentIndigo`/`medium`) + " to enable a PDF export."
- **SectionCard**: card (`#fff` **OFF-TOKEN**, `shadows.card`, `padding:24px`); title 18px/`semi`; status badge `radii.pill`, `padding:4px 12px`, 13px/`medium`:
  | status                      | background           | text     |
  | --------------------------- | -------------------- | -------- |
  | empty ("Not started")       | `colors.muted`       | mutedInk |
  | drafting ("In progress")    | `softYellow` #FFF1CF | ink      |
  | incomplete ("Needs review") | `softRed` #FFE7DF    | ink      |
  | ready ("Complete")          | `softGreen` #E9F8E8  | ink      |
  | not_applicable              | `colors.muted`       | mutedInk |
  - Note text ("No steps recorded yet." / not-applicable reason) — `mutedInk`/14px.
- **StepRow** (ordered list, `paddingLeft:24px`): step text inherits body; source-attribution line 13px `mutedInk` (e.g. "From {title} · seen & heard · at 02:14"), omitted when no source fields exist.
- **Open-gap notice**: `background:softRed`, `color:ink`, `radii.input` 12px, `padding:12px`, 14px: "Jory couldn't confirm: {question}" (one `<p>` per gap, no bullets).

**Off-token inventory, this section:** `#fff` (account card/logout, handbook empty/section cards/export text) ×~6; `#B3261E` (handbook export error, knowledge error — see §3); 6 `CHART_COLORS` hex literals; unresolved `--color-destructive` var.

---

# 3. Dashboard: Knowledge, Team, Evidence (`app/dashboard/{knowledge,team}/`)

All 8 files in this area are **100% inline `React.CSSProperties`** — no Tailwind, no CSS modules, no `components/ui` imports anywhere.

## Knowledge (`knowledge/knowledge-view.tsx`)

- Page: flex column, `gap:32px` (s6).
- **Card** (Draft queue / Published / In your Handbook / Add knowledge, ×4): `padding:24px`, `background:#fff` **OFF-TOKEN**, `radii.card` 16px, `shadows.card`. Title (`<h2>`) 18px/`semi`, `marginBottom:16px`.
- **Item row**: `flex justify-between align-center`, `padding:16px`, `background:colors.bg`, `radii.input` 12px. Title `semi`; detail line 14px `mutedInk` (`memoryType · visibility`); optional `EnrichmentSummary` block (Aliases/Keywords/Answers, up to 3 lines, `marginTop:8px`, `gap:2px`; renders nothing when all three arrays are empty).
- **Publish button**: `padding:8px 16px`, `background:colors.cta`, text `#fff` **OFF-TOKEN**, `radii.pill`, `medium`; no coded disabled visual (button carries no `disabled` prop).
- **Handbook link** ("View in Handbook →"): `colors.ink`/`semi`, `textDecoration:none`.
- **Add-knowledge form**: flex column `gap:8px`; label `medium`/14px/`mutedInk`; text input/textarea `padding:12px`, `border:1px solid colors.muted`, `radii.input`, `fontSize:16px` (file input permanently `disabled` — `UPLOADS_AVAILABLE=false` constant); uploads-unavailable note 14px `mutedInk` + link (`ink`/`medium`) to Chat, shown unconditionally today. Submit button `padding:8px 24px`, `background:cta`, text `#fff` **OFF-TOKEN**, `radii.pill`; `disabled={!text.trim()}`, no distinct disabled visual style, `cursor:pointer` set unconditionally regardless of disabled state. Confirmation text "Added to your draft queue" (14px `mutedInk`). Error text "Couldn't add that — try again." — `#B3261E` **OFF-TOKEN**/14px.

## Team (`team/team-view.tsx`, `team-roster-client.tsx`)

- **Empty state** ("No team members yet"): shared card style; title `semi`/16px, body `mutedInk`.
- **Card**: `padding:24px`, `background:#fff` **OFF-TOKEN**, `radii.card`, `shadows.card`.
- **Header row**: `flex justify-end`, "Add employee" deep-link (`colors.accentIndigo`/`medium`/14px, `textDecoration:none`) into Chat's propose/confirm flow.
- **Roster rollup note**: 13px `mutedInk`: "Counts roll up each person's assignments and sign-offs — open a name for the item-by-item Evidence record."
- **Controls bar**: flex `gap:16px`, wraps: search input (`type="search"`, `padding:8px 12px`, `border:1px solid colors.muted`, `radii.input`, 14px, `minWidth:220px`) and an "Only needs follow-up" toggle (native unstyled checkbox + label, `colors.ink`/`medium`/14px).
- **Empty/no-match states**: "No one named "<query>"." vs. "No one needs follow-up right now — you're all caught up." (`mutedInk`).
- **Table**: `width:100%`, `borderCollapse:collapse`. `th` `mutedInk`/`medium`/14px, `borderBottom:1px solid muted`. `td` `borderBottom:1px solid muted`. Name link `colors.ink`/`semi`, `textDecoration:none`. Follow-up column: `StatusPill status="needs_follow_up"` rendered only when `member.needsFollowUp` is true.

## Evidence view (`team/[membershipId]/evidence-view.tsx`)

- Page: flex column, `gap:24px`.
- **Header**: employee name `<h2>` 22px/`semi`, "Print record" button (`window.print()`), `padding:8px 16px`, `background:cta`, text `#fff` **OFF-TOKEN**, `radii.pill`, `medium`.
- **Disclosure line** (conditional on any in-view nudge): `mutedInk`/14px, the same `NUDGE_DELIVERY_DISCLOSURE` text as Overview.
- **Print media rule** (the only `@media` in these 8 files, a plain tag not the `RESPONSIVE_STYLES` pattern):
  ```css
  @media print {
    nav,
    header,
    .evidence-export-header button {
      display: none !important;
    }
  }
  ```
  Hides nav, any header, and the print button itself when printing.
- Body table = `EvidenceItemsTable` (§1).

**Off-token inventory, this section:** `#fff` ×5 (Knowledge card, Knowledge publish/submit button text, Team card, Evidence print button text, EvidenceItemsTable card), `#FFFFFF` (StatusPill overdue text), `#B3261E` (Knowledge error text).

---

# 4. Login / Verify (`app/login/`, `app/login/verify/`)

Both screens are **100% inline style objects** — no CSS module, no Tailwind, no `components/ui` import.

## Login (`login-client.tsx`)

- **Page wrapper**: `minHeight:100dvh`, flex-centered, `padding:24px`, `background:#FAF7F0` (= `colors.bg`, exact).
- **Card**: `width:100%`, `maxWidth:420px`, `padding:32px`, `background:#ffffff` **OFF-TOKEN**, `border:1px solid rgba(7,27,54,0.08)` (ink-derived), `borderRadius:16px` (= `radii.card`), `boxShadow:"0 1px 2px rgba(7,27,54,0.04)"` (custom — does not match any of `shadows.card/cardHover/float` verbatim).
- **Heading**: "Log in to Jory" / "Check your phone" — `fontSize:28px` (off-scale, between h3 24 / h2 36), `fontWeight:700` (= bold), `color:#071B36` (= ink), `margin:"0 0 12px"`.
- **Body copy**: `fontSize:16px` (= body), `lineHeight:1.5` (= `lineHeights.body`), `color:#5A6A82` (= mutedInk), `margin:"0 0 20px"` (20px, not an exact spacing token).
- **Session-expired banner** (`role="status"`, shown only when `returnTo` is set): `padding:"10px 12px"`, `color:#071B36`, `background:#F5F0E4` **OFF-TOKEN**, `border:1px solid rgba(7,27,54,0.12)`, `borderRadius:10px` (off-scale vs `radii.input`=12), `fontSize:14px` (= caption).
- **Form**: flex column, `gap:8px` (= s2).
- **Phone input**: `type="tel"`, placeholder "(555) 123-4567"; `padding:"12px 14px"`; `background:#FAF7F0` (= bg), `color:#071B36`, `border:1px solid rgba(7,27,54,0.16)`; `borderRadius:10px` (off-scale); `fontSize:16px` (= body). **No coded `:focus` or error-state border color** — relies on browser default focus ring; the input's own styling never changes when `login.error` is set (only the text below it appears).
- **Inline field error**: `fontSize:14px`, `color:#B3261E` **OFF-TOKEN**; only rendered conditionally (is itself the error state, no separate resting style).
- **Submit button**: "Send login link" / "Sending…"; `padding:"12px 16px"`; `background:#061A33` (= cta), text `#ffffff` **OFF-TOKEN**; `fontSize:16px`/`fontWeight:600` (= semi); `borderRadius:10px` (off-scale). `disabled={login.state==="submitting"}` but **no visual disabled style** (no dim/opacity rule, `cursor:pointer` set unconditionally); loading = text-only label swap, no spinner. No `:hover` rule anywhere (inline styles can't express it).
- **Resend link button** ("Send it again"/"Sent again"): text-link, `color:#4434E8` (= joryJ), `fontSize:14px`/`fontWeight:600`; text-only state swap on click, no color change.
- **Fallback copy**: `marginTop:20px`, `color:#5A6A82`, `fontSize:14px`.
- State machine (`use-login-request.ts`): `"entering" | "submitting" | "sent"` — no dedicated error state; request failures are swallowed and always resolve to `"sent"` (`catch { setState("sent") }`), a deliberate enumeration-safety choice, not a visual error screen.

## Verify (`login/verify/verify-client.tsx`, `use-verify-token.ts`)

- Page/card/heading/body reuse the login screen's exact values, with two differences: card gets `textAlign:"center"`; body margin is `"0 0 16px"` (vs login's 20px).
- States (`VerifyState`): `"verifying" | "success" | "error" | "missing_token"`.
  - **verifying** (loading): "Signing you in…" / "Hang tight while we confirm your login link." — text only, no spinner element.
  - **success**: "You're in" / "Taking you to your dashboard…", then redirects — transient, no visible control.
  - **error**: "That link didn't work" / explains expiry/reuse + a "Request a new login link" text link (`color:#4434E8`, `fontSize:14px`/`600`, plain `<a>`, no button chrome).
  - **missing_token**: "Missing login link" / instructs re-opening the texted link + the same request-new-link.
- No dedicated empty state — exactly one of the four states always renders.

**Off-token inventory, this section:** `#ffffff` (login/verify card bg), `#B3261E` (field error), `#F5F0E4` (session-expired banner bg), `#ffffff` (submit button text).

---

# 5. Behavior-review (`app/behavior-review/`)

Styled via 2 CSS Modules (`page.module.css`, `company-knowledge.module.css`) — no Tailwind, no `components/ui`. Native `<details>`/`<summary>` used for the diagnostics disclosure (no custom accordion).

## Page shell — `.page`

`min-height:100vh; padding:20px; color:var(--color-ink); background: linear-gradient(180deg, rgba(255,255,255,0.66), rgba(255,255,255,0) 220px), var(--color-bg);` — white-based gradient overlay is **OFF-TOKEN**. Responsive: `max-width:860px` → `padding:20px` (re-declared, unchanged); `max-width:520px` → `padding:16px`.

## Header block — `.header`, `.eyebrow`, `.title`, `.runCard`

- `.header`: flex, `align-items:flex-end`, `justify-content:space-between`, `gap:16px`, `max-width:1380px`, centered, `padding-bottom:14px`, `border-bottom:1px solid rgba(7,27,54,0.1)`. Responsive `≤860px`: column, stretch.
- `.eyebrow`: `color:var(--color-muted-ink)`, `12px/800/0.08em/uppercase` (12px = micro, 800 = extra, 0.08em = caps — all exact token matches). Company-knowledge's own `.eyebrow` differs: `11px/850` (both off-scale/off-token).
- `.title` (h1, "Run and review Jory simulations"): `34px/900/0/0.96` line-height — weight 900 = `black` exact, but size/letter-spacing/line-height are all off-token (size not on scale, letter-spacing explicitly zeroed vs. `heading -0.02em`, line-height tighter than `tight` 1.02). `max-width:720px`. Responsive: `≤860px` unchanged 34px; `≤520px` → 30px.
- `.subtitle`: `color:var(--color-muted-ink)`, `14px/1.45` (14 = caption, 1.45 is off-token), `max-width:660px`.
- `.runCard` (artifact-count + command info): grid, `gap:5px`, `min-width:260px`, `padding:10px 12px`; `border:1px solid rgba(7,27,54,0.12)`; `background:rgba(255,255,255,0.82)` **OFF-TOKEN**; `border-radius:8px` (off-token vs. `radii.input`=12); `box-shadow:var(--shadow-card)`. `.runCard span` 14px/800; `.runCard code` monospace 12px/1.4.

## Three-column layout — `.layout`

`display:grid; grid-template-columns:240px minmax(0,1fr) 330px; gap:14px; max-width:1380px; margin:0 auto;`. Responsive: `≤1180px` → `260px minmax(0,1fr)` (feedback rail moves to `position:static; grid-column:2`, i.e. drops from 3rd column to inline); `≤860px` → single column `1fr` (sidebar and feedback rail both `position:static; grid-column:auto`).

## Sidebar ("Queue" list) — `.sidebar`, `.queueItem`, `.queueItemSelected`, `.statusPill`, `.failStatus`

- `.sidebar`: `position:sticky; top:24px`, flex column, `gap:14px`.
- `.sidebarHeader strong` (count badge): 28×28px, `border-radius:999px` (= `radii.pill` exact), `background:var(--color-soft-yellow)`.
- `.queueItem`: `border:1px solid rgba(7,27,54,0.1)`, `border-radius:8px` (off-token), `background:rgba(255,255,255,0.88)` **OFF-TOKEN**, `box-shadow:var(--shadow-card)`, `padding:10px`.
- `.queueItemSelected` (**selected state**, applied by ID match, not `:hover`/`:focus`): `border-color:var(--color-accent-indigo)`, `box-shadow:0 0 0 2px rgba(79,70,229,0.12)` — an indigo focus-ring outline.
- `.queueTitle h2`: `15px/850` (off-token weight). `.statusPill`/`.queueTitle span`: `border-radius:999px` (pill, exact), `background:var(--color-soft-green)`, `12px/850/line-height 1`; `.failStatus` modifier swaps to `var(--color-soft-yellow)`.
- No `:hover` rule anywhere in the sidebar — selection is the only interactive state.

## Summary panel — `.summaryPanel`, `.metrics`, `.metric`

`.summaryPanel`: grid `minmax(0,1fr) auto`, `gap:12px`, `padding:12px`. `.summaryPanel h2`: `21px/900/1.05`. `.metrics` (4-up score row): `grid-template-columns:repeat(4,minmax(0,1fr))`; responsive `≤860px`→`repeat(2,…)`, `≤520px`→`1fr`. `.metric`: `padding:8px; border-radius:8px; background:var(--color-bg)`; label 11px/850/uppercase; value 22px/900.

## Transcript panel — `.transcriptPanel`, `.turn`, `.joryTurn`, `.userTurn`

- `.sectionHeading h2` ("Conversation"): `19px/900/1.15`. Responsive `≤860px`: column, `align-items:flex-start` (both `.sectionHeading` and `.transcriptActions`).
- `.turn` (bubble): `max-width:86%`, `padding:10px 12px`, `border:1px solid rgba(7,27,54,0.1)`, `border-radius:8px` (**not** `radii.bubble`=18px). Responsive `≤860px` → `max-width:100%`.
- `.joryTurn` (right-aligned): `border-color:rgba(79,70,229,0.18)`, `background:var(--color-bubble-jory)` (presumed `bubbleJory` #E0E7FF).
- `.userTurn` (left-aligned): `background:var(--color-bubble-user)` (presumed `bubbleUser` #F1F5F9).
- `.turnMeta strong` (speaker) 14px/900; `.turnMeta span` (role tag) 11px/850/uppercase. `.turn p` 14px/1.4.

## Copy-transcript button — `.copyButton`

`min-height:34px; padding:0 12px; border:0; border-radius:8px; color:white` **OFF-TOKEN**; `background:var(--color-cta)`; `12px/900`. **The only `:hover` rule in either CSS module**: `.copyButton:hover { background: var(--color-cta-hover); }`. Component states (`copy-transcript-button.tsx`): `"idle"|"copied"|"failed"` — text-only swap ("Copy trace + judge notes" / "Copied" / "Copy failed"), `aria-live="polite"`.

## Feedback rail — `.scoreBlock`, `.passMark`/`.watchMark`, `.diagnosticsPanel`, `.detailList`

- `.scoreBlock` (judge score tile): `background:var(--color-soft-green)`; label 12px/800/uppercase; value 32px/950 (off-token weight).
- `.passMark`/`.watchMark` (rubric pass/needs-review marks, "OK"/"!"): `12px/900`; pass = `var(--color-accent-green)` (presumed accentGreen #22C55E); watch = `var(--color-accent-orange)` (presumed accentOrange #F97316) — the pass/fail state colors.
- `.diagnosticsPanel` (native `<details>`): same shared panel treatment; `summary` 13px/900, `cursor:pointer`, relies on the browser's default disclosure triangle (no custom marker).
- `.detailList dt`/`dd`: key `mutedInk`/800, value `850` (off-token) — key/value diagnostics grid.

## Empty state — `.emptyState`

Rendered instead of the whole 3-column layout when zero simulator artifacts exist. `max-width:760px`, `padding:28px` (shared panel chrome). "Nothing to review yet" (`.eyebrow` reused) / h2 28px (off-scale) "No simulator artifacts found" / body: "Run the cafe proof locally, then reload this page. Jory will save a safe local artifact for simulator review." No retry control, no spinner (server component — data already resolved pre-render).

## Company-knowledge panel (`company-knowledge.module.css`)

Rendered inside the feedback rail only when `selected.companyKnowledge` is present. `.panel`: `padding:12px; border:1px solid rgba(7,27,54,0.1); border-radius:8px; background:rgba(255,255,255,0.88)` **OFF-TOKEN**; `box-shadow:var(--shadow-card)`. Sub-sections: header (eyebrow "Stored company record" + h2 "Company knowledge" + status pill), identity block (name + type/timezone), 4-tile stats row (Locations/Team/Training/Ready — same `.metric` pattern as page.module.css but smaller: 7px padding, 18px value vs. 22px), Locations pill list, Team pill/compact-list, Handbook-and-training section (shows only the first training item; **empty sub-state**: "No training items stored yet." via `.mutedText`), Onboarding assignment rows. No media queries of its own — inherits placement breakpoints from the parent `.layout`/`.feedbackRail`. No loading state anywhere (server-rendered from already-fetched data).

**Off-token inventory, this section:** `rgba(255,255,255,*)` family (`.page` gradient, `.runCard`, `.queueItem`/`.summaryPanel`/`.transcriptPanel`/`.rubricPanel`/`.emptyState`/`.diagnosticsPanel` shared bg, company-knowledge `.panel`); `color:white` keyword (`.copyButton`); font-weights 850/950 used repeatedly (not in the 400/500/600/700/800/900 token set); numerous off-scale font sizes (34, 21, 19, 15, 11, 10, 28px); `border-radius:8px` used throughout instead of any `radii` token value.

---

# 6. QA simulator (`app/qa/`)

100% CSS Modules (`qa.module.css`) — no Tailwind, no inline styles, no `components/ui`. This is the surface furthest from the design tokens: message bubbles are hardcoded iOS-Messages colors, not `bubbleUser`/`bubbleJory`.

## Layout — `.layout`

`display:grid; grid-template-columns:280px 1fr; gap:24px; min-height:100dvh; padding:24px;`. Sidebar column fixed **280px**. `background:var(--color-bg,#faf7f0)` (matches `bg`). `font-family:-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`. Responsive `≤820px`: single column.

## Sidebar — `.sidebar` (component `UserSidebar`)

- `.sidebar`: `padding:18px`, `gap:16px`, `background:#ffffff` **OFF-TOKEN**, `border:1px solid rgba(7,27,54,0.08)`, `border-radius:16px` (= `radii.card`), `position:sticky; top:24px`.
- Brand block: title 18px/700, subtitle 12px `mutedInk`.
- `.createBtn` (+ Blank sender / + Seeded business): `background:softPurple` #EDE8FF, `color:accentIndigo` #4F46E5, `13px/600`, `padding:10px 12px`, `border-radius:12px` (= `radii.input`). **hover**: `background:#e4dcff` **OFF-TOKEN**. **disabled**: `opacity:0.55; cursor:default` (wired to a `busy` prop).
- `.fixtureSelect`: `background:#ffffff` **OFF-TOKEN**, `border-radius:10px` (off-token), 12px, disabled via prop only (no CSS `:disabled` rule).
- `.sidebarError`: `color:#b42318` **OFF-TOKEN**, `background:#fef3f2` **OFF-TOKEN**, `border:1px solid #fee4e2` **OFF-TOKEN**, `border-radius:10px`, 12px/1.4 — conditionally rendered (is itself the error state).
- User list: empty state (12px/1.5 `mutedInk`, "Create a blank sender to test onboarding from scratch, or a seeded business to test employee questions."); `.userItem` default `background:transparent`, `border:1px solid transparent`, `radius:12px`; **hover** `background:#f5f3fb` **OFF-TOKEN**; `.userItemActive` (selected) `background:#f0edff` **OFF-TOKEN**, `border-color:rgba(79,70,229,0.3)`. No `aria-current`/`aria-selected` set — only the visual class toggles. Label 13px/600 `ink`; role 11px `mutedInk`.

## Phone chat panel — `.phone` (component `ChatThread`)

- `max-width:460px; width:100%; height:calc(100dvh - 48px); margin:0 auto`; `background:#ffffff` **OFF-TOKEN**; `border:1px solid rgba(7,27,54,0.1)`; `border-radius:24px` (off-token, nearest `radii.card`=16); `box-shadow:0 18px 50px rgba(7,27,54,0.12)` (custom, no token match). Responsive `≤820px`: `height:70dvh`.
- **Empty/no-user placeholder**: "Select or create a test user, then chat with Jory here." — 14px `mutedInk`, whole section replaced (header/messages/input not rendered at all).
- **Header** (`.phoneHeader`): `background:rgba(248,248,250,0.9)` **OFF-TOKEN** + `backdrop-filter:blur(8px)`. Avatar "J": 34×34px, `background:accentIndigo`, text `#fff` **OFF-TOKEN**, `border-radius:999px` (= pill). Name 15px/600 `ink`; sub 11px `mutedInk`. "Copy for review" button: `background:#ffffff` **OFF-TOKEN**, text `accentIndigo`, `border-radius:999px`; **hover** `#f0edff` **OFF-TOKEN**; **disabled** `opacity:0.5` (wired to zero-messages); label toggles "Copy for review" → "Copied ✓" for 1600ms (a bespoke timeout, not any `motion.*` token).
- **Message list** (`.messages`, `role="log"`): `background:#ffffff` **OFF-TOKEN**; auto-scrolls smoothly on new message/typing (`scrollIntoView`, try/catch-guarded).
- **Bubbles**: shared `.bubble` — `max-width:78%`, `padding:8px 13px`, `border-radius:18px` (**this one does match** `radii.bubble` exactly), `15px/1.35` (line-height off-token). `.bubbleYou`: `background:#0a84ff` **OFF-TOKEN** (iOS blue), text `#ffffff` **OFF-TOKEN**, `border-bottom-right-radius:5px` (tail corner). `.bubbleJory`: `background:#e9e9eb` **OFF-TOKEN**, text `#0b0b0c` **OFF-TOKEN**, `border-bottom-left-radius:5px`.
- **Per-message note** (`.noteToggle`/`.noteInput`): toggle text `#98989d` **OFF-TOKEN**, hover `accentIndigo`; textarea `background:#fbfaff` **OFF-TOKEN**, dashed border (`accentIndigo` 40%), focus border solidifies to `accentIndigo`.
- **Typing indicator** (`.typing`, shown inside a `.bubble.bubbleJory`): 3 dots, `width/height:7px`, `border-radius:999px`, `background:#8a8a8e` **OFF-TOKEN**, `animation:qa-bounce 1.2s infinite ease-in-out` (staggered 0.15s/0.3s) — duration/easing don't match any `motion.*` token (fast 120/base 180/slow 280ms, cubic-bezier ease).
  ```css
  @keyframes qa-bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }
  ```
- **Error banner** (`.error`, send failures): `color:#b42318` **OFF-TOKEN**, `background:#fef3f2` **OFF-TOKEN**, `border-top:1px solid #fee4e2` **OFF-TOKEN** — the exact same 3 literals as `.sidebarError`, duplicated rather than shared.
- **Input bar** (`.inputBar`): `background:rgba(248,248,250,0.95)` **OFF-TOKEN** (same base as header, different alpha). `.input`: `background:#ffffff` **OFF-TOKEN**, `border-radius:999px`; **focus** `border-color:#0a84ff` **OFF-TOKEN** (same iOS-blue as `.bubbleYou`). `.sendBtn` ("↑"): 34×34px circle, `background:#0a84ff` **OFF-TOKEN**, text `#fff` **OFF-TOKEN**; **hover** `background:#0a74e0` **OFF-TOKEN**; no `:disabled` styling (empty-input submission blocked in JS instead).

**Off-token inventory, this section (15 distinct values):** `#ffffff`/`#fff` (9 places), `#e4dcff`, `#b42318`, `#fef3f2`, `#fee4e2`, `#f5f3fb`, `#f0edff`, `rgba(248,248,250,*)`≈`#f8f8fa` (2 alphas), `#98989d`, `#fbfaff`, `#0a84ff` (3 places), `#e9e9eb`, `#0b0b0c`, `#8a8a8e`, `#0a74e0`.

---

# 7. `components/ai-elements/*` — chat/AI primitives

Tailwind-classed, most using CSS custom properties (`--color-muted-foreground`, `--shiki-dark-bg`, etc.) rather than Jory's own design tokens — this is the shadcn/vendor design system, not the Jory brand tokens. **Import grep result: only two product files consume ai-elements directly** — `chat-view.tsx` (`conversation`, `message`, `prompt-input`, `suggestion`, `shimmer`) and `capability-card.tsx` (`artifact`). `code-block.tsx` and `tool.tsx` have **no product-route importer** (`Tool` uses `CodeBlock` internally, but nothing in the app imports `Tool`).

| File               | Exports                                                                                                                                 | Used by product?                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `artifact.tsx`     | Artifact, ArtifactHeader, ArtifactClose, ArtifactTitle, ArtifactDescription, ArtifactActions, ArtifactAction, ArtifactContent           | Yes — `capability-card.tsx`                |
| `code-block.tsx`   | CodeBlockContainer/Header/Title/Filename/Actions/Content/CopyButton, CodeBlockLanguageSelector(+sub), `highlightCode()`                 | No direct import (used only by `tool.tsx`) |
| `conversation.tsx` | Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton, ConversationDownload                               | Yes — `chat-view.tsx`                      |
| `message.tsx`      | Message, MessageContent, MessageActions, MessageAction, MessageBranch(+5 sub), MessageResponse, MessageToolbar                          | Yes — `chat-view.tsx`                      |
| `prompt-input.tsx` | ~40 components/hooks (PromptInput, body/footer/tools/button/submit, action menu, selects, hover-card, tabs, command palette, providers) | Yes — `chat-view.tsx`                      |
| `shimmer.tsx`      | Shimmer                                                                                                                                 | Yes — `chat-view.tsx`                      |
| `suggestion.tsx`   | Suggestions, Suggestion                                                                                                                 | Yes — `chat-view.tsx`                      |
| `tool.tsx`         | Tool, ToolHeader, ToolContent, ToolInput, ToolOutput                                                                                    | No product importer                        |

Key specs:

- **Artifact**: `flex flex-col overflow-hidden`, `rounded-lg border shadow-sm`, `bg-background`. Header: `flex items-center justify-between px-4 py-3`, `border-b`, `bg-muted/50`. Title `text-sm font-medium`.
- **Conversation**: `relative flex-1 overflow-y-hidden`, `role="log"`. Content: `flex flex-col gap-8 p-4`. Empty state: `flex size-full flex-col items-center justify-center gap-3 p-8 text-center`, title `text-sm font-medium`, description `text-sm text-muted-foreground` — default copy "No messages yet" / "Start a conversation to see messages here." Scroll-to-bottom button: `absolute bottom-4 left-[50%] translate-x-[-50%]`, `rounded-full`, `size="icon" variant="outline"`, shown only when `!isAtBottom`.
- **Message**: `flex w-full max-w-[95%] flex-col gap-2`; role variant adds `is-user ml-auto justify-end` or `is-assistant` for descendant targeting. MessageContent: `text-sm`; user bubble `ml-auto rounded-lg bg-secondary px-4 py-3 text-foreground` (this is the shadcn token path — the actual product bubble color comes from the Tailwind arbitrary-value override in `chat-view.tsx`, see §2).
- **PromptInput**: root form wraps `InputGroup`; textarea `field-sizing-content max-h-48 min-h-16`, placeholder "What would you like to know?" (overridden to "Message Jory" in product); Enter submits (unless IME composing/shift); Backspace on empty textarea removes last attachment. Submit button state machine by `status`: idle→`CornerDownLeftIcon`, submitted→`Spinner`, streaming→`SquareIcon`, error→`XIcon`/`RefreshCwIcon` (retry).
- **Shimmer**: `relative inline-block`, `bg-clip-text text-transparent`, animates `backgroundPosition` 100%→0% center over 2s linear infinite (Framer Motion), `--spread` computed from text length.
- **Suggestion**: pill button, `cursor-pointer rounded-full px-4`, `variant="outline" size="sm"`, inside a horizontally-scrollable `ScrollArea` with the scrollbar hidden.
- **Tool** (unused in product today): collapsible card, `rounded-md border`; header status icon colors per state — `approval-requested` yellow-600, `approval-responded` blue-600, `input-available` pulses, `output-available` green-600, `output-denied` orange-600, `output-error` red-600; output error state `bg-destructive/10 text-destructive`.

## `components/dev/agentation-toolbar.tsx`

One line: dev-only wrapper that lazy-loads the third-party `agentation` devtools toolbar, gated to `NODE_ENV==="development"` (renders `null` in production) — not present in any production route.

---

# 8. `components/ui/*` — 16 shadcn primitives

| File                | Exports                                                                                                                       | cva variants                                                                                                                 | size variants                                                                                        | Used by product?                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `badge.tsx`         | Badge, badgeVariants                                                                                                          | `variant`: default (solid primary), secondary, destructive (soft red tint), outline (bordered), ghost, link (text underline) | none                                                                                                 | `ai-elements/tool.tsx`                                                                                  |
| `button-group.tsx`  | ButtonGroup, ButtonGroupSeparator, ButtonGroupText                                                                            | `orientation`: horizontal (row, joined pill edges), vertical (stacked, joined edges)                                         | none                                                                                                 | `ai-elements/message.tsx`                                                                               |
| `button.tsx`        | Button, buttonVariants                                                                                                        | `variant`: default, outline, secondary, ghost, destructive, link                                                             | `size`: default(h-8), xs(h-6), sm(h-7), lg(h-9), icon(8×8), icon-xs(6×6), icon-sm(7×7), icon-lg(9×9) | `chat-view.tsx`, `code-block.tsx`, `conversation.tsx`, `suggestion.tsx`, `artifact.tsx`, `message.tsx`  |
| `collapsible.tsx`   | Collapsible, CollapsibleTrigger, CollapsibleContent                                                                           | no cva (unstyled Radix wrapper)                                                                                              | none                                                                                                 | `ai-elements/tool.tsx`                                                                                  |
| `command.tsx`       | Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator | no cva                                                                                                                       | none                                                                                                 | `ai-elements/prompt-input.tsx`                                                                          |
| `dialog.tsx`        | Dialog(+7 sub)                                                                                                                | no cva                                                                                                                       | none                                                                                                 | **not imported by product** — used internally by `command.tsx`'s `CommandDialog`                        |
| `dropdown-menu.tsx` | DropdownMenu(+13 sub)                                                                                                         | no cva; `variant` prop (default/destructive) via `data-variant`                                                              | none                                                                                                 | `ai-elements/prompt-input.tsx`                                                                          |
| `hover-card.tsx`    | HoverCard, HoverCardTrigger, HoverCardContent                                                                                 | no cva                                                                                                                       | none                                                                                                 | `ai-elements/prompt-input.tsx`                                                                          |
| `input-group.tsx`   | InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea                            | `align` (Addon): inline-start, inline-end, block-start, block-end                                                            | `size` (Button): xs(h-6), sm(inherits), icon-xs(6×6), icon-sm(8×8)                                   | `ai-elements/prompt-input.tsx`                                                                          |
| `input.tsx`         | Input                                                                                                                         | no cva (h-8, border, focus ring, invalid ring, disabled dim)                                                                 | none                                                                                                 | `ai-elements/prompt-input.tsx`                                                                          |
| `scroll-area.tsx`   | ScrollArea, ScrollBar                                                                                                         | no cva; orientation is a plain prop                                                                                          | none                                                                                                 | `ai-elements/suggestion.tsx`                                                                            |
| `select.tsx`        | Select(+9 sub)                                                                                                                | no cva; `size` plain prop via `data-size`                                                                                    | default(h-8), sm(h-7)                                                                                | `ai-elements/prompt-input.tsx`, `ai-elements/code-block.tsx`                                            |
| `separator.tsx`     | Separator                                                                                                                     | no cva; orientation plain prop                                                                                               | none                                                                                                 | **not imported by product** — used internally by `button-group.tsx`'s `ButtonGroupSeparator`            |
| `spinner.tsx`       | Spinner                                                                                                                       | no cva (spinning `Loader2Icon`, `size-4`, `animate-spin`)                                                                    | none                                                                                                 | `ai-elements/prompt-input.tsx`                                                                          |
| `textarea.tsx`      | Textarea                                                                                                                      | no cva (min-h-16, border, focus ring, invalid ring, disabled dim)                                                            | none                                                                                                 | **not imported by product** — used internally by `input-group.tsx`'s `InputGroupTextarea`               |
| `tooltip.tsx`       | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent                                                                      | no cva (dark pill bubble w/ arrow)                                                                                           | none                                                                                                 | `app/layout.tsx`, `ai-elements/prompt-input.tsx`, `ai-elements/message.tsx`, `ai-elements/artifact.tsx` |

13 of 16 are imported by at least one product file; 3 (`dialog`, `separator`, `textarea`) are only consumed internally by other `ui/` files, never directly by a product route.

---

# Pattern list (de-duplicated, cross-component)

| Pattern                                  | Exact spec                                                                                                                                                                                                                                                                                                                                             | Used by                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Card** (white/token-bg panel)          | `borderRadius: radii.card` 16px, `boxShadow: shadows.card`, `padding: 24px` (spacing.s5); background is `#fff` OFF-TOKEN in every inline-styled dashboard instance                                                                                                                                                                                     | Account cards, Handbook empty/section cards, Knowledge cards, Team card, Evidence card, EvidenceItemsTable card                                                                              |
| **Row / list-item card**                 | `background: colors.bg` #FAF7F0, `borderRadius: radii.input` 12px, `padding: 16px` (s4)                                                                                                                                                                                                                                                                | Overview follow-up rows, Knowledge item rows, Chat readiness-result rows, Chat memory-search rows                                                                                            |
| **Pill button (primary CTA)**            | `background: colors.cta` #061A33, text white (OFF-TOKEN), `borderRadius: radii.pill` 999px, `fontWeight: medium`, no coded hover/disabled visuals                                                                                                                                                                                                      | Handbook export, Knowledge publish/submit, Evidence print, Login submit (before token substitution, same shape)                                                                              |
| **Pill button (secondary/outline)**      | white/transparent bg, `border: 1px solid colors.muted`, `radii.pill`, `medium` weight                                                                                                                                                                                                                                                                  | Account logout, Chat "Try again"                                                                                                                                                             |
| **Status/badge pill**                    | `radii.pill` 999px, `padding: 4px 12px` (s1 s3), 13px, per-status background/text pair                                                                                                                                                                                                                                                                 | `StatusPill` (Overview, Evidence, Team, Chat), Handbook section badges (own copy of the pattern, not the shared component)                                                                   |
| **Soft-tint semantic backgrounds**       | `softPurple` #EDE8FF (neutral/info), `softYellow` #FFF1CF (pending), `softGreen` #E9F8E8 (success/ready), `softRed` #FFE7DF (attention/error-lite)                                                                                                                                                                                                     | Tiles (Overview, Chat readiness), StatusPill tones, Handbook badges, Chat attachment chips, Chat error/upload banners                                                                        |
| **Empty state**                          | title `fontWeights.semi`/16px + body `colors.mutedInk`, no icon, no illustration                                                                                                                                                                                                                                                                       | Overview follow-up/activity, Knowledge draft/published, Team roster, EvidenceItemsTable, Handbook (no-handbook), Chat conversation, QA sidebar/phone placeholder, Behavior-review emptyState |
| **Inline field/banner error**            | red text (`#B3261E` OFF-TOKEN in most dashboard/login screens; `#b42318`/`#fef3f2`/`#fee4e2` OFF-TOKEN triad in QA) — no component shares one literal red across the whole app                                                                                                                                                                         | Login field error, Knowledge add-form error, Handbook export error, Chat error banners (these use `softRed` bg instead), QA sidebar/chat error                                               |
| **Chat bubble**                          | `borderRadius: radii.bubble` 18px; user `bubbleUser` #F1F5F9, assistant `bubbleJory` #E0E7FF — but only in the **dashboard Chat** surface; Behavior-review reuses the same two color vars for its transcript turns; **QA reimplements bubbles from scratch** with hardcoded iOS colors (`#0a84ff`/`#e9e9eb`), never touching `bubbleUser`/`bubbleJory` | Dashboard Chat (`ChatMessage`), Behavior-review `.joryTurn`/`.userTurn`; QA `.bubbleYou`/`.bubbleJory` is a divergent, non-token reimplementation                                            |
| **Page-centered auth card**              | `minHeight:100dvh`, flex-centered, `padding:24px`, `background:colors.bg`, card `maxWidth:420px`, `padding:32px`, white bg (OFF-TOKEN), `radii.card`, custom shadow                                                                                                                                                                                    | Login, Verify                                                                                                                                                                                |
| **Sidebar app-shell nav**                | fixed-width column (220px dashboard shell / 280px QA), sticky or full-height, active-item highlight                                                                                                                                                                                                                                                    | Dashboard shell sidebar, QA `UserSidebar`                                                                                                                                                    |
| **Score/metric tile**                    | grid tile, `border-radius: 8px`, label uppercase small/bold, value large/black-weight                                                                                                                                                                                                                                                                  | Behavior-review `.metric` (page + company-knowledge variants), Overview/Chat "Ready"/"Needs follow-up" tiles (16px radius variant instead of 8px)                                            |
| **Disclosure/print CSS-only affordance** | `@media print` hiding nav/header/button; dashboard-shell scroll-fade via `@container scroll-state`                                                                                                                                                                                                                                                     | Evidence view print rule; Dashboard shell mobile nav fade                                                                                                                                    |

---

# Palette table (every hex value found across product files, resolved, with usage)

## Token-backed colors (match `design-tokens.ts` exactly)

| Hex       | Token          | Where used (representative, not exhaustive)                                                                                                                    | Frequency                                               |
| --------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `#FAF7F0` | `bg`           | Dashboard shell page, Login/Verify page wrapper, QA `.layout`, Behavior-review `var(--color-bg)`                                                               | Very high — base page background on nearly every screen |
| `#071B36` | `ink`          | Primary text everywhere (headings, body, ChatMessage text, form labels)                                                                                        | Very high                                               |
| `#16233B` | `ink2`         | Overview `activityRow` text                                                                                                                                    | Low (1 use found)                                       |
| `#E6E6E6` | `muted`        | Borders (dashboard-shell, tables, inputs), StatusPill `blocked`/`cancelled`/`draft` bg, chat button border                                                     | High                                                    |
| `#5A6A82` | `mutedInk`     | Secondary/detail text everywhere                                                                                                                               | Very high                                               |
| `#4434E8` | `joryJ`        | Login/Verify link color only                                                                                                                                   | Low                                                     |
| `#F7B313` | `joryO`        | **Not found used in any product file read** (token exists but unused in these files)                                                                           | 0                                                       |
| `#7467E8` | `joryR`        | **Not found used**                                                                                                                                             | 0                                                       |
| `#FF5A32` | `joryY`        | StatusPill `overdue` background                                                                                                                                | Low                                                     |
| `#D4A72C` | `mustard`      | **Not found used**                                                                                                                                             | 0                                                       |
| `#F4A261` | `skin`         | **Not found used**                                                                                                                                             | 0                                                       |
| `#061A33` | `cta`          | Primary buttons: Handbook export, Knowledge publish/submit, Evidence print, Behavior-review copyButton                                                         | Medium                                                  |
| `#0F2A4D` | `ctaHover`     | Behavior-review `.copyButton:hover` only                                                                                                                       | Low                                                     |
| `#EDE8FF` | `softPurple`   | Dashboard active nav, Chat attachment chip, readiness tiles, QA `.createBtn`                                                                                   | Medium                                                  |
| `#FFF1CF` | `softYellow`   | Dashboard role chip, StatusPill `pending`, Handbook badge `drafting`, Behavior-review sidebar count badge/`.failStatus`                                        | Medium                                                  |
| `#E9F8E8` | `softGreen`    | StatusPill success states, Handbook badge `ready`, readiness "Ready" tile fallback, Behavior-review `.scoreBlock`/`.statusPill`                                | Medium                                                  |
| `#FFE7DF` | `softRed`      | StatusPill attention states, Overview tile (needs-follow-up), Chat error/upload banners, Handbook badge `incomplete` + open-gap bg                             | Medium                                                  |
| `#F1F5F9` | `bubbleUser`   | Chat user bubble, Behavior-review `.userTurn`                                                                                                                  | Low-medium                                              |
| `#E0E7FF` | `bubbleJory`   | Chat assistant bubble, Behavior-review `.joryTurn`                                                                                                             | Low-medium                                              |
| `#4F46E5` | `accentIndigo` | Links (Overview Evidence link, Chat "View team", Team "Add employee", Evidence action link), QA createBtn/avatar/copyBtn, Behavior-review selected-item border | Medium-high                                             |
| `#F97316` | `accentOrange` | Behavior-review `.watchMark` only                                                                                                                              | Low                                                     |
| `#22C55E` | `accentGreen`  | Behavior-review `.passMark` only                                                                                                                               | Low                                                     |

## Off-token colors (not in `design-tokens.ts`)

| Hex/value                                                        | Count (occurrences) | Used in                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#fff` / `#ffffff` / `white` (keyword)                           | ~24                 | Nearly every card background, CTA button text color, and login/verify/QA/behavior-review surfaces — the single most common off-token value in the app                                        |
| `rgba(255,255,255,*)` (white family, translucent)                | 6                   | Behavior-review `.page` gradient, `.runCard`, shared panel bg (`.queueItem`/`.summaryPanel`/`.transcriptPanel`/`.rubricPanel`/`.emptyState`/`.diagnosticsPanel`), company-knowledge `.panel` |
| `#B3261E`                                                        | 3                   | Login field error, Knowledge add-form error, Handbook export error                                                                                                                           |
| `#F5F0E4`                                                        | 1                   | Login "session expired" banner background                                                                                                                                                    |
| `#6C5CE7`, `#00B894`, `#FDCB6E`, `#E17055`, `#0984E3`, `#D63031` | 1 each              | Chat `MiniBarChart` bar-fill palette (`CHART_COLORS`)                                                                                                                                        |
| `#e4dcff`                                                        | 1                   | QA `.createBtn:hover`                                                                                                                                                                        |
| `#b42318`                                                        | 2                   | QA `.sidebarError`, `.error` text                                                                                                                                                            |
| `#fef3f2`                                                        | 2                   | QA `.sidebarError`, `.error` background                                                                                                                                                      |
| `#fee4e2`                                                        | 2                   | QA `.sidebarError`, `.error` border                                                                                                                                                          |
| `#f5f3fb`                                                        | 1                   | QA `.userItem:hover`                                                                                                                                                                         |
| `#f0edff`                                                        | 2                   | QA `.userItemActive`, `.copyBtn:hover`                                                                                                                                                       |
| `rgba(248,248,250,*)` ≈ `#f8f8fa`                                | 2                   | QA `.phoneHeader` (0.9), `.inputBar` (0.95)                                                                                                                                                  |
| `#98989d`                                                        | 1                   | QA `.noteToggle`                                                                                                                                                                             |
| `#fbfaff`                                                        | 1                   | QA `.noteInput`                                                                                                                                                                              |
| `#0a84ff`                                                        | 3                   | QA `.bubbleYou`, `.input:focus`, `.sendBtn`                                                                                                                                                  |
| `#e9e9eb`                                                        | 1                   | QA `.bubbleJory`                                                                                                                                                                             |
| `#0b0b0c`                                                        | 1                   | QA `.bubbleJory` text                                                                                                                                                                        |
| `#8a8a8e`                                                        | 1                   | QA `.typing span`                                                                                                                                                                            |
| `#0a74e0`                                                        | 1                   | QA `.sendBtn:hover`                                                                                                                                                                          |
| `--color-destructive` (unresolved CSS var, no value found)       | 1                   | Chat `ActionProposalCard` danger-confirm button                                                                                                                                              |

**Total distinct off-token color values: 23** (counting the white family and the QA error triad each once, per distinct literal; `--color-destructive` counted separately as an unresolved reference, not a literal).

---

# Type-scale table (size, weight combinations found)

## Matches to `typeScale`/`fontWeights` tokens

| Size           | Weight                 | Where                                                                                                                             |
| -------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 12px (micro)   | 800 (extra)            | Behavior-review `.eyebrow` (page.module.css), `.sidebarHeader`, `.sectionHeading span`, `.scoreBlock span`                        |
| 12px (micro)   | 500 (medium)           | QA `.brandSub`-adjacent, various detail labels                                                                                    |
| 12px (micro)   | — (unspecified weight) | StatusPill text, many "detail"/"type label" lines across Knowledge/Team/Evidence                                                  |
| 14px (caption) | 400/unspecified        | Body copy defaults, table cells                                                                                                   |
| 14px (caption) | 500 (medium)           | Table headers (Team `.th`, EvidenceItemsTable `.th`), roster search/toggle label, StatusPill-adjacent detail text                 |
| 14px (caption) | 600 (semi)             | Row titles (Overview, StatusPill-adjacent titles), Login label                                                                    |
| 16px (body)    | 400                    | Login/Verify body copy, text inputs                                                                                               |
| 16px (body)    | 600 (semi)             | Login submit button                                                                                                               |
| 18px           | 800 (extra)            | Dashboard shell wordmark "Jory" (18/800 is close to but not exactly on scale since 18px isn't a typeScale value)                  |
| 24px (h3)      | —                      | (h3 token itself not observed directly instantiated in the files read — closest is Account "Business" card value at 18px, not 24) |
| 28px           | 700 (bold)             | Login/Verify heading (off-scale — between h3 24 and h2 36)                                                                        |
| 34–36px range  | 900 (black)            | Behavior-review `.title` 34px/900 (h2 token is 36px, close but not exact)                                                         |

## Off-scale / off-token custom sizes and weights (not in `typeScale`/`fontWeights`)

| Size or weight                                                  | Where                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10px                                                            | Company-knowledge `.metric span`                                                                                                                                                                                                                                 |
| 11px                                                            | Behavior-review `.turnMeta span`, company-knowledge `.eyebrow`/`.pillRow small`                                                                                                                                                                                  |
| 13px                                                            | Widespread "detail" text (Knowledge, Evidence, Team notes, StatusPill), Behavior-review `.queueItem p`, `.diagnosticsPanel summary`                                                                                                                              |
| 15px                                                            | Behavior-review `.queueTitle h2`, QA `.bubble`/`.headerName`                                                                                                                                                                                                     |
| 17px                                                            | QA `.sendBtn`                                                                                                                                                                                                                                                    |
| 18px                                                            | Knowledge/Team/Evidence card titles, company-knowledge `.identity strong` value                                                                                                                                                                                  |
| 19px                                                            | Behavior-review `.sectionHeading h2`, company-knowledge `.header h2`                                                                                                                                                                                             |
| 21px                                                            | Behavior-review `.summaryPanel h2`                                                                                                                                                                                                                               |
| 22px                                                            | Evidence/Team/Chat "tile value" numbers, Evidence title                                                                                                                                                                                                          |
| 28px                                                            | Login heading, Behavior-review `.emptyState h2`                                                                                                                                                                                                                  |
| 30px                                                            | Behavior-review `.title` at ≤520px breakpoint                                                                                                                                                                                                                    |
| 34px                                                            | Behavior-review `.title`                                                                                                                                                                                                                                         |
| 700 (weight, valid token=`bold`) used alongside **850 and 950** | 850/950 appear repeatedly across both behavior-review CSS modules (`.queueTitle h2`, `.metric strong`, `.turnMeta strong`, `.scoreBlock strong`, `.detailList dd`, `.identity strong`) — these sit between `extra` 800 and `black` 900 but match neither exactly |

**Summary**: the dashboard's inline-styled surfaces (Overview, Account, Knowledge, Team, Evidence, Handbook) mostly stay close to the documented `typeScale`/`fontWeights` tokens (12/13/14/16/18/22px, weights 500/600/800). The two CSS-module surfaces — Behavior-review and QA — depart from the scale extensively: neither uses a single `typeScale` value without also introducing custom off-scale sizes (10–34px) and two off-token font-weights (850, 950) not present anywhere in `fontWeights`.

---

# Implementation method by component/surface

| Surface                                                                                                                            | Method                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard shell, Overview, Account, Chat capability-renderers, Handbook, Knowledge, Team, Evidence, EvidenceItemsTable, StatusPill | **100% inline `React.CSSProperties`** style objects (`Record<string, React.CSSProperties>` per file)                                                                           |
| Chat page shell + composer (`chat-view.tsx`) and `capability-card.tsx`                                                             | **Tailwind utility classes** (arbitrary-value `var(--...)` references to presumed globals.css tokens) + `@/components/ui` (`Button`) + `@/components/ai-elements/*` primitives |
| Login, Verify                                                                                                                      | **100% inline style objects** — no CSS module, no Tailwind, no `components/ui`                                                                                                 |
| Behavior-review                                                                                                                    | **CSS Modules** (`page.module.css`, `company-knowledge.module.css`) — no Tailwind, no `components/ui`; one local React helper component (`Metric`) consumes the module classes |
| QA simulator                                                                                                                       | **CSS Modules** (`qa.module.css`) only — no Tailwind, no inline styles, no `components/ui`                                                                                     |
| `components/ai-elements/*`                                                                                                         | **Tailwind utility classes**, largely against shadcn/vendor CSS vars (`--color-muted-foreground`, etc.), not Jory's own `colors.*` tokens                                      |
| `components/ui/*` (16 shadcn primitives)                                                                                           | **Tailwind + `class-variance-authority` (cva)** for variant/size systems (`button`, `badge`, `button-group`, `input-group`); the rest are single-style Tailwind wrappers       |
| `components/dev/agentation-toolbar.tsx`                                                                                            | Dev-only, no styling — not present in production                                                                                                                               |

No file in the product surface (excluding `ai-elements`/`ui`) mixes more than one of {inline styles, CSS module, Tailwind} within itself — each route picks exactly one method and uses it exclusively, except Chat, which is the sole product surface combining inline-styled capability bodies with a Tailwind-classed page shell.
