# OpenInstinct design system

This document describes the design system as it exists in this repository on
2026-09-03. Every value below is read from a source file. The file path is
named next to each group of values. When the source changes, update this
document in the same pull request.

Labels follow [`README.md`](README.md): **Implemented** means the code exists.
**Proposed** means a decision that is not in the code yet. Sections without a
label are implemented.

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

| Layer            | Choice                                          | Source                               |
| ---------------- | ----------------------------------------------- | ------------------------------------ |
| CSS engine       | Tailwind v4 (`@import "tailwindcss"`, `@theme`) | `src/app/globals.css`                |
| Component base   | shadcn, style `base-nova`, base color `neutral` | `components.json`                    |
| Headless library | `@base-ui/react` (14 of 25 primitives)          | `src/components/ui/*.tsx` imports    |
| Variant tool     | `class-variance-authority` (`cva`)              | `src/components/ui/*.tsx`            |
| Icons            | `lucide-react`                                  | `components.json`, `iconLibrary`     |
| Fonts            | Vault, Vault Sans, Vault Mono (self-hosted)     | `public/fonts`, `typography.css`     |
| Chat rendering   | `streamdown`                                    | `src/components/ai-elements`         |
| Polymorphism     | base-ui `render` prop, not `asChild`            | `button.tsx`, `badge.tsx`, `sidebar` |

The stylesheet import order in `src/app/globals.css` is:
`tailwindcss`, `shadcn/tailwind.css`, `foundation.css`, `typography.css`,
`shadcn.css`, `motion.css`, then the local `:root` overrides. Later files win.

## 3. Foundations

### 3.1 Fonts

Source: `src/app/styles/brand/typography.css`, `public/fonts`.

| Family     | File                        | Weights | Role                                |
| ---------- | --------------------------- | ------- | ----------------------------------- |
| Vault      | `vault-variable.woff2`      | 300-800 | Text and UI (`--merit-family-text`) |
| Vault Sans | `vault-sans-variable.woff2` | 300-800 | Display (`--merit-family-display`)  |
| Vault Mono | `vault-mono-variable.woff2` | 300-800 | Code (`--merit-family-mono`)        |

The fonts are Mona Sans derivatives under the SIL Open Font License 1.1
(`public/fonts/OFL.txt`). The typography file is vendored from the
`@merit-systems/brand` package; the token prefix is `--merit-`.

Weight tokens: body 375, ui 450, signal 375, emphasis 575, mono 375.
Tracking tokens: text 0, display -0.022rem, tight -0.015rem, mono 0.

### 3.2 Type scale

Source: `src/app/styles/brand/typography.css`. Pixel values assume a 16px root.

| Utility                | Family     | Size                                  | Weight  | Tracking  | Line height | Use for                                   |
| ---------------------- | ---------- | ------------------------------------- | ------- | --------- | ----------- | ----------------------------------------- |
| `type-product-title`   | Vault      | 2.25rem (36)                          | 450     | -0.015rem | 1           | Product name on a landing or sign-in view |
| `type-page-title`      | Vault      | 1.875rem (30)                         | 450     | -0.015rem | 1.2         | The one `h1` of a page                    |
| `type-section-title`   | Vault      | 1.125rem (18)                         | 450     | 0         | 1.35        | `h2` of a page section                    |
| `type-card-title`      | Vault      | 1rem (16)                             | 450     | 0         | 1.35        | Card and dialog titles                    |
| `type-banner-metric`   | Vault      | 1.5rem (24)                           | 575     | 0         | 1           | A single large number                     |
| `type-body`            | Vault      | inherit (16)                          | 375     | 0         | inherit     | Long-form prose                           |
| `type-supporting-body` | Vault      | 0.875rem (14)                         | 375     | 0         | 1.5         | Descriptions, chat text, form help        |
| `type-label`           | Vault      | 0.875rem (14)                         | 450     | 0         | 1.35        | Buttons, row labels, nav items            |
| `type-input`           | Vault      | 1rem (16); 0.875rem at width >= 48rem | 375     | 0         | 1.5         | Text inside inputs                        |
| `type-caption`         | Vault      | 0.75rem (12)                          | 375     | 0         | 1.35        | Secondary text under a label              |
| `type-micro`           | Vault      | 0.6875rem (11)                        | 450     | 0         | 1.25        | Group headings in the sidebar, tags       |
| `type-code`            | Mono       | 0.875rem (14)                         | 375     | 0         | 1.5         | Code blocks                               |
| `type-compact-code`    | Mono       | 0.75rem (12)                          | 375     | 0         | 1.35        | Inline code, shortcuts, IDs               |
| `type-signal`          | Vault Sans | inherit                               | 375     | -0.022rem | inherit     | Display text; sets `text-wrap: balance`   |
| `type-ui`              | Vault      | inherit                               | 450     | 0         | inherit     | Weight-only UI text                       |
| `type-mono`            | Mono       | inherit                               | 375     | 0         | inherit     | Family-only mono text                     |
| `type-emphasis`        | inherit    | inherit                               | 575     | inherit   | inherit     | Bold inside a run of text                 |
| `type-numeric`         | inherit    | inherit                               | inherit | inherit   | inherit     | Tabular lining numerals                   |

Scale-only utilities set size and line height and nothing else:
`type-scale-display` (2.25rem / 0.95), `type-scale-body` (1rem / 1.5),
`type-scale-supporting` (0.875rem / 1.5), `type-scale-caption` (0.75rem / 1.35),
`type-scale-micro` (0.6875rem / 1.25).

The base layer sets `html` to the body values and `font-kerning: normal`.
`strong`, `b`, and `em` get the emphasis weight. `code`, `kbd`, `samp`, and
`pre` get the mono family with ligatures off.

Observed use on 2026-09-03 (count of class occurrences in `src/**/*.tsx`,
n=167): `type-supporting-body` 52, `type-label` 52, `type-caption` 21,
`type-card-title` 9, `type-compact-code` 7, `type-section-title` 6,
`type-page-title` 6, `type-numeric` 4, `type-input` 3, and one each of
`type-product-title`, `type-micro`, `type-code`, `type-body`,
`type-banner-metric`. Two classes in the source, `type-definitions` and
`type-assertion`, are not defined in `typography.css` (see section 8).

### 3.3 Color

Source: `src/app/styles/brand/foundation.css` (all tokens) and
`src/app/globals.css` (primary and ring override). Values are OKLCH unless
marked hex.

| Token                            | Light                        | Dark                         |
| -------------------------------- | ---------------------------- | ---------------------------- |
| `background`                     | 1 0 0                        | 0.145 0 0                    |
| `foreground`                     | 0.145 0 0                    | 0.985 0 0                    |
| `card` / `-foreground`           | 1 0 0 / 0.145 0 0            | 0.205 0 0 / 0.985 0 0        |
| `popover` / `-foreground`        | 1 0 0 / 0.145 0 0            | 0.205 0 0 / 0.985 0 0        |
| `primary`                        | `#007aff` (hex, globals.css) | `#0a84ff` (hex, globals.css) |
| `primary-foreground`             | `#fff` (hex, globals.css)    | `#fff` (hex, globals.css)    |
| `secondary` / `-foreground`      | 0.97 0 0 / 0.205 0 0         | 0.269 0 0 / 0.985 0 0        |
| `muted` / `-foreground`          | 0.97 0 0 / 0.556 0 0         | 0.269 0 0 / 0.708 0 0        |
| `accent` / `-foreground`         | 0.97 0 0 / 0.205 0 0         | 0.269 0 0 / 0.985 0 0        |
| `border`                         | 0.922 0 0                    | 1 0 0 / 10%                  |
| `input`                          | 0.922 0 0                    | 1 0 0 / 15%                  |
| `ring`                           | `#007aff` (hex, globals.css) | `#0a84ff` (hex, globals.css) |
| `destructive`                    | 0.53 0.245 27.325            | 0.82 0.15 22.216             |
| `destructive-border`             | same / 32%                   | same / 40%                   |
| `destructive-subtle`             | same / 10%                   | same / 11%                   |
| `information`                    | 0.48 0.14 250                | 0.75 0.12 250                |
| `information-border`             | 0.72 0.1 250                 | 0.56 0.1 250                 |
| `information-subtle`             | 0.96 0.025 250               | 0.27 0.045 250               |
| `success`                        | 0.44 0.14 150                | 0.74 0.14 150                |
| `success-border`                 | 0.72 0.1 150                 | 0.54 0.1 150                 |
| `success-subtle`                 | 0.96 0.03 150                | 0.27 0.045 150               |
| `warning`                        | 0.47 0.12 75                 | 0.82 0.13 85                 |
| `warning-border`                 | 0.77 0.11 75                 | 0.58 0.1 75                  |
| `warning-subtle`                 | 0.97 0.035 85                | 0.29 0.045 75                |
| `chart-1` … `chart-5`            | see `foundation.css`         | see `foundation.css`         |
| `sidebar`                        | 0.985 0 0                    | 0.205 0 0                    |
| `sidebar-foreground`             | 0.145 0 0                    | 0.985 0 0                    |
| `sidebar-primary`                | = `primary`                  | = `primary`                  |
| `sidebar-accent` / `-foreground` | 0.97 0 0 / 0.205 0 0         | 0.269 0 0 / 0.985 0 0        |
| `sidebar-border`                 | 0.922 0 0                    | 1 0 0 / 10%                  |
| `sidebar-ring`                   | 0.708 0 0                    | 0.556 0 0                    |

Notes:

- The palette is neutral gray with one brand hue: the primary blue. The blue
  is the iOS system blue and is set in `globals.css`. `foundation.css` also
  sets `primary` (0.205 0 0 light, 0.922 0 0 dark) and `ring`; `globals.css`
  loads later and wins, so those values are not in effect.
- Each status tone has three tokens: the strong color (`success`), a border at
  reduced strength (`success-border`), and a tinted surface
  (`success-subtle`). `Alert`, `Badge`, and the destructive `Button` use all
  three together.
- The base layer gives every element `border-border` and `outline-ring/50`,
  and gives `body` `bg-background text-foreground`.

### 3.4 Radius

Source: `foundation.css`. Base `--radius: 0.625rem` (10px).

| Token        | Factor | Pixels |
| ------------ | ------ | ------ |
| `radius-xs`  | 0.5    | 5      |
| `radius-sm`  | 0.75   | 7.5    |
| `radius-md`  | 0.875  | 8.75   |
| `radius-lg`  | 1      | 10     |
| `radius-xl`  | 1.5    | 15     |
| `radius-2xl` | 2      | 20     |
| `radius-3xl` | 2.2    | 22     |
| `radius-4xl` | 2.6    | 26     |

Buttons and inputs use `rounded-lg`. Small buttons cap the radius with
`min(var(--radius-md), 10px)`. The `surface` button uses `rounded-xl`.

### 3.5 Motion

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

### 3.6 Icons

`lucide-react` only. The default icon size is `size-4` (16px). Every primitive
applies `[&_svg:not([class*='size-'])]:size-4`, so an icon without an explicit
size class gets 16px. The `xs` button size uses `size-3` (12px) and `sm` uses
`size-3.5` (14px).

### 3.7 Spacing and layout

There are no spacing tokens beyond the Tailwind default scale. These
conventions are observed in the pages, not defined in a token file.

| Pattern          | Classes                                                                                    | Seen in                              |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| Page container   | `mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8`           | workspace, vault, chat history pages |
| Page header      | `type-page-title` then `type-supporting-body text-muted-foreground`                        | chat history, vault, sign-in         |
| Section          | `<section aria-labelledby>` with `space-y-3` and an `h2.type-section-title`                | workspace page                       |
| Row list         | `divide-y divide-border/50 border-y border-border/50`; rows `flex items-center gap-3 py-4` | workspace page                       |
| Row icon well    | `size-9 rounded-md border border-border bg-muted/50 text-muted-foreground`                 | workspace page                       |
| Narrow form page | `min-h-svh` centered, `max-w-sm space-y-6`                                                 | sign-in page                         |
| Mobile header    | `h-12 border-b border-border/50 px-4 md:hidden` with `SidebarTrigger`                      | authenticated navigation             |

## 4. Primitives

Source: `src/components/ui/*.tsx`. "Base" names the headless library. The
default is marked with an asterisk.

| Primitive      | Base      | Variants                                                                                                                            | Sizes                                                                                                                                              | Notes                                                                                             |
| -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Alert`        | div       | `default`\*, `success`, `warning`, `information`, `destructive`                                                                     | one                                                                                                                                                | Parts: `AlertTitle`, `AlertDescription`, `AlertAction`                                            |
| `Badge`        | useRender | `default`\* (primary fill), `secondary`, `success`, `warning`, `information`, `destructive`, `outline`, `ghost`, `link`             | fixed `h-5`                                                                                                                                        | Polymorphic through `render`                                                                      |
| `Button`       | base-ui   | `default`\* (primary fill), `outline`, `secondary`, `subtle`, `ghost`, `quiet`, `plain`, `surface`, `destructive`, `link`, `motion` | `default`\* (h-8), `xs` (h-6), `sm` (h-7), `lg` (h-9), `icon` (8), `icon-xs`, `icon-sm`, `icon-lg`, `none`, `surface`, `motion-box`, `motion-line` | `surface` variant defaults to the `surface` size: full width, left aligned, `rounded-xl p-4`      |
| `ButtonGroup`  | div       | orientation `horizontal`\*, `vertical`                                                                                              |                                                                                                                                                    | Parts: `ButtonGroupSeparator`, `ButtonGroupText`                                                  |
| `Card`         | div       | none                                                                                                                                | `default`\*, `sm` (tighter `--card-spacing`)                                                                                                       | Border is `ring-1 ring-foreground/10`. Parts: Header, Title, Description, Action, Content, Footer |
| `Collapsible`  | base-ui   | none                                                                                                                                |                                                                                                                                                    | Pass-through                                                                                      |
| `Command`      | cmdk      | uses `Dialog` variant `command`                                                                                                     |                                                                                                                                                    | Parts: Input, List, Empty, Group, Separator, Item, Shortcut                                       |
| `Dialog`       | base-ui   | content `default`\* (centered), `command` (top third, no padding), `responsive` (bottom sheet under `sm`, centered above)           |                                                                                                                                                    | Props `animated`, `showCloseButton`                                                               |
| `DropdownMenu` | base-ui   | item `default`\*, `destructive`                                                                                                     |                                                                                                                                                    | `inset` on Label, Item, SubTrigger                                                                |
| `Field`        | fieldset  | orientation `vertical`\*, `horizontal`, `responsive`; legend `legend`\*, `label`                                                    |                                                                                                                                                    | `FieldError` takes an `errors` array and removes duplicates                                       |
| `HoverCard`    | base-ui   | none                                                                                                                                |                                                                                                                                                    | side `bottom`, align `center`                                                                     |
| `InputGroup`   | div       | group `default`\*, `command`; addon align `inline-start`\*, `inline-end`, `block-start`, `block-end`                                | `default`\* (h-8), `lg` (h-10), `xl` (h-12)                                                                                                        | Wraps `Input`, `Textarea`, `Button`                                                               |
| `Input`        | base-ui   | `default`\*, `plain`, `currency`, `input-group`                                                                                     | `default`\*, `lg` (h-10), `xl` (h-12)                                                                                                              | Text is `type-input`                                                                              |
| `Label`        | label     | `default`\*, `field`                                                                                                                |                                                                                                                                                    |                                                                                                   |
| `Logo`         | svg       | none                                                                                                                                | `size-5`                                                                                                                                           | Themed through `--logo-*` CSS variables                                                           |
| `Select`       | base-ui   | trigger `default`\*, `ghost`                                                                                                        | trigger `default`\* (h-8), `sm` (h-7)                                                                                                              | `alignItemWithTrigger`                                                                            |
| `Separator`    | base-ui   | `default`\*, `button-group`                                                                                                         |                                                                                                                                                    | orientation `horizontal`\*                                                                        |
| `Sheet`        | base-ui   | side `right`\*, `left`, `top`, `bottom`                                                                                             |                                                                                                                                                    | Built on `Dialog`                                                                                 |
| `Sidebar`      | useRender | `sidebar`\*, `floating`, `inset`; collapsible `offcanvas`\*, `icon`, `none`; menu button `default`\*, `outline`                     | menu button `default`\*, `sm`, `lg`; width 12rem, mobile 18rem, icon rail 3rem                                                                     | State in the `sidebar_state` cookie for 7 days; shortcut Cmd/Ctrl+B                               |
| `Skeleton`     | div       | none                                                                                                                                |                                                                                                                                                    | `animate-pulse`                                                                                   |
| `Spinner`      | lucide    | none                                                                                                                                | `size-4`                                                                                                                                           | `Loader2Icon` with `animate-spin`                                                                 |
| `Switch`       | base-ui   | none                                                                                                                                | `default`\*, `sm`                                                                                                                                  |                                                                                                   |
| `Table`        | table     | cell `default`\*, `code` (mono, wraps), `empty` (centered, muted, h-24)                                                             |                                                                                                                                                    |                                                                                                   |
| `Textarea`     | textarea  | `default`\*, `input-group`                                                                                                          |                                                                                                                                                    | `field-sizing-content`, `min-h-16`                                                                |
| `Tooltip`      | base-ui   | none                                                                                                                                |                                                                                                                                                    | Provider delay 0; side `top`; has an arrow                                                        |

Button variant intent:

| Variant       | Look                                            | Use for                                                            |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `default`     | Primary blue fill, white text                   | The one main action on a view                                      |
| `outline`     | Border, background, muted on hover              | Secondary actions                                                  |
| `secondary`   | Light gray fill                                 | Secondary actions inside a colored region                          |
| `subtle`      | Light gray fill, muted text                     | Low-emphasis actions                                               |
| `ghost`       | No fill until hover                             | Toolbar and icon actions                                           |
| `quiet`       | No fill, muted text, no hover fill              | Inline actions in dense text                                       |
| `plain`       | No styling at all                               | Wrapping custom content                                            |
| `surface`     | Card look with shadow, full width, left aligned | Large tappable cards, such as the channel buttons on the home page |
| `destructive` | Red tint fill, red border, red text             | Delete and disconnect                                              |
| `link`        | Blue text, underline on hover                   | Inline navigation                                                  |
| `motion`      | Muted text, pressed state in foreground color   | The motion toggle in the chat composer                             |

The compatibility layer in `src/app/styles/brand/shadcn.css` forces the Vault
family and the ui weight onto every `[data-slot="button"|"badge"|"label"]`,
`[data-slot$="-trigger"]`, and `[data-slot$="-title"]`, and the body weight onto
`[data-slot="input"|"textarea"]` and `[data-slot$="-description"]`. It also
defines the `code-card` command and argument colors.

## 5. Composed components

`src/components/ai-elements` holds the chat surface, built on the primitives:

| File                 | Role                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `conversation.tsx`   | Scrolling message list with stick-to-bottom and a scroll-to-bottom button     |
| `message.tsx`        | Message bubble; markdown through `streamdown`; text is `type-supporting-body` |
| `prompt-input.tsx`   | Composer with command palette, menu, and hover card                           |
| `model-selector.tsx` | Model picker in a `Command` dialog                                            |
| `question.tsx`       | Inline question form                                                          |
| `reasoning.tsx`      | Collapsible reasoning panel                                                   |
| `tool.tsx`           | Collapsible tool call with status icons                                       |
| `shimmer.tsx`        | Text shimmer for streaming, uses `motion/react`                               |

`src/components/browser/activity-duration-breakdown.tsx` is the color legend
for browser worker activity kinds.

## 6. Application shell

Source: `src/app/(authenticated)/layout.tsx` and `_components`.

- `SidebarProvider` wraps a `Sidebar` (default variant, offcanvas collapse)
  and a `SidebarInset` that scrolls (`h-svh overflow-y-auto`).
- The sidebar header is the `Logo` and the product name in a
  `SidebarMenuButton`. The content is the navigation. The footer is the
  account control.
- Below `md`, a 48px header with a `SidebarTrigger` and a `type-label` page
  name replaces the sidebar.
- The root layout applies no theme class. `TooltipProvider` and the query
  provider wrap the app.

## 7. Theme

The dark token set exists in `foundation.css` under `.dark`, and the Tailwind
variant is `@custom-variant dark (&:is(.dark *))`. No code sets the `dark`
class: `src/app/layout.tsx` renders `<html lang="en">` with no class, and the
repository has no theme provider dependency. The application renders in light
mode only. Dark values are defined but not reachable by a user.

## 8. Known gaps

Each item is verified against the named file on 2026-09-03.

1. **Primary color is defined twice.** `foundation.css` sets a neutral
   primary; `globals.css` overrides it with hex blue. One definition should
   own it (**Proposed**: move the blue into `foundation.css` as OKLCH).
2. **Dark mode is unreachable.** See section 7.
3. **Two undefined type classes are in use.** `type-definitions` and
   `type-assertion` appear once each in `src/**/*.tsx` and are not defined in
   `typography.css`. They have no effect.
4. **Raw text classes remain in three files.** `text-sm`, `text-xs`, and
   `font-medium` appear in `src/components/ui/sidebar.tsx`,
   `src/components/ai-elements/question.tsx`, and
   `src/components/ai-elements/conversation.tsx` (9, 4, and 5 occurrences
   across the three files). Rule 2 says to use `type-*`.
5. **Duplicate utility declarations.** The end of `typography.css` re-declares
   `type-caption`, `type-label`, and `type-card-title` with `@utility` after
   the `@layer utilities` block defines them. The file gives no reason.
6. **No spacing, elevation, or z-index tokens.** Section 3.7 lists observed
   conventions only.
7. **No component showcase.** There is no route or story file that renders
   every primitive and variant. Visual review needs the real pages.
   `docs/design/design-system.pen` (Pencil) draws every primitive, variant,
   composed component, and screen from the catalog in
   `docs/design/catalog-openinstinct.md`; it is a design file, not a
   rendered route.
8. **Nine raw palette colors in the browser activity legend.**
   `src/components/browser/activity-duration-breakdown.tsx` uses
   `bg-violet-500`, `bg-cyan-500`, `bg-blue-500`, `bg-fuchsia-500`,
   `bg-emerald-500`, `bg-amber-500`, `bg-slate-400`, `bg-orange-400`, and
   `bg-zinc-400` for its nine activity kinds. No token set covers nine
   categories; the five `chart-*` tokens are the nearest.

## 9. How to change the system

- **New primitive:** `pnpm dlx shadcn@latest add <name>`, then add
  `data-slot`, replace raw text classes with `type-*`, and add a row to
  section 4.
- **New variant:** add it to the `cva` map in the primitive file, add a row
  to section 4, and give it a "use for" sentence.
- **New color:** add the light and dark value to `foundation.css` and the
  `@theme inline` map in the same file, then add a row to section 3.3.
- **New type role:** add the `--merit-recipe-*` tokens and the `type-*`
  utility to `typography.css`, then add a row to section 3.2.
- Run `pnpm check` and `pnpm build`, then open the affected page in a
  browser before you hand off.
