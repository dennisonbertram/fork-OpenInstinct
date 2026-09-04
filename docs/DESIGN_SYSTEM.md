# OpenInstinct design system

This document describes the design system as it exists in this repository on
2026-09-03. Every value below is read from a source file. The file path is
named next to each group of values. When the source changes, update this
document in the same pull request.

Labels follow [`README.md`](README.md): **Implemented** means the code exists.
**Proposed** means a decision that is not in the code yet. Sections without a
label are implemented.

**Restyle 2026-09-03.** The token and type layers moved to the Jory look:
cream page, white cards, navy ink and primary, indigo ring and links, soft
status tints, Inter Tight, 12px base radius, pill badges, and chat bubbles.
The decisions behind it (D1 to D6) were proposed by the assistant and are not yet confirmed by the owner; they are recorded in
[`JORY_DESIGN_MERGE.md`](JORY_DESIGN_MERGE.md) section 3.1. The Pencil canvas
in `design/` was updated to the same values on 2026-09-03.

## 1. Rules

These rules come from `AGENTS.md` ("Design system") and from the code.

1. Build product UI from the primitives in `src/components/ui`.
2. Set type with the semantic `type-*` utilities from
   `src/app/styles/brand/typography.css`. Do not use raw Tailwind text-size or
   font-weight classes (`text-sm`, `font-medium`) in product code.
3. Set color with the semantic tokens (`bg-card`, `text-muted-foreground`,
   `border-border`, `text-destructive`). Do not use raw palette classes
   (`bg-gray-100`, `text-blue-600`) or hex values in product code.
4. Add a new primitive with the official shadcn CLI. Keep the
   `components.json` base (`base-nova`) and the local extensions.
5. Give every primitive a `data-slot` attribute. The compatibility styles in
   `shadcn.css` key on it.
6. Icons come from `lucide-react` only.

## 2. Stack

| Layer            | Choice                                             | Source                               |
| ---------------- | -------------------------------------------------- | ------------------------------------ |
| CSS engine       | Tailwind v4 (`@import "tailwindcss"`, `@theme`)    | `src/app/globals.css`                |
| Component base   | shadcn, style `base-nova`, base color `neutral`    | `components.json`                    |
| Headless library | `@base-ui/react` (14 of 25 primitives)             | `src/components/ui/*.tsx` imports    |
| Variant tool     | `class-variance-authority` (`cva`)                 | `src/components/ui/*.tsx`            |
| Icons            | `lucide-react`                                     | `components.json`, `iconLibrary`     |
| Fonts            | Inter Tight and JetBrains Mono through `next/font` | `src/app/layout.tsx`                 |
| Chat rendering   | `streamdown`                                       | `src/components/ai-elements`         |
| Polymorphism     | base-ui `render` prop, not `asChild`               | `button.tsx`, `badge.tsx`, `sidebar` |

The stylesheet import order in `src/app/globals.css` is:
`tailwindcss`, `shadcn/tailwind.css`, `foundation.css`, `typography.css`,
`shadcn.css`, `motion.css`. `globals.css` holds no token overrides.

## 3. Foundations

### 3.1 Fonts

Source: `src/app/layout.tsx`, `src/app/styles/brand/typography.css`.

| Family         | Loader                     | Weights                 | CSS variable            | Role                                                 |
| -------------- | -------------------------- | ----------------------- | ----------------------- | ---------------------------------------------------- |
| Inter Tight    | `next/font/google`, `swap` | 400, 500, 600, 700, 800 | `--font-inter-tight`    | Text and display (`--merit-family-text`, `-display`) |
| JetBrains Mono | `next/font/google`, `swap` | 400, 500                | `--font-jetbrains-mono` | Code (`--merit-family-mono`)                         |

The layout puts both font variables on `<html>`. The family tokens in
`typography.css` read those variables with system fallbacks. The token
prefix stays `--merit-` from the vendored `@merit-systems/brand` file; the
names are an upstream artifact and are kept so no `type-*` recipe changes.

Weight tokens: body 400, ui 500, signal 400, emphasis 600, display 700, mono 400.
Tracking tokens: text 0, display -0.022rem, tight -0.015rem, mono 0.

### 3.2 Type scale

Source: `src/app/styles/brand/typography.css`. Pixel values assume a 16px root.

| Utility                | Family      | Size                                   | Weight  | Tracking  | Line height | Use for                                                           |
| ---------------------- | ----------- | -------------------------------------- | ------- | --------- | ----------- | ----------------------------------------------------------------- |
| `type-product-title`   | Inter Tight | 2.25rem (36)                           | 600     | -0.015rem | 1           | Product name on a landing or sign-in view                         |
| `type-page-title`      | Inter Tight | 1.875rem (30)                          | 600     | -0.015rem | 1.2         | The one `h1` of a page                                            |
| `type-section-title`   | Inter Tight | 1.125rem (18)                          | 600     | 0         | 1.35        | `h2` of a page section                                            |
| `type-card-title`      | Inter Tight | 1rem (16)                              | 600     | 0         | 1.35        | Card and dialog titles                                            |
| `type-banner-metric`   | Inter Tight | 1.5rem (24)                            | 600     | 0         | 1           | A single large number                                             |
| `type-body`            | Inter Tight | inherit (16)                           | 400     | 0         | inherit     | Long-form prose                                                   |
| `type-supporting-body` | Inter Tight | 0.875rem (14)                          | 400     | 0         | 1.5         | Descriptions, chat text, form help                                |
| `type-label`           | Inter Tight | 0.875rem (14)                          | 500     | 0         | 1.35        | Buttons, row labels, nav items                                    |
| `type-input`           | Inter Tight | 1rem (16); 0.875rem at width >= 48rem  | 400     | 0         | 1.5         | Text inside inputs                                                |
| `type-caption`         | Inter Tight | 0.75rem (12)                           | 400     | 0         | 1.35        | Secondary text under a label                                      |
| `type-micro`           | Inter Tight | 0.6875rem (11)                         | 500     | 0         | 1.25        | Group headings in the sidebar, tags                               |
| `type-code`            | Mono        | 0.875rem (14)                          | 400     | 0         | 1.5         | Code blocks                                                       |
| `type-compact-code`    | Mono        | 0.75rem (12)                           | 400     | 0         | 1.35        | Inline code, shortcuts, IDs                                       |
| `type-signal`          | Inter Tight | inherit                                | 400     | -0.022rem | inherit     | Display text; sets `text-wrap: balance`                           |
| `type-ui`              | Inter Tight | inherit                                | 500     | 0         | inherit     | Weight-only UI text                                               |
| `type-mono`            | Mono        | inherit                                | 400     | 0         | inherit     | Family-only mono text                                             |
| `type-emphasis`        | inherit     | inherit                                | 600     | inherit   | inherit     | Bold inside a run of text                                         |
| `type-numeric`         | inherit     | inherit                                | inherit | inherit   | inherit     | Tabular lining numerals                                           |
| `type-hero`            | Inter Tight | 3.5rem (56); 2.375rem (38) below 40rem | 700     | -0.02em   | 1.02        | The one `h1` of a hero page such as sign-in; `text-wrap: balance` |
| `type-eyebrow`         | Inter Tight | 0.8125rem (13)                         | 600     | 0.14em    | 1.35        | Uppercase brand or section eyebrow                                |

Scale-only utilities set size and line height and nothing else:
`type-scale-display` (2.25rem / 0.95), `type-scale-body` (1rem / 1.5),
`type-scale-supporting` (0.875rem / 1.5), `type-scale-caption` (0.75rem / 1.35),
`type-scale-micro` (0.6875rem / 1.25).

The base layer sets `html` to the body values and `font-kerning: normal`.
`strong`, `b`, and `em` get the emphasis weight. `code`, `kbd`, `samp`, and
`pre` get the mono family with ligatures off.

Two classes in the source, `type-definitions` and `type-assertion`, are not
defined in `typography.css` (see section 8).

### 3.3 Color

Source: `src/app/styles/brand/foundation.css`. Light values are the Jory
token file (`jory/apps/web/src/lib/design-tokens.ts`) converted from hex to
OKLCH; the hex is in a comment on each line. The dark values are the
pre-restyle shadcn neutral set and are not reachable (section 7).

| Token                                                                                                    | Jory source       | Light hex | Light OKLCH          |
| -------------------------------------------------------------------------------------------------------- | ----------------- | --------- | -------------------- |
| `background`, `sidebar`                                                                                  | bg                | `#FAF7F0` | 0.977 0.01 87.5      |
| `foreground`, `card-foreground`, `popover-foreground`, `sidebar-foreground`, `sidebar-accent-foreground` | ink               | `#071B36` | 0.223 0.059 256.6    |
| `card`, `popover`, `sidebar-accent`                                                                      | white             | `#FFFFFF` | 1 0 0                |
| `primary`, `sidebar-primary`                                                                             | cta               | `#061A33` | 0.217 0.056 255.1    |
| `primary-foreground`                                                                                     | white             | `#FFFFFF` | 1 0 0                |
| `primary-hover`                                                                                          | cta-hover         | `#0F2A4D` | 0.285 0.072 256.1    |
| `secondary`, `muted`, `accent`, `border`, `input`, `sidebar-border`                                      | muted             | `#E6E6E6` | 0.925 0 0            |
| `secondary-foreground`, `accent-foreground`                                                              | ink-2             | `#16233B` | 0.257 0.049 261.9    |
| `muted-foreground`                                                                                       | muted-ink         | `#5A6A82` | 0.52 0.043 258.4     |
| `ring`, `sidebar-ring`, `information`                                                                    | accent-indigo     | `#4F46E5` | 0.511 0.23 277       |
| `information-subtle`                                                                                     | soft-purple       | `#EDE8FF` | 0.942 0.031 295.8    |
| `success`                                                                                                | accent-green      | `#22C55E` | 0.723 0.192 149.6    |
| `success-subtle`                                                                                         | soft-green        | `#E9F8E8` | 0.964 0.026 143.6    |
| `warning`                                                                                                | mustard           | `#D4A72C` | 0.75 0.141 87.1      |
| `warning-subtle`                                                                                         | soft-yellow       | `#FFF1CF` | 0.961 0.047 88.3     |
| `destructive`                                                                                            | product error red | `#B3261E` | 0.501 0.178 28.7     |
| `destructive-subtle`                                                                                     | soft-red          | `#FFE7DF` | 0.945 0.029 39.3     |
| `*-border` (four tones)                                                                                  | the strong color  |           | strong `/ 32%`       |
| `bubble-user`                                                                                            | bubble-user       | `#F1F5F9` | 0.968 0.007 247.9    |
| `bubble-assistant`                                                                                       | bubble-jory       | `#E0E7FF` | 0.93 0.033 272.8     |
| `chart-1` to `chart-5`                                                                                   | unchanged shadcn  |           | see `foundation.css` |

Notes:

- Each status tone has three tokens: the strong color, a border at 32%
  strength, and a tinted surface. The strong green and mustard fail contrast
  as text on the tint, so `Badge` and `Alert` put ink text on the tint and
  the strong color on the icon. The destructive red is dark enough to stay
  the text color.
- The base layer gives every element `border-border` and `outline-ring/50`,
  and gives `body` `bg-background text-foreground`.
- The default `Input`, `Textarea`, and `Select` trigger are white (`bg-card`)
  so fields read as surfaces on the cream page. The `plain`, `currency`, and
  `input-group` variants stay transparent because they sit inside a white
  surface.

### 3.4 Radius

Source: `foundation.css`. Base `--radius: 0.75rem` (12px, Jory radius-input).

| Token           | Pixels | Use                     |
| --------------- | ------ | ----------------------- |
| `radius-xs`     | 6      |                         |
| `radius-sm`     | 8      |                         |
| `radius-md`     | 10     | Small buttons           |
| `radius-lg`     | 12     | Buttons, inputs, alerts |
| `radius-xl`     | 16     | Cards, dialogs          |
| `radius-2xl`    | 20     |                         |
| `radius-3xl`    | 24     |                         |
| `radius-4xl`    | 28     |                         |
| `radius-bubble` | 18     | Chat bubbles            |

Badges use `rounded-full`.

### 3.5 Shadow and activity tokens

Source: `foundation.css`, `@theme inline`.

| Token                | Value                                                                                                            | Use                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `shadow-card`        | `0 2px 10px rgb(0 0 0 / 0.04)`                                                                                   | `Card`                                           |
| `shadow-card-hover`  | `0 6px 20px rgb(0 0 0 / 0.06)`                                                                                   | Hover on the `surface` button (a clickable card) |
| `activity-1` to `-9` | Tailwind v4 violet-500, cyan-500, blue-500, fuchsia-500, emerald-500, amber-500, slate-400, orange-400, zinc-400 | The nine kinds in the browser activity legend    |

### 3.6 Motion

Source: `src/app/styles/brand/motion.css`.

| Token                | Value                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `--duration-instant` | 80ms                                                                |
| `--duration-fast`    | 140ms                                                               |
| `--duration-normal`  | 220ms                                                               |
| `--duration-slow`    | 360ms                                                               |
| `--ease-standard`    | cubic-bezier(0.2, 0, 0, 1)                                          |
| `--ease-emphasized`  | cubic-bezier(0.2, 0, 0, 1.2)                                        |
| `animate-pulse-dot`  | 1.8s ring expand and fade, uses `currentColor` and `--pulse-spread` |

`prefers-reduced-motion: reduce` sets all four durations to 0ms. Buttons move
down 1px on press (`active:translate-y-px`) and skip this under reduced
motion.

### 3.7 Icons

`lucide-react` only. The default icon size is `size-4` (16px). Every primitive
applies `[&_svg:not([class*='size-'])]:size-4`, so an icon without an explicit
size class gets 16px. The `xs` button size uses `size-3` (12px) and `sm` uses
`size-3.5` (14px).

### 3.8 Spacing and layout

There are no spacing tokens beyond the Tailwind default scale. These
conventions are observed in the pages, not defined in a token file.

| Pattern          | Classes                                                                                                                                                                                                                                                                                                                                                                      | Seen in                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Page container   | `mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8`                                                                                                                                                                                                                                                                                             | workspace, vault, chat history pages |
| Page header      | `type-page-title` then `type-supporting-body text-muted-foreground`                                                                                                                                                                                                                                                                                                          | chat history, vault, sign-in         |
| Section          | `<section aria-labelledby>` with `space-y-3` and an `h2.type-section-title`                                                                                                                                                                                                                                                                                                  | workspace page                       |
| Row list         | `divide-y divide-border/50 border-y border-border/50`; rows `flex items-center gap-3 py-4`                                                                                                                                                                                                                                                                                   | workspace page                       |
| Row icon well    | `size-9 rounded-md border border-border bg-muted/50 text-muted-foreground`                                                                                                                                                                                                                                                                                                   | workspace page                       |
| Narrow form page | `min-h-svh` centered, `max-w-sm space-y-6`                                                                                                                                                                                                                                                                                                                                   | sign-in page                         |
| Mobile header    | `h-12 border-b border-border/50 px-4 md:hidden` with `SidebarTrigger`                                                                                                                                                                                                                                                                                                        | authenticated navigation             |
| Split auth page  | `grid max-w-5xl items-end gap-10 md:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]`; `Card` with `w-full max-w-md gap-6 p-8 justify-self-center md:justify-self-start`; mascot column `order-first md:order-0 flex flex-col items-center gap-6 md:items-start` with the bubble `Card` in `hidden md:block`; the mascot is a static import next to the route, not a `public/` file | sign-in page                         |

## 4. Primitives

Source: `src/components/ui/*.tsx`. "Base" names the headless library. The
default is marked with an asterisk.

| Primitive      | Base      | Variants                                                                                                                                                            | Sizes                                                                                                                                              | Notes                                                                                                                       |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Alert`        | div       | `default`\*, `success`, `warning`, `information`, `destructive`                                                                                                     | one                                                                                                                                                | Tones: tint background, tone border, ink text, tone icon. Parts: `AlertTitle`, `AlertDescription`, `AlertAction`            |
| `Badge`        | useRender | `default`\* (primary fill), `secondary`, `success`, `warning`, `information`, `destructive`, `outline`, `ghost`, `link`                                             | fixed `h-5`, `rounded-full`                                                                                                                        | Tones: tint background, tone border, ink text, tone icon. `link` is indigo. Polymorphic through `render`                    |
| `Button`       | base-ui   | `default`\* (navy fill, `primary-hover` on hover), `outline`, `secondary`, `subtle`, `ghost`, `quiet`, `plain`, `surface`, `destructive`, `link` (indigo), `motion` | `default`\* (h-8), `xs` (h-6), `sm` (h-7), `lg` (h-9), `icon` (8), `icon-xs`, `icon-sm`, `icon-lg`, `none`, `surface`, `motion-box`, `motion-line` | `surface` variant defaults to the `surface` size: full width, left aligned, `rounded-xl p-4`                                |
| `ButtonGroup`  | div       | orientation `horizontal`\*, `vertical`                                                                                                                              |                                                                                                                                                    | Parts: `ButtonGroupSeparator`, `ButtonGroupText`                                                                            |
| `Card`         | div       | none                                                                                                                                                                | `default`\*, `sm` (tighter `--card-spacing`)                                                                                                       | `rounded-xl` (16px), `shadow-card`, `ring-1 ring-foreground/10`. Parts: Header, Title, Description, Action, Content, Footer |
| `Collapsible`  | base-ui   | none                                                                                                                                                                |                                                                                                                                                    | Pass-through                                                                                                                |
| `Command`      | cmdk      | uses `Dialog` variant `command`                                                                                                                                     |                                                                                                                                                    | Parts: Input, List, Empty, Group, Separator, Item, Shortcut                                                                 |
| `Dialog`       | base-ui   | content `default`\* (centered), `command` (top third, no padding), `responsive` (bottom sheet under `sm`, centered above)                                           |                                                                                                                                                    | Props `animated`, `showCloseButton`                                                                                         |
| `DropdownMenu` | base-ui   | item `default`\*, `destructive`                                                                                                                                     |                                                                                                                                                    | `inset` on Label, Item, SubTrigger                                                                                          |
| `Field`        | fieldset  | orientation `vertical`\*, `horizontal`, `responsive`; legend `legend`\*, `label`                                                                                    |                                                                                                                                                    | `FieldError` takes an `errors` array and removes duplicates. Description links hover indigo                                 |
| `HoverCard`    | base-ui   | none                                                                                                                                                                |                                                                                                                                                    | side `bottom`, align `center`                                                                                               |
| `InputGroup`   | div       | group `default`\*, `command`; addon align `inline-start`\*, `inline-end`, `block-start`, `block-end`                                                                | `default`\* (h-8), `lg` (h-10), `xl` (h-12)                                                                                                        | Wraps `Input`, `Textarea`, `Button`                                                                                         |
| `Input`        | base-ui   | `default`\*, `plain`, `currency`, `input-group`                                                                                                                     | `default`\*, `lg` (h-10), `xl` (h-12)                                                                                                              | Text is `type-input`                                                                                                        |
| `Label`        | label     | `default`\*, `field`                                                                                                                                                |                                                                                                                                                    |                                                                                                                             |
| `Logo`         | svg       | none                                                                                                                                                                | `size-5`                                                                                                                                           | Themed through `--logo-*` CSS variables                                                                                     |
| `Select`       | base-ui   | trigger `default`\*, `ghost`                                                                                                                                        | trigger `default`\* (h-8), `sm` (h-7)                                                                                                              | `alignItemWithTrigger`                                                                                                      |
| `Separator`    | base-ui   | `default`\*, `button-group`                                                                                                                                         |                                                                                                                                                    | orientation `horizontal`\*                                                                                                  |
| `Sheet`        | base-ui   | side `right`\*, `left`, `top`, `bottom`                                                                                                                             |                                                                                                                                                    | Built on `Dialog`                                                                                                           |
| `Sidebar`      | useRender | `sidebar`\*, `floating`, `inset`; collapsible `offcanvas`\*, `icon`, `none`; menu button `default`\*, `outline`                                                     | menu button `default`\* (`type-label`), `sm` (`type-caption`), `lg`; width 12rem, mobile 18rem, icon rail 3rem                                     | Cream background, white active item. State in the `sidebar_state` cookie for 7 days; shortcut Cmd/Ctrl+B                    |
| `Skeleton`     | div       | none                                                                                                                                                                |                                                                                                                                                    | `animate-pulse`                                                                                                             |
| `Spinner`      | lucide    | none                                                                                                                                                                | `size-4`                                                                                                                                           | `Loader2Icon` with `animate-spin`                                                                                           |
| `Switch`       | base-ui   | none                                                                                                                                                                | `default`\*, `sm`                                                                                                                                  |                                                                                                                             |
| `Table`        | table     | cell `default`\*, `code` (mono, wraps), `empty` (centered, muted, h-24)                                                                                             |                                                                                                                                                    |                                                                                                                             |
| `Textarea`     | textarea  | `default`\*, `input-group`                                                                                                                                          |                                                                                                                                                    | `field-sizing-content`, `min-h-16`                                                                                          |
| `Tooltip`      | base-ui   | none                                                                                                                                                                |                                                                                                                                                    | Provider delay 0; side `top`; has an arrow                                                                                  |

Button variant intent:

| Variant       | Look                                                                                          | Use for                                                            |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `default`     | Navy fill, white text, darker navy on hover                                                   | The one main action on a view                                      |
| `outline`     | Border, white background, muted on hover                                                      | Secondary actions                                                  |
| `secondary`   | Light gray fill                                                                               | Secondary actions on the cream page or inside a colored region     |
| `subtle`      | Light gray fill, muted text                                                                   | Low-emphasis actions                                               |
| `ghost`       | No fill until hover                                                                           | Toolbar and icon actions                                           |
| `quiet`       | No fill, muted text, no hover fill                                                            | Inline actions in dense text                                       |
| `plain`       | No styling at all                                                                             | Wrapping custom content                                            |
| `surface`     | Card look with `shadow-card`, lifts to `shadow-card-hover` on hover, full width, left aligned | Large tappable cards, such as the channel buttons on the home page |
| `destructive` | Red tint fill, red border, red text                                                           | Delete and disconnect                                              |
| `link`        | Indigo text, underline on hover                                                               | Inline navigation                                                  |
| `motion`      | Muted text, pressed state in foreground color                                                 | The motion toggle in the chat composer                             |

The compatibility layer in `src/app/styles/brand/shadcn.css` forces the text
family and the ui weight onto every `[data-slot="button"|"badge"|"label"]`,
`[data-slot$="-trigger"]`, and `[data-slot$="-title"]`, and the body weight
onto `[data-slot="input"|"textarea"]` and `[data-slot$="-description"]`. It
also defines the `code-card` command and argument colors.

## 5. Composed components

`src/components/ai-elements` holds the chat surface, built on the primitives:

| File                 | Role                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversation.tsx`   | Scrolling message list with stick-to-bottom and a scroll-to-bottom button                                                                                        |
| `message.tsx`        | Message bubble; user side `bubble-user`, assistant side `bubble-assistant`, both `rounded-bubble`; markdown through `streamdown`; text is `type-supporting-body` |
| `prompt-input.tsx`   | Composer with command palette, menu, and hover card                                                                                                              |
| `model-selector.tsx` | Model picker in a `Command` dialog                                                                                                                               |
| `question.tsx`       | Inline question form                                                                                                                                             |
| `reasoning.tsx`      | Collapsible reasoning panel                                                                                                                                      |
| `tool.tsx`           | Collapsible tool call with status icons                                                                                                                          |
| `shimmer.tsx`        | Text shimmer for streaming, uses `motion/react`                                                                                                                  |

`src/components/browser/activity-duration-breakdown.tsx` is the color legend
for browser worker activity kinds; it reads the nine `activity-*` tokens.

## 6. Application shell

Source: `src/app/(authenticated)/layout.tsx` and `_components`.

- `SidebarProvider` wraps a `Sidebar` (default variant, offcanvas collapse)
  and a `SidebarInset` that scrolls (`h-svh overflow-y-auto`).
- The sidebar header is the `Logo` and the product name in a
  `SidebarMenuButton`. The content is the navigation. The footer is the
  account control.
- Below `md`, a 48px header with a `SidebarTrigger` and a `type-label` page
  name replaces the sidebar.
- The root layout loads the two fonts and applies no theme class.
  `TooltipProvider` and the query provider wrap the app.

## 7. Theme

The dark token set in `foundation.css` under `.dark` is the pre-restyle
shadcn neutral set. The Tailwind variant is
`@custom-variant dark (&:is(.dark *))`. No code sets the `dark` class, and
the repository has no theme provider dependency. The application renders in
light mode only. Proposed decision D4 in `JORY_DESIGN_MERGE.md` keeps it that way.

## 8. Known gaps

Each item is verified against the named file on 2026-09-03.

1. **Dark mode is unreachable and unbranded.** See section 7. The `.dark`
   values do not match the Jory palette.
2. **Two undefined type classes are in use.** `type-definitions` and
   `type-assertion` appear once each in `src/**/*.tsx` and are not defined in
   `typography.css`. They have no effect.
3. **Two declarations per variant-capable role.** `typography.css` defines
   every `type-*` role in `@layer utilities`, then re-declares
   `type-caption`, `type-label`, `type-card-title`, `type-ui`, and
   `type-emphasis` with `@utility`. Only the `@utility` form works behind a
   Tailwind variant (`data-active:type-emphasis`, `hover:type-label`); the
   other roles do not. Use one of those five when a role must change under a
   variant, or add the missing `@utility` block.
4. **No spacing, elevation scale, or z-index tokens.** Section 3.8 lists
   observed conventions only; section 3.5 has two shadows.
5. **No component showcase route.** `docs/design/design-system.pen` (Pencil)
   draws every primitive and screen at the shipped values, but it is a design
   file, not a rendered route.
6. **`chart-1` to `chart-5` are still the shadcn defaults.** No chart ships
   today.

## 9. How to change the system

- **New primitive:** `pnpm dlx shadcn@latest add <name>`, then add
  `data-slot`, replace raw text classes with `type-*`, and add a row to
  section 4.
- **New variant:** add it to the `cva` map in the primitive file, add a row
  to section 4, and give it a "use for" sentence.
- **New color:** add the value to `foundation.css` with the source hex in a
  comment and the `@theme inline` map in the same file, then add a row to
  section 3.3.
- **New type role:** add the `--merit-recipe-*` tokens and the `type-*`
  utility to `typography.css`, then add a row to section 3.2.
- Run `pnpm check` and `pnpm build`, then open the affected page in a
  browser before you hand off.
