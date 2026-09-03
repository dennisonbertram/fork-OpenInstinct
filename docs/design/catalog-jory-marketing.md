# Jory Marketing Component Catalog

Source repo: `/Users/dennison/develop/jory` (read-only). All values quoted
verbatim from source; nothing invented. Where a file uses a CSS `clamp()`,
that clamp is reported as written (min, preferred-vw, max) rather than a
single px value, since the exact rendered size depends on viewport width.

Font stack used everywhere a heading font is set explicitly:
`'Inter Tight', Inter, system-ui, sans-serif` (called **HEADING_FONT** below).
Body text has no explicit `font-family` override in these files, so it
inherits the global `body` font: `var(--font-inter-tight), 'Inter Tight',
'Inter', system-ui, -apple-system, sans-serif` (globals.css line 102).

Global reset (globals.css `@layer base`): `* { box-sizing: border-box;
margin: 0; padding: 0; }`, `a { color: inherit; text-decoration: none; }`.
Global design tokens exist in globals.css `@theme` (lines 12-90) — e.g.
`--color-bg: #FAF7F0`, `--color-ink: #071B36` — but the marketing components
audited below do **not** consume these theme variables; every component sets
its own literal hex values inline (e.g. `#0D1A2F` for ink, `#FAF7F0`/`#FAF9F7`
for background), which differ slightly from the token values. Both sets are
recorded in the palette table with a note on which side uses which.

---

## 1. `components/landing/nav.tsx` — Nav

Purpose: sticky-feeling top navigation bar with brand wordmark, link list, and CTA.

Layout:

- `<nav className="landing-nav">`: `display:grid`, `grid-template-columns: 1fr auto 1fr`, `column-gap:40px`, `align-items:center`, `padding:14px 48px`, `max-width:1440px`, `margin:0 auto`, `height:72px`, `box-sizing:border-box`.
- Brand (`justify-self:start`), links (`justify-self:center`), CTA (`justify-self:end`).
- Nav links row: `display:flex`, `gap:56px`.

Colors:

- Brand text `#031128`.
- Nav link text `#0D1A2F` (inherits color from parent div).
- CTA button background `#01102B`, text `#fff`.

Type:

- Brand "JORY": HEADING_FONT, `22px`, `font-weight:900`, `letter-spacing:-0.04em`, no explicit line-height.
- Nav links: `16px`, `font-weight:500`, `color:#0D1A2F`, no explicit letter-spacing/line-height (inherits parent's `color:#0D1A2F` set on wrapper div, no per-link override).
- CTA label "Get early access": `18px`, `font-weight:700`, `letter-spacing:-0.03em`.

Shape:

- CTA button: `border-radius:16px`, `border:0`, `padding:14px 16px`, `height:52px`, `box-sizing:border-box`.
- CTA icon well: `24px × 24px` inline-flex, icon svg `14×14`, stroke `currentColor` (white), `stroke-width:2.4`.

Nav link list (data): Features `/features`, How it works `/how-it-works`, Pricing `/pricing`, Security `/security`, About `/about`, Why we're building Jory `/why`.

States: none coded (no hover/active/disabled styles in file).

Breakpoints (globals.css):

- `≤1180px`: `.landing-nav` → `grid-template-columns:auto auto !important`, `grid-template-rows:auto auto !important`, `column-gap:20px`, `row-gap:12px`, `padding:14px 28px`, `max-width:100%`, `height:auto`, `position:relative`, `z-index:5`. `.landing-nav-links` → `grid-column:1/-1`, `grid-row:2`, `display:flex`, `flex-wrap:wrap`, `justify-self:stretch`, `width:100%`, `gap:8px`, `overflow:visible`, `padding:2px 0 4px`, `font-size:14px`. `.landing-nav-links a` → `flex:0 0 auto`, `border:1px solid rgba(13,26,47,0.08)`, `border-radius:999px`, `background:rgba(255,255,255,0.58)`, `padding:8px 11px` (link chips become pill buttons).
- `≤640px`: `.landing-nav` → `height:auto`, `padding:12px 18px`. `.landing-nav-cta` → `height:46px`, `padding:12px 14px`, `font-size:16px`, `border-radius:14px`. `.landing-nav-links` → `gap:7px`, `font-size:13px`; `.landing-nav-links a` → `padding:7px 10px`.

---

## 2. `components/landing/hero.tsx` — Hero

Purpose: homepage hero — wordmark art, character illustration, headline, CTAs, 4-item benefit strip.

### 2a. Wordmark stage

Layout: `position:relative`, `width:100%`, `height:auto`, `z-index:1`.
Assets: `/assets/jory-wordmark.svg` (full width, `height:auto`). Character `/assets/jory-avatar_desk_clay.webp` absolutely positioned `right:0%`, `bottom:-86%`, `width:min(42vw, 680px)`, `z-index:3`.

### 2b. Headline + CTA block

Layout: flex column, `gap:18px`, `max-width:760px`, inside grid `.landing-hero-grid` (`grid-template-columns: minmax(0,1fr)`, `margin-top:20px`).

Type — H1 (`.landing-hero-title`): HEADING_FONT, `font-weight:700`, `font-size:58px`, `line-height:56px`, `letter-spacing:-0.02em`; two `<span>` lines, flex column `gap:12px`.

- Line 1 "Train your staff once." color `#0D1A2F`.
- Line 2 "Prove it every shift." color `#3E2EC0`.

Type — body copy (`.landing-hero-copy`): `18px`, `line-height:1.31`, `letter-spacing:-0.03em`, `color:rgba(13,26,47,0.7)`, `max-width:418px`.

### 2c. Primary CTA button (SignupButton instance)

Background `#01102B`, text `#fff`, `border:0`, `border-radius:16px`, `padding:16px 20px`, `font-size:18px`, `font-weight:700`, `letter-spacing:-0.03em`, `line-height:1.31`, `display:inline-flex`, `gap:10px`, `height:56px`, `box-sizing:border-box`. Icon: paper-plane svg, `20×20`, `stroke:currentColor`, `stroke-width:2.2`.

### 2d. Secondary link button ("See how it works")

Background `#fff`, text `#0D1A2F`, `border:1px solid #E4E2E0`, `box-shadow:0px 4px 15px 0px rgba(3,17,40,0.06)`, `border-radius:16px`, `padding:16px 20px`, `font-size:18px`, `font-weight:700`, `letter-spacing:-0.03em`, `line-height:1.31`, `height:56px`. Icon: play triangle, `16×20`, `fill:currentColor`.

### 2e. Benefit strip (4 cards, `.landing-hero-feature-list`)

Layout: `display:grid`, `grid-template-columns:repeat(4, minmax(0,1fr))`, `gap:16px`, section `margin-top:56px`, `padding-bottom:72px`.

Card (`.landing-hero-feature-item`): `display:flex`, `gap:14px`, `align-items:flex-start`, `background:rgba(255,255,255,0.58)`, `border:1px solid rgba(13,26,47,0.08)`, `border-radius:20px`, `padding:16px`.

Icon well: `52×52`, `border-radius:16px`, background = per-item tint, icon svg `28×28`, `stroke-width:2`.

Card title: `17px`, `font-weight:700`, `letter-spacing:-0.03em`, `color:#0D1A2F`.
Card body: `15px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.31`, `margin-top:3px`.

4 items (tint / stroke / title):

1. `#F1EBF8` / `#3D2AB6` — "Onboard without bottlenecks"
2. `#FDEBD2` / `#FDAD0E` — "Know who is ready"
3. `#FFE4D7` / `#FD4612` — "Fix repeat mistakes"
4. `#E7F1E5` / `#0A972F` — "Keep every location aligned"

Breakpoints:

- `≤1180px`: `.landing-hero-character` repositioned — `position:absolute`, `top:3%`, `bottom:auto`, `left:50%`, `transform:translateX(-50%)`, `height:130%`, `width:auto`, `z-index:3`. `.landing-wordmark-stage` → `margin-bottom:11vw`. `.landing-hero-grid` → `grid-template-columns:minmax(0,1fr)`, `gap:32px`, `align-items:start`. `.landing-hero-spacer` → `display:none`. `.landing-hero-title span` → `white-space:normal`. `.landing-hero-feature-list` → `grid-template-columns:repeat(2, minmax(0,1fr))`.
- `≤640px`: `.landing-wordmark-stage` → `padding-top:12px`, `margin-bottom:13vw`. `.landing-hero-grid` → `margin-top:0`, `padding-bottom:28px`. `.landing-hero-title` → `font-size:38px`, `line-height:1.05`, `gap:6px`. `.landing-hero-copy` → `font-size:16px`. `.landing-hero-actions` → `flex-direction:column`, `align-items:stretch`, `gap:12px`; buttons/links inside → `width:100%`, `justify-content:center`. `.landing-hero-benefits-section` → `margin-top:56px`, `padding-bottom:42px`. `.landing-hero-feature-list` → `grid-template-columns:minmax(0,1fr)` (single column).

---

## 3. `components/landing/home-world.tsx` — HomeWorld

Purpose: mounts an external scroll-scrubbed 3D/canvas "world" experience (`scroll-world/scrub-engine.js`) as a pinned homepage section. Not a static CSS component — no redrawable visual spec beyond CSS custom properties it seeds:
`--sw-bg:#FAF7F0`, `--sw-ink:#071B36`, `--sw-ink-soft:rgba(7,27,54,0.65)`, `--sw-accent:#4434E8`. No layout/type/shape values live in this file; the actual rendering is inside the external script (out of scope).

---

## 4. `components/landing/feature-cards.tsx` — FeatureCards

Purpose: 3-card section "Train once. Educate every shift." with chat-preview + character illustration inside each card.

Layout — section: `max-width:1440px`, `margin:0 auto`, `padding:72px 48px 64px`, `text-align:center`.
Layout — grid (`.landing-feature-grid`): `display:grid`, `grid-template-columns:repeat(3, 1fr)`, `gap:20px`, `text-align:left`.

Type — H2 (`.landing-feature-heading`): HEADING_FONT, `47px`, `font-weight:700`, `letter-spacing:-0.01em`, `line-height:1`, `color:#0D1A2F`.
Type — subcopy (`.landing-feature-subcopy`): `18px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.31`, `margin:7px 0 40px`.

### Pattern: Feature card (white)

- Background `#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:24px 0`, `overflow:hidden`.
- Preview area (`.landing-feature-preview`): `height:270px`, `border:1px solid #E4E2E0` (top/bottom only, `border-left:none`, `border-right:none`), `display:grid`, `grid-template-columns:minmax(0,1fr)`, `align-items:center`, `padding-left:24px`.
- Title: `18px`, `font-weight:700`, `letter-spacing:-0.03em`, `color:#0D1A2F`, `margin:24px 24px 6px`.
- Body: `16px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.31`, `margin:0 24px`.

### Sub-element: chat bubble pair (in-card preview)

- Incoming bubble: `background:#F3F1F0`, `border-radius:16px`, `border-bottom-left-radius:5px`, `padding:10px 14px`, `font-size:16px`, `font-weight:500`, `letter-spacing:-0.03em`, `line-height:1.22`, `color:#0D1A2F`, `align-self:flex-start`, `max-width:min(100%,280px)`.
- Reply bubble: `background:#DBD7FD`, `border-radius:16px`, `border-bottom-right-radius:5px`, same padding/type sizing, `color:#3D2AB6`, `align-self:flex-end`, `max-width:min(85%,280px)`, `margin-top:-2px`.

### Sub-element: icon well (in-card)

`74×74`, `border-radius:17px`, background = per-card tint, `display:flex` centered, `margin-top:24px`; icon svg `36×36`, `stroke-width:2`.

### Sub-element: character image

`position:absolute`, `right:0`, `bottom:0`, `width:260px`, `height:270px`, `object-fit:cover`, `object-position:top center`, `z-index:0` (behind bubble column which has `z-index:1`).

3 cards (iconTint / iconStroke / title / image):

1. `#F1EBF8` / `#3D2AB6` — "Capture the standard" — `/assets/jory-character-capture_clay.webp`
2. `#FDEBD2` / `#D4A72C` — "Train the next hire" — `/assets/jory-character-pointing_clay.webp`
3. `#E7F1E5` / `#0A972F` — "Spot the gaps" — `/assets/jory-character-gaps_clay.webp`

Breakpoints:

- `≤1180px`: `.landing-feature-grid` → `grid-template-columns:minmax(0,1fr)`, `max-width:640px`, `margin:0 auto` (stacks to 1 column). `.landing-feature-preview` → `grid-template-columns:minmax(0,1fr)`.
- `≤640px`: `.landing-feature-cards` → `padding-top:36px`, `padding-bottom:42px`. `.landing-feature-heading` → `font-size:34px`. `.landing-feature-subcopy` → `font-size:16px`; its `<br>` → `display:none`. `.landing-feature-preview` → `height:236px`, `grid-template-columns:minmax(0,1fr)`, `padding-left:18px`. `.landing-feature-character` → `width:220px`, `height:236px`, `right:-36px`.

---

## 5. `components/landing/use-cases.tsx` — UseCases

Purpose: tabbed panel — pick an industry, see its problem statement and 3 outcome bullets. Client component (`useState`).

Layout — section: `max-width:1440px`, `padding:16px 48px 72px`.
Layout — panel (`.landing-use-cases-panel`): `background:#fff`, `border:1px solid #F0EDEA`, `border-radius:22px`, `box-shadow:0px 5px 18px rgba(3,17,40,0.05)`, `padding:32px`, `display:grid`, `grid-template-columns:minmax(0,0.82fr) minmax(0,1fr)`, `gap:32px`, `align-items:start`.

Left column:

- Eyebrow "Use cases": `color:#3E2EC0`, `15px`, `font-weight:800`, `letter-spacing:0`.
- H2 (`.landing-use-cases-heading`): HEADING_FONT, `color:#0D1A2F`, `42px`, `font-weight:800`, `line-height:1.05`.

Right column — tab list (`.landing-use-case-tabs`, `role="tablist"`): `display:flex`, `flex-wrap:wrap`, `gap:8px`, `margin-bottom:22px`.

### Pattern: pill tab button

- Unselected: `border:1px solid #E8E4DF`, `background:#FAF7F0`, `color:#0D1A2F`.
- Selected (`aria-selected`): `border:1px solid #0D1A2F`, `background:#0D1A2F`, `color:#fff`.
- Shared: `border-radius:999px`, `padding:10px 14px`, `font-size:15px`, `font-weight:800`.

Tab panel (`role="tabpanel"`): `background:#FAF7F0`, `border-radius:18px`, `padding:24px`.

- H3 (use-case label): `color:#0D1A2F`, `26px`, `font-weight:800`, `line-height:1.08`, `margin:0 0 10px`.
- Problem paragraph: `color:rgba(13,26,47,0.72)`, `18px`, `line-height:1.35`, `margin:0 0 18px`.
- Outcome list item: flex row, `gap:10px`, `color:#0D1A2F`, `17px`, `font-weight:700`, `line-height:1.28`; checkmark icon `18×18`, `stroke:#3E2EC0`, `stroke-width:2.4`.

4 use cases (label / problem / 3 outcomes each): Cafes, Construction, Cleaning, Salons — full copy in source.

States: tab hover/focus not styled explicitly beyond `aria-selected` background swap above; `cursor:pointer` on tab buttons.

Breakpoints:

- `≤1180px`: `.landing-use-cases-panel` → `grid-template-columns:minmax(0,1fr)` (stacks).
- `≤640px`: `.landing-use-cases` → `padding-top:0`, `padding-bottom:42px`. `.landing-use-cases-heading` → `font-size:32px`. `.landing-use-cases-panel` → `border-radius:18px`, `padding:22px 18px`, `gap:22px`. `.landing-use-case-tabs button` → `flex:1 1 calc(50% - 8px)` (2-per-row).

---

## 6. `components/landing/why-teaser.tsx` — WhyTeaser

Purpose: single promo band linking to `/why`, on the homepage.

Layout: section `max-width:1440px`, `padding:0 48px 48px`. Inner panel: `background:#F1EBF8`, `border:1px solid #F0EDEA`, `border-radius:22px`, `padding:40px 48px`, `display:flex`, `align-items:center`, `justify-content:space-between`, `gap:32px`.

Eyebrow "An inside look": `color:#3E2EC0`, `13px`, `font-weight:700`, `letter-spacing:0.14em`, `text-transform:uppercase`, `margin:0 0 12px`.
H2 "Why we're building Jory": HEADING_FONT, `32px`, `font-weight:700`, `letter-spacing:-0.02em`, `color:#0D1A2F`, `line-height:1.1`, `margin:0 0 12px`.
Body: `17px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.01em`, `line-height:1.5`, `max-width:560px`.

### Pattern: pill link CTA (secondary style)

Background `#01102B`, color `#fff`, `border-radius:999px`, `padding:14px 24px`, `font-size:16px`, `font-weight:600`, `letter-spacing:-0.01em`, no border, no shadow. (Distinct from the primary rounded-rect CTA button pattern — this is a fully-pill, icon-less link.)

Breakpoints:

- `≤640px`: `.why-teaser > div` → `flex-direction:column`, `align-items:stretch`, `text-align:left`.

---

## 7. `components/landing/cta-card.tsx` — CtaCard

Purpose: 3-column CTA band with headline, phone mockup, and signup on the homepage.

Layout — section: `max-width:1440px`, `padding:0 48px`.
Layout — panel (`.landing-cta-panel`): `background:#EBE5F6`, `border-radius:22px`, `height:265px`, `display:grid`, `grid-template-columns:391px 1fr 334px`, `align-items:center`, `padding:0 40px`, `gap:40px`, `overflow:hidden`, `position:relative`.

### Left column

H2 (`.landing-cta-heading`): HEADING_FONT, `50px`, `font-weight:700`, `letter-spacing:-0.01em`, `line-height:56px`.

- Line "No app." — `color:#0D1A2F`.
- Line "Just text." — `color:#3E2EC0`.
  Copy (`.landing-cta-copy`): `21px`, `color:#0D1A2F`, `letter-spacing:-0.03em`, `line-height:1.31`, `margin:16px 0 0`.

### Middle — phone mockup (`.landing-cta-phone`)

Frame: `width:369px`, `background:#fff`, `border:9px solid #000`, `border-radius:40px 40px 0 0`, `padding:22px 31px 0`, `margin-top:12px`, `height:253px`, `overflow:hidden`.

Phone header: avatar circle `56×56`, `border-radius:50%`, `background:#F5EFE9`, image `/assets/jory-avatar_clay.webp` (`object-fit:cover`). Name "Jory": `24px`, `font-weight:700`, `letter-spacing:-0.03em`, `color:#0D1A2F`, `line-height:1.31`. Status "Online": `13px`, `letter-spacing:-0.03em`, `color:#0D1A2F` at `opacity:0.5`, `line-height:1.31`.

### Pattern: Chat bubble pair (phone mockup variant)

- Incoming: `background:#F3F1F0`, `border-radius:16px` (all corners, no tail cut here), `padding:12px 14px`, `font-size:18px`, `font-weight:500`, `letter-spacing:-0.03em`, `line-height:1.22`, `color:#0D1A2F`, `align-self:flex-start`, `max-width:205px`.
- Reply: `background:#DBD7FD`, `border-radius:16px`, `padding:14px`, `font-size:18px`, `font-weight:500`, `letter-spacing:-0.03em`, `line-height:1.22`, text `color:#3D2AB6`, `align-self:flex-end`, `max-width:226px`.

### Right column

H3 "Try it with your team": HEADING_FONT, `32px`, `font-weight:700`, `letter-spacing:-0.01em`, `line-height:1`, `color:#0D1A2F`.
Copy (`.landing-cta-side-copy`): `21px`, `color:#0D1A2F`, `letter-spacing:-0.03em`, `line-height:1.31`, `margin:16px 0 16px`.

### Pattern: Primary CTA button (large variant)

Background `#01102B`, color `#fff`, `border:0`, `border-radius:16px`, `padding:20px`, `font-size:20px`, `font-weight:700`, `letter-spacing:-0.03em`, `height:68px`, `gap:10px`. Icon `22×22`, `stroke:currentColor`, `stroke-width:2.2`.

Breakpoints:

- `≤1180px`: `.landing-cta-panel` → `height:auto`, `grid-template-columns:minmax(0,1fr)` (stacks), `padding:36px`, `gap:28px`. `.landing-cta-phone-wrap` → `height:265px`, `order:3`. `.landing-cta-phone` → `width:min(100%,369px)`.
- `≤640px`: `.landing-cta-panel` → `border-radius:18px`, `padding:28px 18px 0`. `.landing-cta-heading` → `font-size:36px`, `line-height:1.05`. `.landing-cta-copy`/`.landing-cta-side-copy` → `font-size:17px`; heading/copy `<br>` → `display:none`. `.landing-cta-phone` → `border-width:7px`, `border-radius:32px 32px 0 0`, `padding:18px 20px 0`.

---

## 8. `components/landing/footer.tsx` — Footer

Layout: `max-width:1440px`, `padding:22px 48px 32px`, `display:flex`, `justify-content:space-between`, `align-items:center`.
Type: copyright text and "Terms of Service" link both `16px`, `letter-spacing:-0.03em`, `color:rgba(13,26,47,0.7)`; link has `text-decoration:none`.
Content: "© 2026. Jory" / link to `/terms`.

Breakpoints:

- `≤640px`: `.landing-footer` → `flex-direction:column`, `align-items:flex-start`, `gap:14px`, `padding-top:20px`.

---

## 9. `components/landing/signup-button.tsx` + `signup-dialog.tsx` — Signup flow

`SignupButton` is a thin behavioral wrapper (client component): renders a `<button>` with whatever `style`/props are passed by the caller (no styling of its own) and opens `SignupDialog` on click. Its own visual spec is defined by each call site above (Nav, Hero, CtaCard, why-cta, features/how-it-works/security/about pages, pricing).

### SignupDialog — modal

Overlay: `position:fixed`, `inset:0`, `background:rgba(7,27,54,0.55)`, `backdrop-filter:blur(2px)`, centers content, `z-index:1000`.
Dialog box: `background:#fff`, `border-radius:20px`, `width:420px`, `max-width:calc(100vw - 32px)`, `padding:28px`, `box-shadow:0 24px 60px rgba(7,27,54,0.25)`, font-family HEADING_FONT, `color:#0D1A2F`, `position:relative`.

Close button: `position:absolute`, `top:16px`, `right:16px`, `32×32`, `border-radius:999px`, `border:0`, `background:transparent`, `color:#5A6A82`; icon X `18×18`, `stroke-width:2`.

Title "Get early access": `26px`, `font-weight:800`, `letter-spacing:-0.02em`, `line-height:1.15`.
Description text: `16px`, `line-height:1.45`, `color:rgba(13,26,47,0.7)`.
Success message state ("You're on the list…"): same description styling, shown instead of the form when `signup.state === "sent"`.

Email input: `width:100%`, `padding:14px 16px`, `border-radius:12px`, `border:1px solid #E4E2E0`, `font-size:16px`, `color:#0D1A2F`.
Error text (validation state): `color:#B3261E`, `font-size:14px`, `margin:10px 0 0`.

### Pattern: Full-width submit button

Background `#01102B`, color `#fff`, `border-radius:14px`, `padding:14px 18px`, `font-size:17px`, `font-weight:700`, `letter-spacing:-0.02em`, `border:0`, `width:100%`. Disabled state: `disabled={signup.state === "submitting"}` (no separate disabled visual style coded — browser default dimming applies); label text swaps to "Sending…" while submitting.

Fine-print: `13px`, `color:rgba(13,26,47,0.55)`, `line-height:1.45`.

States seen in code: `open`/closed (conditional render), Escape key closes, `signup.state` = idle / submitting / sent (label + form/success swap), `signup.error` (renders error text when present).

No dialog-specific breakpoint overrides found in globals.css (dialog uses `max-width:calc(100vw - 32px)` inline for its own responsiveness).

---

## 10. `app/features/page.tsx` — Features page

### Hero

Section: `max-width:1440px`, `padding:64px 48px 48px`, `text-align:center`.
H1: HEADING_FONT, `58px`, `font-weight:700`, `letter-spacing:-0.02em`, `line-height:1`, `color:#0D1A2F`. Text: "Built for high-turnover teams".
Subcopy: `20px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.4`, `max-width:560px`, centered.

### Feature grid (`.marketing-card-grid`)

`display:grid`, `grid-template-columns:repeat(3,1fr)`, `gap:20px`, section `padding:0 48px 80px`.

### Pattern: marketing-card (white, icon-top)

`background:#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:32px`.
Icon well: `56×56`, `border-radius:16px`, background = tint, icon `26×26`, `stroke-width:2`, `margin-bottom:20px`.
Title (h2): `20px`, `font-weight:700`, `letter-spacing:-0.03em`, `color:#0D1A2F`, `margin:0 0 10px`.
Body: `16px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.5`.

6 cards (tint/stroke/title): `#F1EBF8`/`#3D2AB6` Pre-shift training; `#FDEBD2`/`#D4A72C` Multimodal standard capture; `#E7F1E5`/`#0A972F` Signed policy proof; `#FFE4D7`/`#FD4612` Shift standard checks; `#EDE8FF`/`#4434E8` Multi-location accountability; `#FFF1CF`/`#D4A72C` Grounded staff Q&A.

### CTA strip (`.landing-cta` / `.marketing-split-cta`) — reused pattern

See "Pattern: marketing split CTA panel" below (identical structure reused on features / how-it-works / security pages).

Breakpoints:

- `≤1180px`: `.marketing-card-grid` (shared selector with `.pricing-tier-grid`, `.security-card-grid`) → `grid-template-columns:repeat(2, minmax(0,1fr))`. `.marketing-split-cta` → (see shared rule) `flex-direction:column`, `align-items:stretch`.
- `≤640px`: `.marketing-card-grid` → `grid-template-columns:minmax(0,1fr)`. `.marketing-card` → `border-radius:18px`, `padding:28px 18px`. `.marketing-split-cta` button → `width:100%`, `justify-content:center`, `white-space:normal`.

---

## 11. `app/how-it-works/page.tsx` — How it works page

### Hero

Same structural pattern as Features hero: H1 `58px`/`700`/`-0.02em`/`line-height:1`/`#0D1A2F`, text "Teach. Train. Prove."; subcopy `20px`, `rgba(13,26,47,0.7)`, `max-width:520px`.

### Steps list (3 rows, `.how-step-card`)

Section: `display:flex`, `flex-direction:column`, `gap:20px`, `padding:0 48px 80px`.

### Pattern: how-step-card

`background:#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:40px 48px`, `display:grid`, `grid-template-columns:80px 1fr 320px`, `gap:40px`, `align-items:center`.

Step-number well: `72×72`, `border-radius:20px`, background = tint; number text `36px`, `font-weight:900`, `letter-spacing:-0.04em`, color = stroke, `line-height:1`.
Title (h2): `28px`, `font-weight:700`, `letter-spacing:-0.02em`, `color:#0D1A2F`.
Body: `17px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.55`, `max-width:520px`.

Chat preview (`.how-step-chat`): `background:#F8F7F5`, `border-radius:16px`, `padding:20px`, `display:flex` column `gap:10px`.

- Example bubble: `background:#F3F1F0`, `border-radius:14px`, `padding:12px 14px`, `15px`, `font-weight:500`, `letter-spacing:-0.03em`, `line-height:1.3`, `color:#0D1A2F`, `align-self:flex-start`.
- Reply bubble: `background:#DBD7FD`, same box metrics, `color:#3D2AB6`, `align-self:flex-end`.

3 steps (tint/stroke/title): `#F1EBF8`/`#3D2AB6` Teach — capture the standard; `#FDEBD2`/`#D4A72C` Train — employees complete and sign; `#E7F1E5`/`#0A972F` Run — checks, proof, and follow-up.

### CTA strip: shared marketing-split-cta pattern (see below).

Breakpoints:

- `≤1180px`: `.how-step-card` → `grid-template-columns:64px minmax(0,1fr)` (chat column drops below content), `gap:24px`, `align-items:start`. `.how-step-chat` → `grid-column:2`, `width:100%`.
- `≤640px`: `.how-step-card` → `grid-template-columns:minmax(0,1fr)`, `gap:18px`, `padding:28px 18px`. `.how-step-chat` → `grid-column:auto`.

---

## 12. `app/how-it-works-scroll/page.tsx` — How-it-works-scroll page

Renders only `<HowItWorksMount />`, which (per `home-world.tsx`'s pattern) mounts an external scroll-engine experience. No CSS/JSX visual spec lives in `page.tsx` itself — out of scope for static redraw beyond noting its existence as an alternate `/how-it-works-scroll` route with its own metadata title/description.

---

## 13. `app/pricing/page.tsx` — Pricing page

### Hero

H1 `58px`/`700`/`-0.02em`/`line-height:1`/`#0D1A2F`, text "Free to use"; subcopy `20px`, `rgba(13,26,47,0.7)`, `max-width:480px`.

### Pattern: pricing-tier-card (single card, centered, `max-width:520px`)

`background:#EBE5F6`, `border-radius:22px`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:36px 32px`, `display:flex` column.

Eyebrow "Everything": `14px`, `font-weight:700`, `letter-spacing:0.06em`, `text-transform:uppercase`, `color:rgba(13,26,47,0.5)`.
Price row (`.pricing-price-row`): flex `align-items:baseline`, `gap:6px`. "$0": `52px`, `font-weight:800`, `letter-spacing:-0.03em`, `color:#3E2EC0`, `line-height:1`. "free to use": `16px`, `color:rgba(13,26,47,0.5)`, `letter-spacing:-0.02em`.
Description: `16px`, `color:rgba(13,26,47,0.6)`, `letter-spacing:-0.03em`, `line-height:1.4`.

Included list item: flex, `gap:10px`, `16px`, `color:#0D1A2F`, `letter-spacing:-0.02em`; checkmark icon `16×16`, `stroke:#3E2EC0`, `stroke-width:2.5`.
6 items: Unlimited employees; Text-based training over iMessage; Cited procedure Q&A; Signed proof of training; Manager follow-up loops; Full audit trail.

CTA button (full width variant): background `#3E2EC0` (note: differs from the `#01102B` primary elsewhere), color `#fff`, `border-radius:14px`, `padding:16px 20px`, `font-size:17px`, `font-weight:700`, `letter-spacing:-0.02em`, `width:100%`, `height:56px`; icon `18×18`, `stroke-width:2.2`.

Footnote link line: `15px`, `color:rgba(13,26,47,0.5)`, `letter-spacing:-0.02em`, centered, links to `/terms` with `text-decoration:underline`.

Breakpoints:

- `≤1180px`: `.pricing-tier-grid` shares the `marketing-card-grid`/`security-card-grid` rule → `repeat(2, minmax(0,1fr))` (not actually applicable since this page uses a single centered card, not `.pricing-tier-grid`; the file comments this explicitly: "Single card — deliberately not `.pricing-tier-grid`").
- `≤640px`: `.pricing-tier-card` → `border-radius:18px`, `padding:28px 18px` (shared rule with `.marketing-card`, etc). `.pricing-price-row` → `align-items:flex-start`, `flex-direction:column`, `gap:4px`.

---

## 14. `app/security/page.tsx` — Security page

### Hero

H1 `58px`/`700`/`-0.02em`/`line-height:1`/`#0D1A2F`, text "Trust is the architecture"; subcopy `20px`, `rgba(13,26,47,0.7)`, `max-width:540px`.

### Security card grid (`.security-card-grid`)

`display:grid`, `grid-template-columns:repeat(2,1fr)`, `gap:20px`.

### Pattern: security-card (icon-left, horizontal)

`background:#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:36px`, `display:flex`, `gap:24px`, `align-items:flex-start`.
Icon well: `56×56`, `border-radius:16px`, background = tint, icon `26×26`, `stroke-width:2`.
Title (h2): `20px`, `font-weight:700`, `letter-spacing:-0.03em`, `color:#0D1A2F`.
Body: `16px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.55`.

4 cards (tint/stroke/title): `#EDE8FF`/`#3E2EC0` Cross-tenant isolation by design; `#E7F1E5`/`#0A972F` The agent can't bypass the gateway; `#F1EBF8`/`#3D2AB6` Append-only audit, every state change; `#FDEBD2`/`#D4A72C` Employee privacy isn't an afterthought.

### Pattern: marketing-dark-panel (dark statement block)

`background:#071B36`, `border-radius:22px`, `padding:48px 56px`, `display:flex` column `gap:16px`.
H2: HEADING_FONT, `36px`, `font-weight:700`, `letter-spacing:-0.02em`, `line-height:1.1`, `color:#EDE8FF`.
Body: `17px`, `color:rgba(237,232,255,0.75)`, `letter-spacing:-0.03em`, `line-height:1.6`, `max-width:680px`.

(Note: `about/page.tsx`'s "Team card" reuses the `marketing-dark-panel` class name but with `background:#EDE8FF` and dark ink text — see section 16. The class is shared, but its inline background is overridden per page, so it is a shared layout pattern with two distinct color treatments.)

### CTA strip: shared marketing-split-cta pattern.

Breakpoints:

- `≤1180px`: `.security-card-grid` → `repeat(2, minmax(0,1fr))` (unchanged — same value as base; the grid stays 2-up at this width via the shared rule with `.marketing-card-grid`/`.pricing-tier-grid`).
- `≤640px`: `.security-card-grid` → `grid-template-columns:minmax(0,1fr)`. `.security-card` → `border-radius:18px`, `padding:28px 18px` (shared), plus its own `flex-direction:column`, `gap:18px`.

---

## 15. Shared pattern: "marketing split CTA panel" (`.landing-cta` / `.marketing-split-cta`)

Used at the bottom of `features`, `how-it-works`, and `security` pages (identical structure each time, copy differs).

Layout: section `max-width:1440px`, `padding:0 48px 64px`. Panel: `background:#EBE5F6`, `border-radius:22px`, `padding:48px 56px`, `display:flex`, `align-items:center`, `justify-content:space-between`, `gap:40px`.
H2: HEADING_FONT, `40px`, `font-weight:700`, `letter-spacing:-0.02em`, `line-height:1.1`, `color:#0D1A2F`.
Body: `18px`, `color:#0D1A2F`, `letter-spacing:-0.03em`, `line-height:1.4`, `margin:12px 0 0`.
CTA button: same "Primary CTA button (large variant)" spec as `cta-card.tsx` — `#01102B` bg, `#fff` text, `border-radius:16px`, `padding:20px 28px`, `font-size:20px`, `font-weight:700`, `height:68px`, plane icon `22×22`.

Breakpoints:

- `≤1180px`: `.marketing-split-cta` (shared with `.marketing-contact-card`) → `flex-direction:column`, `align-items:stretch`.
- `≤640px`: `.marketing-split-cta` (shared with `.marketing-card`, `.pricing-tier-card`, `.security-card`, `.about-story-grid`, `.marketing-dark-panel`, `.marketing-contact-card`) → `border-radius:18px`, `padding:28px 18px`. Its buttons → `width:100%`, `justify-content:center`, `white-space:normal`.

---

## 16. `app/about/page.tsx` — About page

### Hero

H1: HEADING_FONT, `58px`, `font-weight:700`, `letter-spacing:-0.02em`, `line-height:1`, two lines — "Software finally" (`color:#0D1A2F`) / "shows up at the bar." (`color:#3E2EC0`).
Subcopy: `20px`, `rgba(13,26,47,0.7)`, `max-width:560px`.

### Story card (`.about-story-grid`)

`background:#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:48px 56px`, `display:grid`, `grid-template-columns:1fr 1fr`, `gap:64px`, `align-items:start`.
Column H2 ("The story so far" / "Our mission"): `32px`, `font-weight:700`, `letter-spacing:-0.02em`, `color:#0D1A2F`, `line-height:1.1`.
Body paragraphs: `17px`, `color:rgba(13,26,47,0.75)`, `letter-spacing:-0.03em`, `line-height:1.65`.

### Team card (`.marketing-dark-panel` — light variant on this page)

`background:#EDE8FF`, `border-radius:22px`, `padding:48px 56px` (no border/shadow coded).
H2 "The team behind Jory": `32px`, `font-weight:700`, `letter-spacing:-0.02em`, `color:#0D1A2F`, `line-height:1.1`.
Body: `17px`, `color:rgba(13,26,47,0.75)`, `letter-spacing:-0.03em`, `line-height:1.65`, `max-width:680px`.

### Contact card (`.marketing-contact-card`)

`background:#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, `padding:40px 56px`, `display:flex`, `align-items:center`, `justify-content:space-between`, `gap:40px`.
H2 "Get in touch": `26px`, `font-weight:700`, `letter-spacing:-0.02em`, `color:#0D1A2F`, `margin:0 0 8px`.
Body: `17px`, `color:rgba(13,26,47,0.7)`, `letter-spacing:-0.03em`, `line-height:1.5`; inline mail link `hello@jory.ai` `color:#3E2EC0`, `text-decoration:underline`, `text-underline-offset:3px`.
CTA button: Primary CTA button variant, `padding:16px 24px`, `font-size:18px`, `height:60px`, icon `18×18`.

Breakpoints:

- `≤1180px`: `.about-story-grid` → `grid-template-columns:minmax(0,1fr)`, `gap:32px` (stacks). `.marketing-contact-card` → `flex-direction:column`, `align-items:stretch` (shared rule with `.marketing-split-cta`).
- `≤640px`: `.about-story-grid`, `.marketing-dark-panel`, `.marketing-contact-card` → `border-radius:18px`, `padding:28px 18px` (shared rule). `.marketing-contact-card` button → `width:100%`, `justify-content:center`, `white-space:normal`.

---

## 17. `app/terms/page.tsx` — Terms page

Layout: `max-width:760px`, `margin:0 auto`, `padding:64px 48px 80px`.
H1 "Terms of Service": HEADING_FONT, `48px`, `font-weight:700`, `letter-spacing:-0.02em`, `line-height:1.05`, `color:#0D1A2F`.
"Last updated" line: `15px`, `color:rgba(13,26,47,0.5)`, `letter-spacing:-0.02em`.
Section H2: HEADING_FONT, `24px`, `font-weight:700`, `letter-spacing:-0.02em`, `color:#0D1A2F`; each section block `margin-top:36px`.
Section paragraph: `17px`, `color:rgba(13,26,47,0.75)`, `letter-spacing:-0.02em`, `line-height:1.55`, `margin-top:12px`.
8 sections: What Jory is; Jory is free to use; Your content; How we use your data to improve Jory; Acceptable use; Disclaimers; Changes to these terms; Contact.

No component-specific breakpoint rules found for `.terms`-scoped classes in globals.css (only the generic `.landing-section` padding rules at ≤1180px/≤640px apply).

---

## 18. `app/why/page.tsx` composition

Assembles, in order: `Nav`, `WhyHero`, `WhyPoints`, `WhyProblem`, `WhyCosts`, `WhySystem`, `WhyProof`, `WhyStandards`, `WhyNote`, `WhyCta`, `Footer`. Each is cataloged below.

### 18a. `components/why/why-hero.tsx` — WhyHero

Hero section: `max-width:1040px`, `padding:64px 48px 0`.
Eyebrow pill "An inside look": `13px`, `font-weight:600`, `letter-spacing:0.14em`, `text-transform:uppercase`, `color:#3E2EC0`, `background:#F1EBF8`, `border-radius:999px`, `padding:6px 14px`, `margin-bottom:26px`.
H1: HEADING_FONT, `font-weight:800`, `font-size:clamp(40px, 6.5vw, 62px)`, `line-height:1.02`, `letter-spacing:-0.02em`, `color:#0D1A2F` with inline `<span style="color:#3E2EC0">Jory</span>`.
Body: `21px`, `line-height:1.5`, `color:rgba(13,26,47,0.7)`, `max-width:620px`.
Byline: `14px`, `color:rgba(13,26,47,0.5)`.

Panel (`.why-hero-panel`): `background:#F1EBF8`, `border:1px solid #F0EDEA`, `border-radius:24px`, `padding:36px 36px 0`, `display:flex`, `align-items:flex-end`, `justify-content:space-between`, `gap:24px`, `overflow:hidden`, `position:relative`. Outer wrapper `max-width:1040px`, `margin:36px auto 0`.

### Sub-element: dark chat bubble pair (why-hero variant)

- Bubble 1 (owner message): `background:#0D1A2F`, `color:#fff`, `border-radius:16px`, `border-bottom-left-radius:4px`, `padding:12px 16px`, `font-size:15px`, `line-height:1.4`, `max-width:340px`, `box-shadow:0 5px 10px rgba(3,17,40,0.06)`, `margin-bottom:10px`.
- Bubble 2 (Jory reply): `background:#fff`, `color:#0D1A2F`, same radius/padding/shadow, `border-bottom-left-radius:4px` (both bubbles left-aligned, unlike other bubble patterns which alternate sides), `margin-bottom:0`.

Character image `/assets/jory-avatar_desk_clay.webp`: `width:min(38vw,360px)`.
Desk backdrop (`.why-hero-desk`): `position:absolute`, full-width strip at bottom, `background:#FAF7EF`, `height:calc(min(38vw,360px) * 0.1856)`, `z-index:0`.

Breakpoints:

- `≤1180px`: `.why-hero-panel` → `flex-direction:column`, `align-items:flex-start`, `padding:28px 24px 0`. `.why-hero-character` → `width:min(70vw,320px)`, `align-self:flex-end`. `.why-hero-desk` → `height:calc(min(70vw,320px) * 0.1856)`.

### 18b. `components/why/why-points.tsx` — WhyPoints

Section: `max-width:720px`, `padding:56px 48px`, class `why-section`.
Eyebrow "The short version": `13px`, `font-weight:600`, `letter-spacing:0.14em`, `text-transform:uppercase`, `color:rgba(13,26,47,0.5)`.
H2 "What you need to know about Jory": HEADING_FONT, `font-weight:700`, `font-size:clamp(28px,4vw,38px)`, `line-height:1.1`, `letter-spacing:-0.02em`, `color:#0D1A2F`.

### Pattern: numbered row (`.why-points-row`)

`display:grid`, `grid-template-columns:64px 1fr`, `gap:20px`, `padding:26px 0`, `border-top:1px solid #F0EDEA`.
Number ("01"–"05"): HEADING_FONT, `font-weight:700`, `26px`, `color:#3E2EC0`, `line-height:1.2`.
Row title (h3): `21px`, `font-weight:700`, `line-height:1.25`, `color:#0D1A2F`, `letter-spacing:-0.02em`.
Row body: `17px`, `color:rgba(13,26,47,0.7)`.
5 rows of copy (see source for full text).

Breakpoints:

- `≤640px`: `.why-points-row` → `grid-template-columns:44px 1fr`, `gap:14px`.

### 18c. `components/why/why-problem.tsx` — WhyProblem

Two stacked sections.

1. "The problem" section: `background:#FAF9F7`, `border-top:1px solid #F0EDEA`, `border-bottom:1px solid #F0EDEA`; inner `why-section` `max-width:720px`, `padding:56px 48px`. Same eyebrow/H2 type spec as WhyPoints (`13px` eyebrow, `clamp(28px,4vw,38px)` H2). Body paragraphs `rgba(13,26,47,0.7)` (no explicit font-size set — inherits body default `16px`/`1.5`), inline `<strong>` in `#0D1A2F` `font-weight:600` for emphasis ("we told them" is not a record.).
2. Pull-quote section: `background:#0D1A2F`, `padding:72px 0`; inner `max-width:720px`, `padding:0 48px`. Blockquote: HEADING_FONT, `font-weight:700`, `font-size:clamp(28px,4.5vw,42px)`, `line-height:1.15`, `letter-spacing:-0.02em`, `color:#fff`, with inline `<span style="color:#B3A6FF">` highlight on "one person's head."

### 18d. `components/why/why-costs.tsx` — WhyCosts

Section: `background:#fff`; inner `max-width:720px`, `padding:56px 48px`.
Eyebrow "The bill" / H2 "Small teams pay the most for compliance": same type spec pattern as above.
Body text block: `color:rgba(13,26,47,0.7)`, `font-size:18px`, `line-height:1.55`.

### Pattern: stat card (`.why-costs-grid`, 2-up)

Grid: `repeat(2,1fr)`, `gap:14px`.
Card: `border:1px solid #F0EDEA`, `border-radius:16px`, `background:#FAF9F7`, `padding:18px 20px`.
Figure: HEADING_FONT, `font-weight:700`, `34px`, `letter-spacing:-0.02em`, `color:#3E2EC0`, `margin-bottom:4px`.
Caption: `15px`, `line-height:1.45`.
2 stats: `$14,700` (federal-regulation cost per employee/yr, firms <50 employees); `$12,200` (same cost, firms ≥100 employees). Source citation line: `13px`, `color:rgba(13,26,47,0.5)` — "Crain & Crain, The Cost of Federal Regulation to the U.S. Economy… 2023."

Breakpoints:

- `≤1180px`: `.why-costs-grid` → `grid-template-columns:minmax(0,1fr)` (stacks to 1 column).

### 18e. `components/why/why-system.tsx` — WhySystem

Section: `max-width:1040px`, `padding:56px 48px`, class `why-section`.
Intro block `max-width:720px`: eyebrow "How Jory works", H2 "One system, five parts" (same type spec pattern), body paragraph.

### Pattern: numbered system card (`.why-system-grid`, 2-up + 1 wide)

Grid: `repeat(2,1fr)`, `gap:18px`, `margin-top:34px`.
Card: `border:1px solid #F0EDEA`, `border-radius:20px`, `padding:26px`, `background:#fff`, `box-shadow:0 5px 10px rgba(3,17,40,0.06)`.
Number chip: `34×34`, `border-radius:10px`, HEADING_FONT, `font-weight:700`, `16px`, background = tint, color = card color, centered.
Title (h3): `20px`, `font-weight:700`, `color:#0D1A2F`, `letter-spacing:-0.02em`, `margin-bottom:8px`.
Body: `16px`, `color:rgba(13,26,47,0.7)`.
4 cards (tint/color/title): `#F1EBF8`/`#3D2AB6` "Capture the standard"; `#FDEBD2`/`#FDAD0E` "Get the manual"; `#FFE4D7`/`#FD4612` "Onboard by text"; `#E7F1E5`/`#0A972F` "Answer from your standards".

### Wide card 5 (`.why-system-wide`, spans both columns)

`grid-column:1/-1`, same border/radius/shadow as card, `display:grid`, `grid-template-columns:1fr 220px`, `gap:24px`, `align-items:end`, `overflow:hidden`, `padding:26px 0 0 26px`.
Number chip 5: `#F1EBF8` bg / `#3D2AB6` text, same 34×34 spec.
Title "Keep the record" + body, same type spec as the 4 cards.
Image: `/assets/jory-character-gaps_clay.webp`, `width:220px`, `display:block`, right-aligned via grid column.

Breakpoints:

- `≤1180px`: `.why-system-grid` → `grid-template-columns:minmax(0,1fr)` (stacks). `.why-system-wide` → `grid-template-columns:minmax(0,1fr)`; its `img` → `justify-self:end`.

### 18f. `components/why/why-proof.tsx` — WhyProof

Section: `background:#FAF9F7`, `border-top`/`border-bottom:1px solid #F0EDEA`; inner `max-width:720px`, `padding:56px 48px`.
Eyebrow "The part nobody else treats as the product" / H2 "Proof, not paperwork" — same type pattern. Body paragraphs default body size (no explicit font-size; inherits `16px`), `color:rgba(13,26,47,0.7)`.

### 18g. `components/why/why-standards.tsx` — WhyStandards

Section: `max-width:720px`, `padding:56px 48px`, class `why-section`.
Eyebrow "Who it's for" / H2 "Built for businesses that run on standards" — same type pattern. Intro paragraph `color:rgba(13,26,47,0.7)` (inherits default size).

### Pattern: standard tile (`.why-standards-grid`, 2-up)

Grid: `repeat(2,1fr)`, `gap:14px`, `margin-top:30px`.
Tile: `border:1px solid #F0EDEA`, `border-radius:16px`, `background:#fff`, `padding:18px 20px`, `font-size:16px`, `color:rgba(13,26,47,0.7)`.
Label (`<strong>`): `display:block`, `color:#0D1A2F`, `font-weight:600`, `margin-bottom:3px`.
4 tiles: Food service; Construction & trades; Cleaning services; Salons & front desks.

Breakpoints:

- `≤1180px`: `.why-standards-grid` → `grid-template-columns:minmax(0,1fr)`.

### 18h. `components/why/why-note.tsx` — WhyNote

Outer section: `background:#FAF9F7`, `border-top`/`border-bottom:1px solid #F0EDEA`; inner `max-width:720px`, `padding:56px 48px`.

### Pattern: callout card (mustard)

`border:1px solid #F0EDEA`, `border-radius:24px`, `background:#FDEBD2`, `padding:40px`.
Eyebrow "A note from us": `13px`, `font-weight:600`, `letter-spacing:0.14em`, `text-transform:uppercase`, `color:rgba(13,26,47,0.5)`.
Body paragraphs: `color:#0D1A2F`, `font-size:18px`.
Signature "— The Jory team": `font-weight:600`, `color:#0D1A2F`, `margin-top:26px`.

### 18i. `components/why/why-cta.tsx` — WhyCta

Section: `max-width:1040px`, `padding:56px 48px`, class `why-section`.

### Pattern: purple CTA block

`background:#3E2EC0`, `border-radius:28px`, `padding:56px 40px`, `text-align:center`, `color:#fff`, `display:flex` column `align-items:center`, `gap:20px`.
H2 "See how Jory works": HEADING_FONT, `font-weight:700`, `font-size:clamp(28px,4vw,38px)`, `line-height:1.1`, `letter-spacing:-0.02em`, `color:#fff`.
Body: `color:rgba(255,255,255,0.8)`, `max-width:480px` (default font-size).
Action row (`.why-cta-actions`): `display:flex`, `gap:12px`, `flex-wrap:wrap`, centered.

- Link pill "How it works": `border-radius:999px`, `padding:14px 28px`, `font-weight:600`, `font-size:16px`, `letter-spacing:-0.01em`, `background:#fff`, `color:#3E2EC0`.
- SignupButton pill "Get early access": same radius/padding/weight/size, `border:1px solid rgba(255,255,255,0.4)`, `background:transparent`, `color:#fff`.

No `.why-cta`-specific breakpoint rule beyond the generic `.landing-section`/`.why-section` padding rules at ≤640px (`.why-section` → `padding-top:36px`, `padding-bottom:36px`).

---

# Pattern list (de-duplicated)

1. **Primary CTA button (dark, plane icon)** — `background:#01102B`, `color:#fff`, `border:0`, `border-radius:16px`, `font-weight:700`, `letter-spacing:-0.03em`, plane-path SVG icon `stroke:currentColor` `stroke-width:2.2`, `gap:10px`, `box-sizing:border-box`. Sizes vary by call site: Nav (`padding:14px 16px`, `font-size:18px`, `height:52px`, icon in `24×24` well with `14×14` glyph), Hero (`padding:16px 20px`, `font-size:18px`, `height:56px`, icon `20×20`), CtaCard/features/how-it-works/security CTA strips (`padding:20px`/`20px 28px`, `font-size:20px`, `height:68px`, icon `22×22`), About contact card (`padding:16px 24px`, `font-size:18px`, `height:60px`, icon `18×18`). Used by: Nav, Hero, CtaCard, Features page, How-it-works page, Security page, About page.
2. **Secondary link button (white, outlined)** — `background:#fff`, `color:#0D1A2F`, `border:1px solid #E4E2E0`, `box-shadow:0px 4px 15px 0px rgba(3,17,40,0.06)`, `border-radius:16px`, `font-weight:700`, `letter-spacing:-0.03em`. Used by: Hero ("See how it works").
3. **Pill CTA (secondary, dark-on-light)** — `background:#01102B`, `color:#fff`, `border-radius:999px`, `padding:14px 24px`, `font-size:16px`, `font-weight:600`, `letter-spacing:-0.01em`, no border/shadow/icon. Used by: WhyTeaser.
4. **Pill CTA pair (purple block)** — white-on-purple pill (`background:#fff`, `color:#3E2EC0`) + transparent-on-purple pill (`border:1px solid rgba(255,255,255,0.4)`, `color:#fff`), both `border-radius:999px`, `padding:14px 28px`, `font-weight:600`, `font-size:16px`, `letter-spacing:-0.01em`. Used by: WhyCta.
5. **Marketing card (white, icon-top, 22px radius)** — `background:#fff`, `border-radius:22px`, `border:1px solid #F5F4F3`, `box-shadow:0px 5px 10px 0px rgba(3,17,40,0.06)`, icon well `56×56`/`border-radius:16px` (except FeatureCards' larger `74×74`/`17px` well and `270px`-tall preview band). Used by: FeatureCards (homepage), Features page cards, How-it-works step cards (horizontal variant), Security cards (horizontal variant).
6. **Icon well** — square, `border-radius` scaled to size (16px at 52-56px, 17px at 74px, 10px at 34px, 20px at 72px), background = a pastel tint, centered `stroke`-only SVG icon colored to match a saturated "stroke" companion color. Recurring tint/stroke pairs across the whole surface: `#F1EBF8`/`#3D2AB6` (purple), `#FDEBD2`/`#D4A72C` or `/#FDAD0E` (amber), `#E7F1E5`/`#0A972F` (green), `#FFE4D7`/`#FD4612` (orange-red), `#EDE8FF`/`#3E2EC0` or `/#4434E8` (indigo), `#FFF1CF`/`#D4A72C` (yellow). Used by: Hero benefit strip, FeatureCards, Features page, How-it-works steps, Security cards, WhySystem cards.
7. **Chat bubble pair** — two-message exchange, incoming bubble left-aligned in a light neutral (`#F3F1F0`) with dark ink text, reply bubble right-aligned in light purple (`#DBD7FD`) with saturated purple text (`#3D2AB6`/`#3D2AB6`). Radius `14-16px`, sometimes with one corner "tail" cut to `4-5px`. Variant in WhyHero uses dark/white bubbles instead, both left-aligned. Used by: FeatureCards preview, CtaCard phone mockup, How-it-works step chat previews, WhyHero panel (dark variant).
8. **Eyebrow label (uppercase, tracked)** — `font-size:13px`, `font-weight:600` or `700`, `letter-spacing:0.14em`, `text-transform:uppercase`, color either `rgba(13,26,47,0.5)` (neutral, most "why" sections) or `#3E2EC0` on `#F1EBF8` pill background (WhyTeaser, WhyHero badge), sometimes as a pill (`border-radius:999px`, `padding:6px 14px`). Used by: WhyTeaser, WhyHero, WhyPoints, WhyProblem, WhyCosts, WhySystem, WhyProof, WhyStandards, WhyNote. Use-cases page has a non-uppercase eyebrow variant instead (`15px`, `font-weight:800`, no letter-spacing, no uppercase) — treated as a distinct sub-variant.
9. **Section header (eyebrow + H2)** — the eyebrow pattern above immediately followed by an H2 in HEADING_FONT, `font-weight:700`, `font-size:clamp(28px,4vw,38px)`, `line-height:1.1`, `letter-spacing:-0.02em`, `color:#0D1A2F`, `margin:0 0 22px` (why-* sections), or a fixed `58px`/`700`/`line-height:1` H1 for marketing landing-page heroes (Features/How-it-works/Pricing/Security/About). Used throughout.
10. **Split CTA panel (light purple)** — `background:#EBE5F6`, `border-radius:22px`, flex row `space-between`, headline + body on the left, Primary CTA button on the right. Used by: CtaCard (3-col variant with phone mockup), Features/How-it-works/Security CTA strips (2-col variant, class `.marketing-split-cta`).
11. **Numbered row/card** — a bold indigo (`#3E2EC0`/`#3D2AB6`) number ("01"-"05" or "1"-"5") beside/inside a title + body, used both as a flat list row (WhyPoints, border-top divider) and as a bordered card (WhySystem, `border:1px solid #F0EDEA` + shadow).
12. **Bordered info tile (2-up grid)** — `border:1px solid #F0EDEA`, `border-radius:16px`, `background:#fff` or `#FAF9F7`, `padding:18px 20px`. Used by: WhyCosts stat cards, WhyStandards tiles.
13. **Callout card (mustard)** — `border:1px solid #F0EDEA`, `border-radius:24px`, `background:#FDEBD2`, `padding:40px`. Used by: WhyNote.
14. **Dark statement panel** — `border-radius:22px`, large padding (`48px 56px` or `72px 0`), big HEADING_FONT headline in a light/white tone on a dark or tonal background. Two color treatments share the mechanism: Security's `marketing-dark-panel` (`#071B36` bg, `#EDE8FF` heading), About's "Team card" reusing the same class name with `#EDE8FF` bg and dark ink text, and WhyProblem's full-bleed pull-quote (`#0D1A2F` bg, `#fff` text with `#B3A6FF` highlight span).
15. **Pill tab button** — `border-radius:999px`, `padding:10px 14px`, `font-size:15px`, `font-weight:800`; selected = `background:#0D1A2F`/`color:#fff`/`border:1px solid #0D1A2F`, unselected = `background:#FAF7F0`/`color:#0D1A2F`/`border:1px solid #E8E4DF`. Used by: UseCases tab list.
16. **Signup modal** — `#fff` card, `border-radius:20px`, `width:420px`, centered overlay `rgba(7,27,54,0.55)` with `blur(2px)`. Used by: SignupDialog (site-wide, triggered from every SignupButton).

---

# Palette table

Every hex/rgba value found in the audited files, occurrence count (by
distinct component/file location, not per-inline-repeat within a single
map/array where the value repeats per item), and which pattern(s) use it.

| Hex / color value                         | Occurrences (files)                                                                                                                                                                                                                                                  | Used by (pattern)                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `#0D1A2F` (primary ink)                   | Very high — appears in nearly every component as heading/body text color                                                                                                                                                                                             | Section headers, card titles/bodies, nav links, CTA copy, chat bubble incoming text     |
| `#3E2EC0` (brand indigo, links/accents)   | High — Hero line 2, Nav (no), UseCases eyebrow/heading accent/checkmark, WhyTeaser link bg, CtaCard heading accent, WhyHero badge text, WhyCosts figure, WhyPoints number, WhyCta bg + link text, Pricing price + CTA bg, Security card icon stroke, About mail link | Section eyebrow accents, "Primary" brand-purple text/backgrounds, numbered-row numerals |
| `#01102B` (near-black CTA bg)             | High — Nav CTA, Hero CTA, CtaCard CTA, Features/How-it-works/Security CTA strips, About contact CTA, Pricing (differs, see `#3E2EC0` variant), WhyTeaser pill, SignupDialog submit button                                                                            | Primary CTA button pattern                                                              |
| `rgba(13,26,47,0.7)` (ink @ 70%)          | Very high — body copy across nearly all pages/components                                                                                                                                                                                                             | Body text color                                                                         |
| `#F0EDEA` (hairline border, warm neutral) | High — UseCases panel border, WhyProblem/WhyCosts/WhySystem/WhyProof/WhyStandards/WhyNote/WhyHero panel borders, WhyTeaser panel border                                                                                                                              | Card/panel border color ("why" surface family)                                          |
| `#F5F4F3` (hairline border, cool neutral) | Medium — FeatureCards card border, Features/How-it-works/Security/About marketing-card border                                                                                                                                                                        | Card border color ("marketing" surface family)                                          |
| `#EBE5F6` (light purple panel bg)         | Medium — CtaCard panel, Features/How-it-works/Security CTA-strip panel, Pricing tier card bg                                                                                                                                                                         | Split CTA panel / pricing card background                                               |
| `#F1EBF8` (pale purple tint)              | Medium — icon tint (multiple), WhyTeaser bg, WhyHero eyebrow pill bg + hero panel bg, WhySystem card 1 tint, WhySystem wide-card chip bg                                                                                                                             | Icon well tint / soft panel background                                                  |
| `#3D2AB6` (deep purple stroke/text)       | Medium — icon stroke pairing with `#F1EBF8`, chat reply-bubble text, WhySystem card 1 color                                                                                                                                                                          | Icon stroke / bubble accent text                                                        |
| `#FDEBD2` (pale amber tint)               | Medium — icon tint (Hero, FeatureCards, Features, Security), WhyNote card bg                                                                                                                                                                                         | Icon well tint / callout card background                                                |
| `#D4A72C` (amber stroke)                  | Medium — icon stroke pairing with `#FDEBD2`/`#FFF1CF`                                                                                                                                                                                                                | Icon stroke                                                                             |
| `#FDAD0E` (amber stroke, Hero variant)    | Low — Hero benefit-strip card 2 stroke, WhySystem card 2 color                                                                                                                                                                                                       | Icon stroke                                                                             |
| `#E7F1E5` (pale green tint)               | Medium — icon tint (Hero, FeatureCards, Features, Security), WhySystem card 4 tint                                                                                                                                                                                   | Icon well tint                                                                          |
| `#0A972F` (green stroke)                  | Medium — icon stroke pairing with `#E7F1E5`                                                                                                                                                                                                                          | Icon stroke                                                                             |
| `#FFE4D7` (pale orange tint)              | Low — icon tint (Hero, Features), WhySystem card 3 tint                                                                                                                                                                                                              | Icon well tint                                                                          |
| `#FD4612` (orange-red stroke)             | Low — icon stroke pairing with `#FFE4D7`                                                                                                                                                                                                                             | Icon stroke                                                                             |
| `#EDE8FF` (pale indigo tint)              | Low-medium — Features/Security icon tint, About team card bg, Security dark-panel heading color                                                                                                                                                                      | Icon well tint / dark-panel heading color / light panel bg                              |
| `#4434E8` (indigo stroke)                 | Low — Features icon stroke (Multi-location)                                                                                                                                                                                                                          | Icon stroke                                                                             |
| `#FFF1CF` (pale yellow tint)              | Low — Features icon tint (Grounded Q&A)                                                                                                                                                                                                                              | Icon well tint                                                                          |
| `#F3F1F0` (neutral chat bubble bg)        | Medium — chat bubble "incoming" bg across FeatureCards, CtaCard, How-it-works steps                                                                                                                                                                                  | Chat bubble (incoming) background                                                       |
| `#DBD7FD` (light purple chat bubble bg)   | Medium — chat bubble "reply" bg across FeatureCards, CtaCard, How-it-works steps                                                                                                                                                                                     | Chat bubble (reply) background                                                          |
| `#FAF7F0` (warm off-white bg)             | Low-medium — UseCases tab unselected bg, globals.css `--color-bg` token                                                                                                                                                                                              | Tab background / global theme token                                                     |
| `#FAF9F7` (near-white section bg)         | Medium — WhyProblem/WhyCosts/WhyProof section bg, WhyCosts stat-card bg                                                                                                                                                                                              | "Why" section alternating background                                                    |
| `#E4E2E0` (border, warm gray)             | Low — Hero secondary-button border, FeatureCards preview top/bottom border, SignupDialog input border                                                                                                                                                                | Border color                                                                            |
| `#E8E4DF` (tab border)                    | Low — UseCases unselected tab border                                                                                                                                                                                                                                 | Tab border                                                                              |
| `#F5EFE9` (avatar bg)                     | Low — CtaCard phone-mockup avatar circle bg                                                                                                                                                                                                                          | Avatar background                                                                       |
| `#B3A6FF` (light purple highlight)        | Low — WhyProblem pull-quote span highlight                                                                                                                                                                                                                           | Text highlight                                                                          |
| `#071B36` (very dark navy)                | Low — Security dark-panel bg, globals.css `--color-ink` token, home-world `--sw-ink`                                                                                                                                                                                 | Dark panel background / global ink token                                                |
| `rgba(237,232,255,0.75)`                  | Low — Security dark-panel body text                                                                                                                                                                                                                                  | Dark panel body text                                                                    |
| `#B3261E` (error red)                     | Low — SignupDialog error text                                                                                                                                                                                                                                        | Form error state                                                                        |
| `#5A6A82` (muted gray)                    | Low — SignupDialog close-button icon color                                                                                                                                                                                                                           | Icon color                                                                              |
| `rgba(7,27,54,0.55)` + `blur(2px)`        | Low — SignupDialog overlay                                                                                                                                                                                                                                           | Modal overlay                                                                           |
| `#000` (pure black)                       | Low — CtaCard phone frame border                                                                                                                                                                                                                                     | Phone mockup border                                                                     |
| `#fff` / `#ffffff` (white)                | Very high — text-on-dark, card backgrounds, button backgrounds throughout                                                                                                                                                                                            | Universal white surface/text                                                            |

Note on token vs. literal divergence: globals.css `@theme` defines
`--color-bg:#FAF7F0` and `--color-ink:#071B36` as the design-system tokens,
but the audited marketing components hardcode `#0D1A2F` for ink text (not
`#071B36`) and `#FAF7F0`/`#FAF9F7` inconsistently for background — i.e. the
components do not consistently reference the token file.

---

# Type-scale table

Every distinct (font-size, font-weight, letter-spacing) combination found,
occurrence count (by component/location), and where used. Font-family is
HEADING_FONT (`'Inter Tight', Inter, system-ui, sans-serif`) for every row
marked (H), otherwise inherited body font (no explicit `font-family` in that
element).

| Size                   | Weight  | Letter-spacing         | Occurrences | Where                                                                                                                             |
| ---------------------- | ------- | ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 58px                   | 700     | -0.02em (H)            | High        | H1 on Features, How-it-works, Pricing, Security, About page heroes                                                                |
| 50px                   | 700     | -0.01em (H)            | 1           | CtaCard H2                                                                                                                        |
| clamp(40px,6.5vw,62px) | 800 (H) | -0.02em                | 1           | WhyHero H1                                                                                                                        |
| clamp(28px,4.5vw,42px) | 700 (H) | -0.02em                | 1           | WhyProblem pull-quote                                                                                                             |
| 48px                   | 700     | -0.02em (H)            | 1           | Terms H1                                                                                                                          |
| 47px                   | 700     | -0.01em (H)            | 1           | FeatureCards H2                                                                                                                   |
| clamp(28px,4vw,38px)   | 700 (H) | -0.02em                | High        | Section H2 across all WhySystem/WhyPoints/WhyProblem/WhyCosts/WhyProof/WhyStandards/WhyCta                                        |
| 42px                   | 800     | 0 (H)                  | 1           | UseCases H2                                                                                                                       |
| 40px                   | 700     | -0.02em (H)            | Medium      | Split CTA-strip H2 (Features/How-it-works/Security)                                                                               |
| 36px                   | 700     | -0.02em (H)            | 1           | Security dark-panel H2                                                                                                            |
| 34px                   | 700     | -0.02em (H)            | 1           | WhyCosts stat figure                                                                                                              |
| 32px                   | 700     | -0.02em (H) or 800/0   | 4           | CtaCard right-column H3; WhyTeaser H2; About story/team H2 (weight 700, no explicit letter-spacing beyond `-0.02em`)              |
| 28px                   | 700     | -0.02em (H)            | 1           | How-it-works step title (h2)                                                                                                      |
| 26px                   | 800     | -0.02em (H)            | 1           | UseCases tab-panel H3; SignupDialog title (also 26px/800/-0.02em)                                                                 |
| 24px                   | 700     | -0.03em (default font) | 1           | CtaCard phone "Jory" name                                                                                                         |
| 24px                   | 700     | -0.02em (H)            | 1           | Terms section H2                                                                                                                  |
| 22px                   | 900     | -0.04em (H)            | 1           | Nav brand "JORY"                                                                                                                  |
| 21px                   | 800/700 | -0.02em                | 2           | WhyPoints row title (700); WhyHero body copy is 21px but weight 400 (untagged)                                                    |
| 20px                   | 700     | -0.03em (default)      | High        | Feature/Security card H2 titles (Features page, Security page)                                                                    |
| 20px                   | 700     | -0.03em                | 2           | WhySystem card title (20px/700/-0.02em, slightly different tracking)                                                              |
| 20px                   | 400     | -0.03em                | High        | Various hero subcopy sizes at 20px (Features/How-it-works/Pricing/Security/About hero subcopy)                                    |
| 18px                   | 700     | -0.03em                | Medium      | Nav/Hero CTA labels, FeatureCards subcopy is 18px/400 not 700 — see split below                                                   |
| 18px                   | 500     | -0.03em                | Medium      | Chat bubble text (FeatureCards preview, CtaCard phone)                                                                            |
| 18px                   | 400     | -0.03em / 0            | Medium      | Section body copy (Hero benefit body is 15px not 18; UseCases problem text 18px/0; WhyNote body 18px default)                     |
| 17px                   | 700     | -0.03em (H well)       | 1           | Hero benefit-item title is 17px/700/-0.03em                                                                                       |
| 17px                   | 400     | -0.03em                | High        | How-it-works step body, WhyPoints row body, About story/team/contact body copy (17px/400, some `-0.03em` some `-0.02em`)          |
| 16px                   | 700     | -0.03em                | Medium      | Features/Security card body is 16px/400 — titles are 20/700; use-case outcome list items 17px/700; pricing included-list 16px/400 |
| 16px                   | 500     | -0.03em                | Medium      | Chat bubble text (How-it-works step preview, 15-16px range)                                                                       |
| 16px                   | 400     | -0.03em / 0            | Very high   | Most secondary body text at 16px across cards                                                                                     |
| 15px                   | 700/800 | 0                      | 1-2         | UseCases eyebrow (15px/800/0); Hero benefit body (15px/400)                                                                       |
| 15px                   | 500     | -0.03em                | 1           | How-it-works chat preview bubble text                                                                                             |
| 14px                   | 700     | 0.06em uppercase       | 1           | Pricing "Everything" eyebrow                                                                                                      |
| 13px                   | 600/700 | 0.14em uppercase       | High        | Eyebrow label pattern across WhyTeaser, WhyHero badge, WhyPoints/WhyProblem/WhyCosts/WhySystem/WhyProof/WhyStandards/WhyNote      |
| 13px                   | 400     | 0                      | 1           | CtaCard phone "Online" status                                                                                                     |

Given the volume of one-off body sizes (17/18/20/21px) reused with minor
letter-spacing variance across nearly every page, the table above groups the
dominant repeated combinations; consult each component's section above for
the exact per-element value where precision matters for redraw.
