# Jory design system: inventory and merge plan

Jory (`heyjory.com`, repository `Jory-AI/jory` at
`/Users/dennison/develop/jory`) is the product. OpenInstinct is the agent base
that will power it. The Jory look and feel is the target for this repository.
This document records what Jory's design system is today, where it differs
from [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), and the decisions that must be
made before one cohesive system exists.

Every value in sections 1 and 2 is read from a Jory source file on
2026-09-03. Section 3 is **Proposed** and nothing in it is implemented.

## 1. Jory as implemented

### 1.1 Stack

| Layer            | Jory (`apps/web`)                                                      | OpenInstinct                                |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| CSS engine       | Tailwind 4.1.6, plus `tw-animate-css`                                  | Tailwind 4                                  |
| shadcn style     | `radix-nova`, base color `neutral`                                     | `base-nova`, base color `neutral`           |
| Headless library | `radix-ui` (unified package)                                           | `@base-ui/react`                            |
| Icons            | `lucide-react` in `ui/`; hand-drawn inline SVG on marketing            | `lucide-react`                              |
| Font             | Inter Tight from Google Fonts through `next/font`, weights 400-900     | Vault, Vault Sans, Vault Mono (self-hosted) |
| Token source     | `src/app/globals.css` `@theme`, mirrored in `src/lib/design-tokens.ts` | `src/app/styles/brand/*.css`                |
| Chat rendering   | `streamdown`                                                           | `streamdown`                                |

### 1.2 Brand tokens

Source: `apps/web/src/app/globals.css` (`@theme` block) and
`apps/web/src/lib/design-tokens.ts`. The two files hold the same values.

Color:

| Token           | Value     | Role                        |
| --------------- | --------- | --------------------------- |
| `bg`            | `#FAF7F0` | Page background, warm cream |
| `ink`           | `#071B36` | Primary text, deep navy     |
| `ink-2`         | `#16233B` | Secondary text              |
| `muted`         | `#E6E6E6` | Muted surface               |
| `muted-ink`     | `#5A6A82` | Muted text                  |
| `cta`           | `#061A33` | Primary button fill         |
| `cta-hover`     | `#0F2A4D` | Primary button hover        |
| `jory-j`        | `#4434E8` | Wordmark letter J, indigo   |
| `jory-o`        | `#F7B313` | Wordmark letter O, gold     |
| `jory-r`        | `#7467E8` | Wordmark letter R, lilac    |
| `jory-y`        | `#FF5A32` | Wordmark letter Y, coral    |
| `mustard`       | `#D4A72C` | Accent                      |
| `skin`          | `#F4A261` | Mascot accent               |
| `soft-purple`   | `#EDE8FF` | Tint                        |
| `soft-yellow`   | `#FFF1CF` | Tint                        |
| `soft-green`    | `#E9F8E8` | Tint                        |
| `soft-red`      | `#FFE7DF` | Tint                        |
| `bubble-user`   | `#F1F5F9` | User chat bubble            |
| `bubble-jory`   | `#E0E7FF` | Jory chat bubble            |
| `accent-indigo` | `#4F46E5` | Single-accent system        |
| `accent-orange` | `#F97316` | Single-accent system        |
| `accent-green`  | `#22C55E` | Single-accent system        |

Type scale (px): display 96, hero 240, h1 56, h2 36, h3 24, body-lg 20,
body 16, caption 14, micro 12. Line heights: tight 1.02, display 1.08,
heading 1.15, body 1.5. Letter spacing: hero -0.04em, display -0.03em,
heading -0.02em, body 0, caps 0.08em. Weights: 400, 500, 600, 700, 800, 900.

Spacing: s1 to s10 = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 px; container
1200px; gutter 24px.

Radius: input 12px, card 16px, bubble 18px, pill 999px.

Shadow: card `0 2px 10px rgba(0,0,0,.04)`; card-hover `0 6px 20px
rgba(0,0,0,.06)`; float `0 12px 40px rgba(7,27,54,.10)`.

Motion: fast 120ms, base 180ms, slow 280ms; ease `cubic-bezier(0.2, 0.7,
0.2, 1)`.

Jory's `globals.css` also carries the stock shadcn neutral OKLCH palette
(`--background`, `--primary`, and the rest) in `:root` and `.dark`. Those
values are the shadcn defaults and are not branded.

### 1.3 Three palettes are in use

This is the main finding. Jory has one token file but three palettes on
screen.

| Surface                                             | Palette                                     | Evidence                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing: `/` and `/why` components                | The mockup palette, inline `style={{}}` hex | Hex counts in `src/components/landing` and `src/components/why` (n=127): `#0D1A2F` 42, `#F0EDEA` 15, `#3E2EC0` 11, `#F1EBF8` 7, `#3D2AB6` 6, `#01102B` 5. None of the six are tokens.                                                                                                                                                         |
| Mockup                                              | `mockups/heyjory-inside-look.html` `:root`  | ink `#0d1a2f`, purple `#3e2ec0`, purple-deep `#3d2ab6`, gold `#fdad0e`, coral `#fd4612`, green `#0a972f`, border `#f0edea`, bg-soft `#faf9f7`, tints `#f1ebf8` `#fdebd2` `#ffe4d7` `#e7f1e5`                                                                                                                                                  |
| Product: `/dashboard`, `/login`, `/behavior-review` | The token palette                           | Imports from `@/lib/design-tokens` (12 files under `src/app/dashboard`); `behavior-review/*.css` uses `var(--color-muted-ink)` 18 times. Hex literals in these routes (n=29): `#071B36` 5, `#FFFFFF` 4, `#FAF7F0` 3, `#B3261E` 3, `#5A6A82` 3, plus single one-off values (`#6C5CE7`, `#0984E3`, `#00B894`, `#D63031`, `#E17055`, `#FDCB6E`). |
| shadcn primitives in `components/ui`                | Stock shadcn neutral OKLCH                  | `globals.css` `:root`                                                                                                                                                                                                                                                                                                                         |

The marketing purple (`#3E2EC0`) and the token indigo (`#4434E8`,
`#4F46E5`) are three different hues for the same role. The marketing ink
(`#0D1A2F`) and the token ink (`#071B36`) are two navies. The marketing
page background (`#FAF9F7` or white) and the token background (`#FAF7F0`)
differ.

### 1.4 How Jory styles components

- The 16 files in `apps/web/src/components/ui` are stock shadcn `radix-nova`
  primitives: badge, button-group, button, collapsible, command, dialog,
  dropdown-menu, hover-card, input-group, input, scroll-area, select,
  separator, spinner, textarea, tooltip. They use the stock neutral tokens,
  not the brand tokens. There is no card, label, sheet, sidebar, switch,
  table, or skeleton.
- Marketing components set every visual property inline. `globals.css`
  lines 157 to 435 hold `!important` responsive overrides at 1180px and
  640px that reach into those inline styles.
- Product components import the token object from `design-tokens.ts` and
  build `React.CSSProperties` objects. Example: `dashboard-shell.tsx` and
  `status-pill.tsx`. `status-pill.tsx` is the one shared badge treatment:
  solid `jory-y` fill with white text for `overdue`, a soft tint with `ink`
  text for every other state, `fontSize: 13px`, `radius-pill`.
- The dashboard shell is a left sidebar with a text wordmark, a nav list,
  a top bar with the business name and a role chip, and a content area.
- `chat-view.tsx` is the only dashboard file that imports a `ui/` primitive
  (`Button`).

### 1.5 Recurring marketing patterns

Observed in `landing/*.tsx`, `why/*.tsx`, and the mockup.

- **Card:** white, radius 20 to 22px, 1px border `#E4E2E0` or `#F5F4F3`,
  shadow `0 5px 10px rgba(3,17,40,.06)`.
- **Primary button:** navy fill `#01102B`, white text, radius 16px or pill.
  Secondary: white, border, soft shadow.
- **Chat bubble motif:** grey and lavender bubble pairs, radius 16px with
  one corner at 4 to 5px, 15 to 18px text. Used in the hero, feature cards,
  the CTA phone mockup, and the why hero.
- **Headings:** Inter Tight 700 to 800, tracking -0.01em to -0.04em. Hero
  58px, or `clamp(40px, 6.5vw, 62px)` on `/why`. Section 32 to 50px.
- **Eyebrow:** 13px uppercase, tracking 0.14em.
- **Icon wells:** hand-drawn stroke SVG in a tinted rounded square, 52 to
  74px, radius 16 to 17px, tint and stroke from purple, gold, coral, green.
- **Mascot:** 3D clay character renders in `public/assets/jory-*_clay.webp`
  and three wordmark SVGs (`jory-wordmark.svg`, `-color.svg`,
  `-mustard.svg`). The app icon is the mascot.
- **Section width:** 1440px on `/`, 1040px on `/why`, 48px side padding.

### 1.6 Documentation

No file in the Jory repository documents the design system. Two files
touch it: `docs/implementation/2026-05-03-landing-page.md` maps
`colors_and_type.css` to `globals.css` to `design-tokens.ts`, and
`docs/plans/2026-07-18-004-dashboard-redesign-analysis.md` covers dashboard
behavior, not visual style. `colors_and_type.css` itself is not in the
repository.

## 2. Side-by-side

| Dimension       | OpenInstinct                                   | Jory tokens                                | Jory marketing                       |
| --------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| Page background | white, OKLCH `1 0 0`                           | cream `#FAF7F0`                            | `#FAF9F7` or white                   |
| Text            | near-black, OKLCH `0.145 0 0`                  | navy `#071B36`                             | navy `#0D1A2F`                       |
| Primary action  | iOS blue `#007aff`                             | navy `#061A33`                             | navy `#01102B`                       |
| Accent hue      | none beyond primary                            | indigo `#4F46E5`, orange, green            | purple `#3E2EC0`, gold, coral, green |
| Status tones    | 4 tones x 3 tokens each, OKLCH, light and dark | 4 soft tints, light only                   | 4 tints                              |
| Font            | Vault (Mona Sans derivative), self-hosted      | Inter Tight, Google                        | Inter Tight                          |
| Type roles      | 18 semantic `type-*` utilities                 | 9 size tokens, no role utilities           | inline px per element                |
| Body weight     | 375                                            | 400                                        | 400                                  |
| Heading weight  | 450                                            | 400 to 900 available                       | 700 to 800                           |
| Radius base     | 10px, scaled 5 to 26px                         | input 12, card 16, bubble 18, pill         | card 20 to 22, button 16 or pill     |
| Shadow tokens   | none                                           | 3                                          | 1 inline                             |
| Spacing tokens  | none (Tailwind scale)                          | 10 steps                                   | inline                               |
| Motion          | 80 / 140 / 220 / 360ms                         | 120 / 180 / 280ms                          | inline                               |
| Dark mode       | tokens defined, not reachable                  | stock shadcn dark, not branded             | none                                 |
| Headless lib    | base-ui                                        | radix-ui                                   | none                                 |
| Primitives      | 25                                             | 16                                         | 0                                    |
| Chat bubbles    | `ai-elements/message.tsx`, neutral             | `bubble-user` grey, `bubble-jory` lavender | same motif, inline                   |

## 3. Merge plan (Proposed)

The goal: one system, in this repository, that a contributor can apply
without asking a question. The order below puts decisions first because
every later step depends on them.

### 3.1 Decisions that need the owner

Each of these had no answer in either codebase. The assistant proposed answers on 2026-09-03 and implemented them the same day (see `DESIGN_SYSTEM.md`); the owner has not yet confirmed them.

| #   | Decision                                                                                      | Options seen in the code                                     | Status                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Which Jory palette is canonical: the token file, the marketing mockup, or a reconciled set    | token `#071B36` / `#4F46E5`; marketing `#0D1A2F` / `#3E2EC0` | Proposed 2026-09-03 (assistant default, not yet confirmed by the owner): the token file. `foundation.css` maps it onto the shadcn semantic tokens.                        |
| D2  | Which font: Inter Tight (Jory) or Vault (OpenInstinct)                                        | both are in use                                              | Proposed 2026-09-03 (assistant default, not yet confirmed by the owner): Inter Tight (and JetBrains Mono for code) through `next/font`.                                   |
| D3  | Does the product UI get the warm cream background, or white with cream reserved for marketing | product dashboard uses cream today; primitives use white     | Proposed 2026-09-03 (assistant default, not yet confirmed by the owner): cream page (`#FAF7F0`), white cards and popovers; secondary and muted surfaces use `#E6E6E6`.    |
| D4  | Is dark mode in scope                                                                         | neither product ships it                                     | Proposed 2026-09-03 (assistant default, not yet confirmed by the owner): out of scope. The `.dark` block stays defined and unreachable.                                   |
| D5  | Headless library: keep base-ui (OpenInstinct) or move to radix-ui (Jory)                      | both are shadcn-supported                                    | Proposed 2026-09-03 (assistant default, not yet confirmed by the owner): keep base-ui.                                                                                    |
| D6  | Does the OpenInstinct primary blue survive anywhere, or does navy replace it                  | Jory has no blue                                             | Proposed 2026-09-03 (assistant default, not yet confirmed by the owner): navy `#061A33` is `primary`; indigo `#4F46E5` is `ring` and the link color; the blue is removed. |

### 3.2 Steps after the decisions

Status 2026-09-03: steps 1 to 3 are implemented (tokens, type, primitives: pill badges, ink text on tints, bubbles). Steps 4 to 6 remain open.

1. **Token layer.** Express the chosen Jory palette as OKLCH tokens in
   `src/app/styles/brand/foundation.css`, mapped onto the shadcn semantic
   names (`background`, `foreground`, `primary`, `muted`, and the rest) so
   the 25 primitives change color without edits. Add Jory's spacing,
   radius, shadow, and motion tokens beside them. Remove the primary
   override from `globals.css`.
2. **Type layer.** Keep the `type-*` role utilities. Repoint the
   `--merit-family-*` tokens at the chosen font and re-tune the weights to
   Jory's (400 body, 600 to 800 headings) if D2 picks Inter Tight. Add
   roles Jory needs that OpenInstinct lacks: `type-eyebrow` (13px
   uppercase, tracking 0.14em), `type-display`, `type-hero`.
3. **Primitives.** Add `card` to Jory's set or adopt OpenInstinct's; port
   `status-pill.tsx` into `Badge` as tone variants; port the chat bubble
   motif into `ai-elements/message.tsx` with `bubble-user` and
   `bubble-jory` tokens.
4. **Showcase route.** Add one page that renders every primitive, variant,
   and type role, so a visual check needs no real data. This is the item
   that ends "what should this look like" questions.
5. **Retire inline styles.** In Jory, marketing and dashboard components
   set styles inline. Whichever surfaces move into this repository should
   be rebuilt on the primitives and utilities, not copied.
6. **Document.** Fold the results into `DESIGN_SYSTEM.md` and delete this
   file's section 3.

### 3.3 Not decided and not proposed

The mascot renders, the per-letter wordmark colors, and the hand-drawn
marketing icons are brand assets. Whether they appear inside the product
UI is a product call, not a design-system one, and is not proposed here.
