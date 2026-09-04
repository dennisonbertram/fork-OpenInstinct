# OpenInstinct UI Component Catalog

Source repo: dennisonbertram/fork-OpenInstinct, worktree design-system-docs, snapshot 2026-09-03.
Token source of truth: docs/DESIGN_SYSTEM.md and src/app/styles/brand/*.css. All values below are read from files; none are invented.

## 1. UI Primitives (src/components/ui)

Source read: `docs/DESIGN_SYSTEM.md`, all 25 files in `src/components/ui/*.tsx`,
`src/app/styles/brand/foundation.css`, `src/app/styles/brand/typography.css`,
`src/app/styles/brand/shadcn.css`, `src/app/styles/brand/motion.css`.

Conventions used below:

- "type role" cites the `type-*` class literally present in the file, with its
  documented size/weight/line-height pulled from DESIGN_SYSTEM.md section 3.2.
- Radius tokens: `--radius` base is 0.625rem (10px). `rounded-lg` = `--radius-lg` = 10px;
  `rounded-md` = Tailwind default `--radius-md` **Tailwind token**, not the
  design system's `--radius-md` (8.75px) — see note under each primitive that
  uses bare `rounded-md`/`rounded-sm`, since Tailwind v4's own default radius
  scale (`rounded-md`=6px, `rounded-sm`=4px per Tailwind defaults) is not
  overridden by `foundation.css` (which only defines `--radius-xs` through
  `--radius-4xl`, not `--radius` itself as the Tailwind `rounded-md` alias).
  Where a class is a bare Tailwind radius utility (`rounded-md`, `rounded-sm`,
  `rounded-full`) rather than one of the documented `radius-*` tokens, this is
  called out explicitly and NOT resolved to a `radius-*` token, since
  DESIGN_SYSTEM.md section 3.4 only documents `radius-xs` … `radius-4xl`.
- Colors are cited as the semantic Tailwind class (e.g. `bg-card`) plus the
  OKLCH/hex value from DESIGN_SYSTEM.md section 3.3, light value shown (dark
  value noted only where different and reachable — DESIGN_SYSTEM.md section 7
  states dark mode is unreachable in this app, so dark values are defined but
  not shown by default; theme classes exist in the file are still reported).
- "Cannot resolve" is stated explicitly wherever a class has no documented
  token equivalent (arbitrary values, Tailwind defaults not covered by
  foundation.css, or state selectors not in DESIGN_SYSTEM.md).

Base library split, per DESIGN_SYSTEM.md section 2/4 ("14 of 25 primitives" use
`@base-ui/react`) and confirmed against each file's imports:

| Uses `@base-ui/react` (14)                 | Plain / other (11)                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button (`@base-ui/react/button`)           | Alert (plain div)                                                                                                                                           |
| Collapsible (`@base-ui/react/collapsible`) | Badge (`@base-ui/react/use-render` + `merge-props`, not a component primitive — DESIGN_SYSTEM.md lists Badge's Base as "useRender")                         |
| Dialog (`@base-ui/react/dialog`)           | ButtonGroup (plain div)                                                                                                                                     |
| DropdownMenu (`@base-ui/react/menu`)       | Card (plain div)                                                                                                                                            |
| HoverCard (`@base-ui/react/preview-card`)  | Command (`cmdk`, not base-ui)                                                                                                                               |
| Input (`@base-ui/react/input`)             | Field (plain fieldset)                                                                                                                                      |
| Select (`@base-ui/react/select`)           | Label (plain label)                                                                                                                                         |
| Separator (`@base-ui/react/separator`)     | Logo (plain svg)                                                                                                                                            |
| Sheet (`@base-ui/react/dialog`, aliased)   | Sidebar (`useRender`/`merge-props` from base-ui for some parts, but DESIGN_SYSTEM.md lists Sidebar's Base as "useRender", plain div/ul/li/button elsewhere) |
| Switch (`@base-ui/react/switch`)           | Skeleton (plain div)                                                                                                                                        |
| Tooltip (`@base-ui/react/tooltip`)         | Spinner (`lucide-react` icon)                                                                                                                               |
|                                            | Table (plain table elements)                                                                                                                                |
|                                            | Textarea (plain textarea)                                                                                                                                   |

Note: DESIGN_SYSTEM.md's table (section 4) lists Base as "base-ui" for Button,
Collapsible, Dialog, DropdownMenu, HoverCard, Input, Select, Separator, Sheet,
Switch, Tooltip — 11 rows marked literally `base-ui`. Badge and Sidebar are
marked "useRender" (a base-ui utility, `@base-ui/react/use-render`), not
`base-ui` in the Base column. InputGroup is marked "div". Counting rows
literally marked `base-ui` in DESIGN_SYSTEM.md's own table gives 11, not 14;
the "14 of 25" figure in section 2's Stack table also counts the useRender-based
primitives (Badge, Sidebar) plus one more. **This document could not fully
reconcile the exact 14-item list from the two contradicting counts in
DESIGN_SYSTEM.md itself (section 2 says 14, section 4's table shows 11 rows
literally reading "base-ui" plus 2 "useRender" rows = 13 by that count)** —
reported here as observed rather than resolved, since guessing which 14th
primitive was intended would be inventing a fact not in the source.

---

### Alert (`alert.tsx`)

`data-slot`: `alert` (root, `data-variant` also set), `alert-title`,
`alert-description`, `alert-action`.

Base: plain `div`, `role="alert"`.

| variant       | padding px                 | radius px                           | background token                                   | text token                             | border token                                                                                                                                               | type role                                                                             | icon                                                               |
| ------------- | -------------------------- | ----------------------------------- | -------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `default`*    | `px-2.5 py-2` = 10px / 8px | `rounded-lg` = 10px (`--radius-lg`) | `bg-card` (1 0 0, white)                           | `text-card-foreground` (0.145 0 0)     | `border` (unset variant color; base `border` class only, defaults to `border-border` = 0.922 0 0 per base-layer rule "every element gets `border-border`") | body text: `type-supporting-body` (14px/375/1.5); title: `type-label` (14px/450/1.35) | `size-4` (16px) default via `*:[svg:not([class*='size-'])]:size-4` |
| `success`     | same                       | same                                | `bg-success-subtle` (0.96 0.03 150)                | `text-success` (0.44 0.14 150)         | `border-success-border` (0.72 0.1 150)                                                                                                                     | same                                                                                  | same                                                               |
| `warning`     | same                       | same                                | `bg-warning-subtle` (0.97 0.035 85)                | `text-warning` (0.47 0.12 75)          | `border-warning-border` (0.77 0.11 75)                                                                                                                     | same                                                                                  | same                                                               |
| `information` | same                       | same                                | `bg-information-subtle` (0.96 0.025 250)           | `text-information` (0.48 0.14 250)     | `border-information-border` (0.72 0.1 250)                                                                                                                 | same                                                                                  | same                                                               |
| `destructive` | same                       | same                                | `bg-destructive-subtle` (0.53 0.245 27.325 at 10%) | `text-destructive` (0.53 0.245 27.325) | `border-destructive-border` (0.53 0.245 27.325 at 32%)                                                                                                     | same                                                                                  | same                                                               |

Notes: `AlertAction` is `absolute top-2 right-2` (8px offsets), no
background/radius of its own. `AlertDescription` text is `text-muted-foreground`
(0.556 0 0) except when the variant sets it via
`*:data-[slot=alert-description]:text-<variant>`. No documented shadow. No
documented hover/active/focus/disabled states (Alert is non-interactive).

---

### Badge (`badge.tsx`)

`data-slot`: `badge`. Base: `useRender` (polymorphic via `render` prop), per
DESIGN_SYSTEM.md.

Single fixed size: `h-5` = 20px height, `px-2 py-0.5` = 8px/2px padding,
`rounded-4xl` = `--radius-4xl` = 26px (fully pill at this height), icon
`[&>svg]:size-3!` = 12px (forced, overriding the shared 16px default).
Type role: `type-caption` (12px/375/1.35).

| variant       | background token                          | text token                              | border token                               | hover state                                                               |
| ------------- | ----------------------------------------- | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `default`*    | `bg-primary` (`#007aff` hex, globals.css) | `text-primary-foreground` (`#fff`)      | `border-transparent`                       | `[a]:hover:bg-primary/80` (only when rendered as `<a>`)                   |
| `secondary`   | `bg-secondary` (0.97 0 0)                 | `text-secondary-foreground` (0.205 0 0) | `border-transparent`                       | `[a]:hover:bg-secondary/80`                                               |
| `success`     | `bg-success-subtle` (0.96 0.03 150)       | `text-success` (0.44 0.14 150)          | `border-success-border` (0.72 0.1 150)     | `[a]:hover:bg-success-subtle/70`; `focus-visible:ring-success/20`         |
| `warning`     | `bg-warning-subtle` (0.97 0.035 85)       | `text-warning` (0.47 0.12 75)           | `border-warning-border` (0.77 0.11 75)     | `[a]:hover:bg-warning-subtle/70`; `focus-visible:ring-warning/20`         |
| `information` | `bg-information-subtle` (0.96 0.025 250)  | `text-information` (0.48 0.14 250)      | `border-information-border` (0.72 0.1 250) | `[a]:hover:bg-information-subtle/70`; `focus-visible:ring-information/20` |
| `destructive` | `bg-destructive-subtle` (10%)             | `text-destructive` (0.53 0.245 27.325)  | `border-destructive-border` (32%)          | `[a]:hover:bg-destructive-subtle/70`; `focus-visible:ring-destructive/20` |
| `outline`     | transparent (no `bg-*` class)             | `text-foreground` (0.145 0 0)           | `border-border` (0.922 0 0)                | `[a]:hover:bg-muted [a]:hover:text-muted-foreground`                      |
| `ghost`       | transparent                               | inherits                                | `border-transparent`                       | `hover:bg-muted hover:text-muted-foreground`                              |
| `link`        | transparent                               | `text-primary` (`#007aff`)              | `border-transparent`                       | `hover:underline`                                                         |

Focus state (all variants): `focus-visible:border-ring focus-visible:ring-[3px]
focus-visible:ring-ring/50` — an arbitrary `3px` ring width, not one of the
motion/radius tokens (not otherwise documented as a token in DESIGN_SYSTEM.md).
`aria-invalid` state: `border-destructive`, `ring-destructive/20` (`/40` in
dark, unreachable per section 7).

---

### ButtonGroup (`button-group.tsx`)

`data-slot`: `button-group` (root, `data-orientation` also set),
`button-group-text`, `button-group-separator` (delegates to `Separator` with
`variant="button-group"`).

Type role on root: `type-label` (14px/450/1.35).

| orientation   | layout     | radius behavior                                                                                                                                       |
| ------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horizontal`* | `flex` row | children `rounded-r-none`; last child gets `rounded-r-lg!` (10px, forced); adjacent children lose left border (`border-l-0`) and get `rounded-l-none` |
| `vertical`    | `flex-col` | children `rounded-b-none`; last child `rounded-b-lg!` (10px, forced); adjacent children `border-t-0`, `rounded-t-none`                                |

`ButtonGroupText`: `rounded-lg` (10px), `border` (defaults to `border-border`),
`bg-muted` (0.97 0 0), `px-2.5` (10px), gap `gap-2` (8px), type role
`type-label`, icon default 16px (`[&_svg:not([class*='size-'])]:size-4`).

`ButtonGroupSeparator`: wraps `Separator` `variant="button-group"` — see
Separator section; defaults `orientation="vertical"` here.

No documented background/height of its own on the group root (it is a layout
wrapper); no shadow; no explicit hover/active/disabled states beyond what
children (Button, Select) supply.

---

### Button (`button.tsx`)

`data-slot`: `button` (also sets `data-size`, `data-variant`). Base: `@base-ui/react/button`.

Shared base classes: `rounded-lg` (10px), `border` (color set per variant),
transition-all, `active:not-aria-[haspopup]:translate-y-px` (1px press-down,
per motion.css convention — "Buttons move down 1px on press"), disabled
`opacity-50` + `pointer-events-none`, `focus-visible:border-ring
focus-visible:ring-3 focus-visible:ring-ring/50`, `aria-invalid:border-destructive
aria-invalid:ring-3 aria-invalid:ring-destructive/20`. Icon default 16px unless
size overrides.

**Sizes** (`data-size`):

| size          | height/dims px     | padding px                                  | radius override                                                                                                                                                                                   | type role                                                              | icon size                                                    |
| ------------- | ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `default`*    | `h-8` = 32px       | `px-2.5` = 10px, gap `gap-1.5`=6px          | inherits `rounded-lg` (10px)                                                                                                                                                                      | `type-label` (14/450/1.35)                                             | 16px (default)                                               |
| `xs`          | `h-6` = 24px       | `px-2` = 8px, gap `gap-1`=4px               | `rounded-[min(var(--radius-md),10px)]` = min(8.75px, 10px) = **8.75px**; but `in-data-[slot=button-group]:rounded-lg` when inside a ButtonGroup (10px)                                            | `type-caption` (12/375/1.35)                                           | `size-3` = 12px                                              |
| `sm`          | `h-7` = 28px       | `px-2.5` = 10px, gap `gap-1`=4px            | `rounded-[min(var(--radius-md),12px)]` = min(8.75px,12px) = **8.75px**; ButtonGroup context → `rounded-lg` (10px)                                                                                 | `type-caption` (12/375/1.35)                                           | `size-3.5` = 14px                                            |
| `lg`          | `h-9` = 36px       | `px-2.5` = 10px, gap `gap-1.5`=6px          | `rounded-lg` (10px)                                                                                                                                                                               | `type-label` (14/450/1.35)                                             | 16px (default)                                               |
| `icon`        | `size-8` = 32x32px | —                                           | `rounded-lg` (10px)                                                                                                                                                                               | `type-label` (class present but no visible text)                       | 16px (default)                                               |
| `icon-xs`     | `size-6` = 24x24px | —                                           | `rounded-[min(var(--radius-md),10px)]` = 8.75px; ButtonGroup → `rounded-lg`                                                                                                                       | `type-label`                                                           | `size-3` = 12px                                              |
| `icon-sm`     | `size-7` = 28x28px | —                                           | `rounded-[min(var(--radius-md),12px)]` = 8.75px; ButtonGroup → `rounded-lg`                                                                                                                       | `type-label`                                                           | 16px (default; no icon-size override in this size's classes) |
| `icon-lg`     | `size-9` = 36x36px | —                                           | `rounded-lg` (10px)                                                                                                                                                                               | `type-label`                                                           | 16px (default)                                               |
| `none`        | `size-auto`        | `p-0`                                       | `rounded-none` (0px)                                                                                                                                                                              | `type-label`                                                           | 16px (default)                                               |
| `surface`     | `h-auto w-full`    | `p-4` = 16px, gap `gap-3`=12px              | `rounded-xl` = `--radius-xl` = 15px                                                                                                                                                               | `type-supporting-body` (14/375/1.5), left-aligned, `whitespace-normal` | 16px (default)                                               |
| `motion-box`  | `h-7` = 28px       | `px-0`, gap `gap-1`=4px                     | `rounded-md` (bare Tailwind class — **not one of the documented `radius-*` tokens**; Tailwind's default `rounded-md` ≈ 6px, but this is not confirmed against a token override in foundation.css) | `type-label`                                                           | 16px (default)                                               |
| `motion-line` | `h-7` = 28px       | `px-0 pt-0 pb-2` = 0/0/8px, gap `gap-1`=4px | `rounded-none` (0px)                                                                                                                                                                              | `type-label`                                                           | 16px (default)                                               |

Note per DESIGN_SYSTEM.md: "Small buttons cap the radius with
`min(var(--radius-md), 10px)`" — confirmed literally in `xs`/`sm`/`icon-xs`/`icon-sm` classes (with slightly different caps of 10px vs 12px between them, both resolving to the actual `--radius-md` value of 8.75px since 8.75 < 10 and 8.75 < 12).

**Variants** (`data-variant`), background/text/border tokens:

| variant       | background                    | text                                                                             | border                            | hover                                                                                                                                                                                 | active/pressed                                                                           | destructive-style states                                                                                                       |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `default`*    | `bg-primary` (`#007aff`)      | `text-primary-foreground` (`#fff`)                                               | `border-transparent`              | `hover:bg-primary/80`                                                                                                                                                                 | shared 1px translate-y (all variants except `plain`)                                     | —                                                                                                                              |
| `outline`     | `bg-background` (1 0 0)       | inherits, `hover:text-foreground`                                                | `border-border` (0.922 0 0)       | `hover:bg-muted hover:text-foreground`; `aria-expanded:bg-muted aria-expanded:text-foreground`                                                                                        | shared                                                                                   | dark: `dark:border-input dark:bg-input/30 dark:hover:bg-input/50` (unreachable, dark mode off)                                 |
| `secondary`   | `bg-secondary` (0.97 0 0)     | `text-secondary-foreground` (0.205 0 0)                                          | `border-transparent`              | `hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]` (arbitrary color-mix, not a named token); `aria-expanded:bg-secondary aria-expanded:text-secondary-foreground` | shared                                                                                   | —                                                                                                                              |
| `subtle`      | `bg-secondary` (0.97 0 0)     | `text-muted-foreground` (0.556 0 0)                                              | `border-transparent`              | same color-mix hover, `hover:text-foreground`; `aria-expanded:bg-secondary aria-expanded:text-foreground`                                                                             | shared                                                                                   | —                                                                                                                              |
| `ghost`       | transparent                   | `hover:text-foreground`                                                          | `border-transparent`              | `hover:bg-muted hover:text-foreground`; `aria-expanded:bg-muted aria-expanded:text-foreground`                                                                                        | shared                                                                                   | —                                                                                                                              |
| `quiet`       | `bg-transparent`              | `text-muted-foreground`, `hover:text-foreground`                                 | `border-transparent`              | `hover:bg-transparent` (i.e. no bg change), `aria-expanded:bg-transparent aria-expanded:text-foreground`                                                                              | shared                                                                                   | —                                                                                                                              |
| `plain`       | `bg-transparent`              | inherits                                                                         | `border-transparent`              | `hover:bg-transparent`; `aria-expanded:bg-transparent`                                                                                                                                | **no** press translate (`active:not-aria-[haspopup]:translate-y-0` overrides shared 1px) | —                                                                                                                              |
| `surface`     | `bg-card` (1 0 0)             | `text-card-foreground` (0.145 0 0)                                               | `border-border` (0.922 0 0)       | `hover:bg-muted/50`; `aria-expanded:bg-muted/50`                                                                                                                                      | `active:not-aria-[haspopup]:translate-y-0` (no press translate)                          | shadow: `shadow-sm` (Tailwind default small shadow — not one of the named tokens; DESIGN_SYSTEM.md documents no shadow tokens) |
| `destructive` | `bg-destructive-subtle` (10%) | `text-destructive` (0.53 0.245 27.325)                                           | `border-destructive-border` (32%) | `hover:bg-destructive-subtle/70`; `focus-visible:border-destructive-border focus-visible:ring-destructive/20`                                                                         | shared                                                                                   | dark focus: `dark:focus-visible:ring-destructive/40` (unreachable)                                                             |
| `link`        | transparent                   | `text-primary` (`#007aff`), `hover:underline`                                    | `border-transparent`              | underline on hover, `underline-offset-4`                                                                                                                                              | shared                                                                                   | —                                                                                                                              |
| `motion`      | `bg-transparent`              | `text-muted-foreground`, `hover:text-foreground`, `aria-pressed:text-foreground` | `border-transparent`              | `hover:bg-transparent`                                                                                                                                                                | shared                                                                                   | —                                                                                                                              |

Reduced-motion: `motion-reduce:transition-none motion-reduce:active:translate-y-0`
(per motion.css: "skip this under reduced motion").

---

### Card (`card.tsx`)

`data-slot`: `card` (also `data-size`), `card-header`, `card-title`,
`card-description`, `card-action`, `card-content`, `card-footer`. Base: plain
`div`.

| size       | spacing var `--card-spacing`                              | radius                              | background        | text                               | border/ring                                                                                                                |
| ---------- | --------------------------------------------------------- | ----------------------------------- | ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `default`* | `--spacing(4)` = 16px (gap and vertical padding use this) | `rounded-xl` = `--radius-xl` = 15px | `bg-card` (1 0 0) | `text-card-foreground` (0.145 0 0) | `ring-1 ring-foreground/10` (no separate `border` class — DESIGN_SYSTEM.md notes: "Border is `ring-1 ring-foreground/10`") |
| `sm`       | `--spacing(3)` = 12px                                     | same 15px                           | same              | same                               | same                                                                                                                       |

Type role: card body text `type-supporting-body` (14/375/1.5); `CardTitle`:
`type-card-title` (16px/450/1.35) — downgraded to `type-label` (14/450/1.35)
when `data-size=sm` via `group-data-[size=sm]/card:type-label`.
`CardDescription`: `type-supporting-body text-muted-foreground` (0.556 0 0).

`CardHeader`: `px-(--card-spacing)`, `rounded-t-xl` (15px), grid layout.
`CardContent`: `px-(--card-spacing)`.
`CardFooter`: `p-(--card-spacing)`, `rounded-b-xl` (15px), `border-t`
(defaults `border-border`), `bg-muted/50` (0.97 0 0 at 50%).

No documented hover/active/focus/disabled states (Card is non-interactive by
default). No `--card-spacing` px value beyond the two listed; both come from
Tailwind's `--spacing()` function times 4/3 (Tailwind default spacing unit is
0.25rem/4px, so `--spacing(4)`=16px, `--spacing(3)`=12px, per Tailwind v4
convention — this scale itself is not one of DESIGN_SYSTEM.md's named tokens,
noted in section 3.7: "no spacing tokens beyond the Tailwind default scale").

---

### Collapsible (`collapsible.tsx`)

`data-slot`: `collapsible`, `collapsible-trigger`, `collapsible-content`.
Base: `@base-ui/react/collapsible` (pass-through, per DESIGN_SYSTEM.md: "Pass-through").

No classes are applied by this file at all — it is a thin wrapper adding only
`data-slot`. No height/padding/radius/background/type/shadow/icon/state values
are defined here; all styling is left to callsites. Cannot resolve any visual
token because none exists in the source.

---

### Command (`command.tsx`)

`data-slot`: `command`, `command-input-wrapper`, `command-input`,
`command-list`, `command-empty`, `command-group`, `command-separator`,
`command-item`, `command-shortcut`. Base: `cmdk` library (not base-ui), wraps
`Dialog` variant `command` and `InputGroup` variant `command`.

| Part                   | height/padding px       | radius                                                                                                               | background                                    | text                                                                        | type role                                                                                                                 |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Command` (root)       | `p-1` = 4px             | `rounded-xl!` = 15px (forced)                                                                                        | `bg-popover` (1 0 0)                          | `text-popover-foreground` (0.145 0 0)                                       | —                                                                                                                         |
| `CommandInput` wrapper | `p-1 pb-0` = 4px/0      | —                                                                                                                    | —                                             | —                                                                           | via `InputGroup variant="command"`: `h-8` (32px, `InputGroup` default size), `bg-input/30` (dark only), `border-input/30` |
| `CommandInput` field   | —                       | —                                                                                                                    | —                                             | —                                                                           | `type-input` (16px, or 14px ≥48rem, per DESIGN_SYSTEM.md 3.2)                                                             |
| `CommandList`          | `max-h-72` = 288px max  | —                                                                                                                    | —                                             | —                                                                           | —                                                                                                                         |
| `CommandEmpty`         | `py-6` = 24px           | —                                                                                                                    | —                                             | —                                                                           | `type-supporting-body` (14/375/1.5), centered                                                                             |
| `CommandGroup`         | `p-1` = 4px             | —                                                                                                                    | —                                             | `text-foreground`                                                           | group heading: `type-caption` (12/375/1.35), `text-muted-foreground`, `px-2 py-1.5` (8px/6px)                             |
| `CommandSeparator`     | `h-px` = 1px            | —                                                                                                                    | `bg-border` (0.922 0 0)                       | —                                                                           | —                                                                                                                         |
| `CommandItem`          | `px-2 py-1.5` = 8px/6px | `rounded-sm` (bare Tailwind, not a documented `radius-*` token); inside Dialog content: `rounded-lg!` (10px, forced) | selected: `data-selected:bg-muted` (0.97 0 0) | `data-selected:text-foreground`                                             | `type-label` (14/450/1.35)                                                                                                |
| `CommandShortcut`      | —                       | —                                                                                                                    | —                                             | `text-muted-foreground`, `group-data-selected/command-item:text-foreground` | `type-compact-code` (12/375/1.35, Mono)                                                                                   |

Icon: search icon `size-4` (16px) at `opacity-50`; item check icon default
16px (`[&_svg:not([class*='size-'])]:size-4`).

Disabled state: `CommandItem` `data-[disabled=true]:pointer-events-none
data-[disabled=true]:opacity-50`.

---

### Dialog (`dialog.tsx`)

`data-slot`: `dialog`, `dialog-trigger`, `dialog-portal`, `dialog-close`,
`dialog-overlay`, `dialog-content`, `dialog-header`, `dialog-footer`,
`dialog-title`, `dialog-description`. Base: `@base-ui/react/dialog`.

`DialogOverlay`: `bg-foreground/10` (0.145 0 0 at 10%), `z-50`,
`supports-backdrop-filter:backdrop-blur-xs`, `duration-100` (not one of the
named motion durations — motion.css defines `--duration-fast`=140ms,
`--duration-instant`=80ms; 100ms is a raw Tailwind duration utility, not a
`--duration-*` token; **cannot resolve to a documented motion token**).

`DialogContent` variants:

| variant      | position                                            | radius                                   | max-width                          | padding                                                 |
| ------------ | --------------------------------------------------- | ---------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `default`*   | centered (`top-1/2 left-1/2`, translated -50%/-50%) | `rounded-xl` = 15px                      | `sm:max-w-sm` (24rem/384px)        | `p-4` = 16px                                            |
| `command`    | `top-1/3`, no translate-y                           | `rounded-xl!` (forced)                   | inherits `max-w-[calc(100%-2rem)]` | `p-0` (overrides default `p-4`)                         |
| `responsive` | bottom sheet under `sm`, centered `sm:` and up      | `rounded-b-none`; `sm:rounded-xl` (15px) | `sm:max-w-2xl` (42rem/672px)       | `pb-[max(1rem,env(safe-area-inset-bottom))]`; `sm:pb-4` |

Background: `bg-popover` (1 0 0); text: `text-popover-foreground` (0.145 0 0);
border: `ring-1 ring-foreground/10` (no separate border class). Type role:
`type-supporting-body` on content root (14/375/1.5).

`DialogTitle`: `type-card-title` (16/450/1.35). `DialogDescription`:
`type-supporting-body text-muted-foreground` (14/375/1.5, 0.556 0 0).

`DialogFooter`: `-mx-4 -mb-4 p-4` (16px), `rounded-b-xl` (15px), `border-t`
(defaults `border-border`), `bg-muted/50` (0.97 0 0 at 50%).

Close button: rendered as `Button variant="ghost" size="icon-sm"` — see Button
section for `icon-sm` (28x28px). In `responsive` variant, close button is
overridden to `size-10` (40px) below `sm`, `sm:size-7` (28px) above.

Animation: `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95` —
these are Tailwind-animate utility classes, not the named `--duration-*` /
`--ease-*` tokens from motion.css; `duration-100` (100ms) is likewise not a
documented `--duration-*` token value (documented values are 80/140/220/360ms).

---

### DropdownMenu (`dropdown-menu.tsx`)

`data-slot`: `dropdown-menu`, `dropdown-menu-portal`, `dropdown-menu-trigger`,
`dropdown-menu-content`, `dropdown-menu-group`, `dropdown-menu-label`,
`dropdown-menu-item`, `dropdown-menu-sub`, `dropdown-menu-sub-trigger`,
`dropdown-menu-sub-content`, `dropdown-menu-checkbox-item`,
`dropdown-menu-radio-group`, `dropdown-menu-radio-item`,
`dropdown-menu-separator`, `dropdown-menu-shortcut`. Base: `@base-ui/react/menu`.

`DropdownMenuContent`: `p-1` = 4px, `rounded-lg` = 10px, `min-w-32` = 128px,
`bg-popover` (1 0 0), `text-popover-foreground` (0.145 0 0),
`shadow-md` (Tailwind default, not a named token), `ring-1 ring-foreground/10`,
`duration-100` (not a documented motion token).

| item type                  | variant       | padding px                        | radius                                               | text color                                                               | type role                         |
| -------------------------- | ------------- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| `DropdownMenuLabel`        | —             | `px-1.5 py-1` = 6px/4px           | —                                                    | `text-muted-foreground` (0.556 0 0)                                      | `type-caption` (12/375/1.35)      |
| `DropdownMenuItem`         | `default`*    | `px-1.5 py-1` = 6px/4px           | `rounded-md` (bare Tailwind, not a `radius-*` token) | `focus:bg-accent focus:text-accent-foreground` (0.97 0 0 / 0.205 0 0)    | `type-label` (14/450/1.35)        |
| `DropdownMenuItem`         | `destructive` | same                              | same                                                 | `text-destructive`, `focus:bg-destructive-subtle focus:text-destructive` | same                              |
| `DropdownMenuSubTrigger`   | —             | `px-1.5 py-1`                     | `rounded-md` (bare Tailwind)                         | `focus:bg-accent`, `data-popup-open:bg-accent data-open:bg-accent`       | `type-label`                      |
| `DropdownMenuCheckboxItem` | —             | `py-1 pr-8 pl-1.5` = 4px/32px/6px | `rounded-md` (bare Tailwind)                         | `focus:bg-accent focus:text-accent-foreground`                           | `type-label`                      |
| `DropdownMenuRadioItem`    | —             | `py-1 pr-8 pl-1.5`                | `rounded-md` (bare Tailwind)                         | same                                                                     | `type-label`                      |
| `DropdownMenuSubContent`   | —             | `p-1` = 4px                       | `rounded-lg` = 10px                                  | `bg-popover`, `shadow-lg` (Tailwind default, not a named token)          | —                                 |
| `DropdownMenuSeparator`    | —             | `-mx-1 my-1`                      | —                                                    | `bg-border` (0.922 0 0), `h-px`                                          | —                                 |
| `DropdownMenuShortcut`     | —             | —                                 | —                                                    | `text-muted-foreground`, `group-focus:text-accent-foreground`            | `type-compact-code` (12/375/1.35) |

`inset` prop adds `pl-7` (28px) on Label/Item/SubTrigger.
Disabled: `data-disabled:pointer-events-none data-disabled:opacity-50`.
Icon default 16px (`[&_svg:not([class*='size-'])]:size-4`).

---

### Field (`field.tsx`)

`data-slot`: `field-set`, `field-legend`, `field-group`, `field`,
`field-content`, `field-label`, `field-description`, `field-separator`,
`field-separator-content`, `field-error`. Base: plain `fieldset`.

| Part               | gap/padding px                         | orientation behavior                                                                                                    | type role                                                             |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `FieldSet`         | `gap-4` = 16px                         | —                                                                                                                       | —                                                                     |
| `FieldGroup`       | `gap-5` = 20px                         | —                                                                                                                       | —                                                                     |
| `FieldLegend`      | `mb-1.5` = 6px                         | `variant="legend"`* → `type-card-title` (16/450/1.35); `variant="label"` → `type-label` (14/450/1.35)                   | as above                                                              |
| `Field`            | `gap-2` = 8px                          | `vertical`* (`flex-col`); `horizontal` (`flex-row items-center`); `responsive` (`flex-col`, `@md/field-group:flex-row`) | invalid state: `data-[invalid=true]:text-destructive`                 |
| `FieldContent`     | `gap-0.5` = 2px                        | —                                                                                                                       | —                                                                     |
| `FieldLabel`       | delegates to `Label` `variant="field"` | —                                                                                                                       | `type-label` (via Label)                                              |
| `FieldTitle`       | `gap-2` = 8px                          | —                                                                                                                       | `type-label`, disabled: `group-data-[disabled=true]/field:opacity-50` |
| `FieldDescription` | —                                      | —                                                                                                                       | `type-supporting-body text-muted-foreground` (14/375/1.5)             |
| `FieldSeparator`   | `-my-2 h-5`                            | wraps `Separator` (see Separator section)                                                                               | `type-supporting-body`                                                |
| `FieldError`       | —                                      | `role="alert"`                                                                                                          | `type-supporting-body text-destructive` (14/375/1.5)                  |

`FieldLabel` with `variant="field"` (checkbox-card style, from `label.tsx`):
`has-data-checked:border-primary/30 has-data-checked:bg-primary/5`,
`has-[>[data-slot=field]]:rounded-lg` (10px), `has-[>[data-slot=field]]:border`.

No documented shadow. No fixed height (fieldset is content-sized). Disabled
state comes through `group-data-[disabled=true]` on nested `FieldTitle`/`Label`.

---

### HoverCard (`hover-card.tsx`)

`data-slot`: `hover-card`, `hover-card-trigger`, `hover-card-portal`,
`hover-card-content`. Base: `@base-ui/react/preview-card`. Default `side="bottom"
sideOffset=4` (16px), `align="center" alignOffset=4` (16px), per
DESIGN_SYSTEM.md: "side `bottom`, align `center`".

| dimension  | value                                             |
| ---------- | ------------------------------------------------- |
| width      | `w-64` = 256px (fixed)                            |
| padding    | `p-2.5` = 10px                                    |
| radius     | `rounded-lg` = 10px                               |
| background | `bg-popover` (1 0 0)                              |
| text       | `text-popover-foreground` (0.145 0 0)             |
| border     | `ring-1 ring-foreground/10`                       |
| shadow     | `shadow-md` (Tailwind default, not a named token) |
| type role  | `type-supporting-body` (14/375/1.5)               |

Animation `duration-100` (not a documented `--duration-*` token).

---

### InputGroup (`input-group.tsx`)

`data-slot`: `input-group` (also `data-size`), `input-group-addon` (also
`data-align`), `input-group-control` (used by `InputGroupInput`/`InputGroupTextarea`),
no explicit slot on `InputGroupButton`/`InputGroupText` beyond inherited Button
slot. Base: plain `div` wrapping `Input`/`Textarea`/`Button`.

**Group sizes:**

| size       | height px     | radius              | border                     |
| ---------- | ------------- | ------------------- | -------------------------- |
| `default`* | `h-8` = 32px  | `rounded-lg` = 10px | `border-input` (0.922 0 0) |
| `lg`       | `h-10` = 40px | same                | same                       |
| `xl`       | `h-12` = 48px | same                | same                       |

**Group variant `command`:** `rounded-lg!` (forced 10px), `border-input/30`,
`bg-input/30`, `shadow-none!`.

Focus state: `has-[[data-slot=input-group-control]:focus-visible]:border-ring
has-[...]:ring-3 has-[...]:ring-ring/50`. Invalid state:
`has-[[data-slot][aria-invalid=true]]:border-destructive ...:ring-3 ...:ring-destructive/20`.
Disabled: `has-disabled:bg-input/50 has-disabled:opacity-50`.

`InputGroupAddon` (type role `type-label`, 14/450/1.35): `py-1.5` = 6px,
`gap-2` = 8px, `text-muted-foreground` (0.556 0 0); icon
`[&>svg:not([class*='size-'])]:size-4` = 16px.

| align           | padding/offset           |
| --------------- | ------------------------ |
| `inline-start`* | `pl-2` = 8px             |
| `inline-end`    | `pr-2` = 8px             |
| `block-start`   | `px-2.5 pt-2` = 10px/8px |
| `block-end`     | `px-2.5 pb-2` = 10px/8px |

`InputGroupButton` (wraps `Button`, default `variant="ghost" size="xs"`):

| size      | height/dims px                    | padding/radius                                                                                          |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `xs`*     | `h-6` = 24px (Button default)     | `px-1.5` = 6px, `rounded-[calc(var(--radius)-3px)]` = 10px-3px = **7px**; icon `size-3.5` = 14px        |
| `sm`      | inherits Button `sm` (`h-7`=28px) | no InputGroup-specific override class beyond empty string                                               |
| `icon-xs` | `size-6` = 24x24px                | `rounded-[calc(var(--radius)-3px)]` = 7px; group-size-lg → `size-8`=32px; group-size-xl → `size-9`=36px |
| `icon-sm` | `size-8` = 32x32px                | `p-0`; group-size-xl → `size-9`=36px                                                                    |

Also: `group-data-[size=lg]/input-group:h-8` (32px) and
`group-data-[size=xl]/input-group:h-9` (36px) apply to all `InputGroupButton`
sizes when the parent group is `lg`/`xl`.

`InputGroupText`: `gap-2` = 8px, `text-muted-foreground`, type role
`type-supporting-body` (14/375/1.5); icon 16px default.

`InputGroupInput`/`InputGroupTextarea`: delegate to `Input`/`Textarea` with
`variant="input-group"` — see those sections; `h-full` added on the input.

---

### Input (`input.tsx`)

`data-slot`: `input` (also `data-size`). Base: `@base-ui/react/input`.

Base classes: `h-8` = 32px, `px-2.5 py-1` = 10px/4px, `rounded-lg` = 10px,
`border border-input` (0.922 0 0), `bg-transparent`. Type role: `type-input`
(16px, or 14px at width ≥48rem, per DESIGN_SYSTEM.md 3.2).

| size       | height px     | padding px               |
| ---------- | ------------- | ------------------------ |
| `default`* | `h-8` = 32px  | inherits `px-2.5` = 10px |
| `lg`       | `h-10` = 40px | `px-3` = 12px            |
| `xl`       | `h-12` = 48px | `px-3.5` = 14px          |

| variant       | notes                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `default`*    | as above                                                                                                      |
| `plain`       | `h-auto`, `rounded-none` (0px), `border-0`, `p-0`, `shadow-none`, `ring-0`, no focus ring                     |
| `currency`    | `h-fit`, `rounded-none` (0px), `border-0`, `p-0`, `shadow-none`, `ring-0`, no focus ring                      |
| `input-group` | `flex-1`, `rounded-none` (0px), `border-0`, `shadow-none`, `ring-0`, no focus ring (used inside `InputGroup`) |

States: `placeholder:text-muted-foreground` (0.556 0 0);
`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`;
`disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50
disabled:opacity-50`; `aria-invalid:border-destructive aria-invalid:ring-3
aria-invalid:ring-destructive/20`. File input styling:
`file:h-6 file:border-0 file:bg-transparent file:type-label file:text-foreground`
(24px height for the file-picker button text row).

---

### Label (`label.tsx`)

`data-slot`: `label`. Base: plain `label`.

Base: `gap-2` = 8px, `select-none`. Type role: `type-label` (14/450/1.35).

| variant    | notes                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`* | no extra styling                                                                                                                                                                                                                                |
| `field`    | checkbox-card look: `w-fit`, `has-data-checked:border-primary/30 has-data-checked:bg-primary/5` (`#007aff` at low opacity); `has-[>[data-slot=field]]:rounded-lg` (10px), `has-[>[data-slot=field]]:border`, `*:data-[slot=field]:p-2.5` (10px) |

Disabled: `group-data-[disabled=true]:opacity-50` (via ancestor group),
`peer-disabled:cursor-not-allowed peer-disabled:opacity-50` (via sibling peer).

No height/radius/background/border of its own outside the `field` variant's
card look; no icon or shadow.

---

### Logo (`logo.tsx`)

`data-slot`: `logo`. Base: plain `svg`.

Fixed size: `size-5` = 20px (documented in DESIGN_SYSTEM.md section 4 as
`size-5`, though the type table earlier attributes `size-5` — confirmed
literally as `className="size-5 shrink-0"` in the file, i.e. 20x20px).

Themed via CSS custom properties, not Tailwind tokens:
`--logo-face-left-opacity: 0.82`, `--logo-face-right-opacity: 0.64`,
`--logo-outline: var(--foreground)` (0.145 0 0). Fill color for the three
face polygons: `var(--primary)` (`#007aff`). No background, padding, border,
type role (it is pure SVG geometry), or state values — non-interactive.

---

### Select (`select.tsx`)

`data-slot`: `select-group`, `select-value`, `select-trigger` (also
`data-size`, `data-variant`), `select-content` (also `data-align-trigger`),
`select-label`, `select-item`, `select-separator`, `select-scroll-up-button`,
`select-scroll-down-button`. Base: `@base-ui/react/select`.

**Trigger sizes:**

| size       | height px    | padding px                        | radius                                                                 |
| ---------- | ------------ | --------------------------------- | ---------------------------------------------------------------------- |
| `default`* | `h-8` = 32px | `py-2 pr-2 pl-2.5` = 8px/8px/10px | `rounded-lg` = 10px                                                    |
| `sm`       | `h-7` = 28px | same                              | `rounded-[min(var(--radius-md),10px)]` = min(8.75px,10px) = **8.75px** |

**Trigger variants:**

| variant    | border                     | background       | hover                                |
| ---------- | -------------------------- | ---------------- | ------------------------------------ |
| `default`* | `border-input` (0.922 0 0) | `bg-transparent` | `dark:hover:bg-input/50` (dark only) |
| `ghost`    | `border-transparent`       | `bg-transparent` | `hover:bg-muted` (0.97 0 0)          |

Type role: `type-label` (14/450/1.35). Placeholder: `data-placeholder:text-muted-foreground`.
Icon (chevron down): `size-4` = 16px, `text-muted-foreground`.
Focus: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`.
Invalid: `aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20`.
Disabled: `disabled:cursor-not-allowed disabled:opacity-50`.

`SelectContent`: `min-w-36` = 144px, `rounded-lg` = 10px, `bg-popover`
(1 0 0), `text-popover-foreground` (0.145 0 0), `shadow-md` (Tailwind default,
not a named token), `ring-1 ring-foreground/10`, `duration-100` (not a
documented motion token).

`SelectLabel`: `px-1.5 py-1` = 6px/4px, `type-caption` (12/375/1.35),
`text-muted-foreground`.

`SelectItem`: `py-1 pr-8 pl-1.5` = 4px/32px/6px, `rounded-md` (bare Tailwind,
not a `radius-*` token), `type-label` (14/450/1.35); focus:
`focus:bg-accent focus:text-accent-foreground` (0.97 0 0/0.205 0 0); disabled:
`data-disabled:pointer-events-none data-disabled:opacity-50`; check icon
default 16px.

`SelectSeparator`: `h-px`, `bg-border` (0.922 0 0), `-mx-1 my-1`.

`SelectScrollUpButton`/`SelectScrollDownButton`: `py-1` = 4px, `bg-popover`.

---

### Separator (`separator.tsx`)

`data-slot`: `separator`. Base: `@base-ui/react/separator`.

| variant        | horizontal                  | vertical                        | background                                                                        |
| -------------- | --------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `default`*     | `h-px w-full` (1px thick)   | `w-px self-stretch` (1px thick) | `bg-border` (0.922 0 0)                                                           |
| `button-group` | `mx-px w-auto` (1px margin) | `my-px h-auto` (1px margin)     | `bg-input` (0.922 0 0 — same numeric value as `border`, different semantic token) |

Orientation default: `horizontal`* (per DESIGN_SYSTEM.md). No padding,
radius, type role, or shadow (it is a 1px rule).

---

### Sheet (`sheet.tsx`)

`data-slot`: `sheet`, `sheet-trigger`, `sheet-close`, `sheet-portal`,
`sheet-overlay`, `sheet-content` (also `data-side`), `sheet-header`,
`sheet-footer`, `sheet-title`, `sheet-description`. Base: `@base-ui/react/dialog`
(aliased as `SheetPrimitive`), built on Dialog per DESIGN_SYSTEM.md.

`SheetOverlay`: `bg-foreground/10` (0.145 0 0 at 10%), `duration-150` (not a
documented motion token — closest is `--duration-fast`=140ms, but this is a
raw Tailwind `duration-150` utility, not the CSS variable).

| side     | position             | width/height                                | border                                |
| -------- | -------------------- | ------------------------------------------- | ------------------------------------- |
| `right`* | `inset-y-0 right-0`  | `h-full w-3/4`, `sm:max-w-sm` (24rem/384px) | `border-l` (defaults `border-border`) |
| `left`   | `inset-y-0 left-0`   | `h-full w-3/4`, `sm:max-w-sm` (24rem/384px) | `border-r`                            |
| `top`    | `inset-x-0 top-0`    | `h-auto`                                    | `border-b`                            |
| `bottom` | `inset-x-0 bottom-0` | `h-auto`                                    | `border-t`                            |

Background: `bg-popover` (1 0 0), text: `text-popover-foreground` (0.145 0 0),
shadow: `shadow-lg` (Tailwind default, not a named token). Type role:
`type-supporting-body` (14/375/1.5) on content root.

`SheetHeader`: `gap-0.5 p-4` = 2px/16px. `SheetFooter`: `gap-2 p-4` = 8px/16px.
`SheetTitle`: `type-card-title text-foreground` (16/450/1.35, 0.145 0 0).
`SheetDescription`: `type-supporting-body text-muted-foreground` (14/375/1.5).

Close button: `Button variant="ghost" size="icon-sm"` at `top-3 right-3`
(12px offset) — see Button section for `icon-sm` (28x28px).

Transition duration `duration-200` on the content transform (not a documented
`--duration-*` token; closest documented value is `--duration-normal`=220ms).
No radius classes anywhere in this file (sheet panels are edge-to-edge,
unrounded).

---

### Sidebar (`sidebar.tsx`)

`data-slot` values (extensive): `sidebar-wrapper`, `sidebar`, `sidebar-gap`,
`sidebar-container`, `sidebar-inner`, `sidebar-trigger`, `sidebar-rail`,
`sidebar-inset`, `sidebar-input`, `sidebar-header`, `sidebar-footer`,
`sidebar-separator`, `sidebar-content`, `sidebar-group`,
`sidebar-group-label`, `sidebar-group-action`, `sidebar-group-content`,
`sidebar-menu`, `sidebar-menu-item`, `sidebar-menu-button`,
`sidebar-menu-action`, `sidebar-menu-badge`, `sidebar-menu-skeleton`,
`sidebar-menu-sub`, `sidebar-menu-sub-item`, `sidebar-menu-sub-button`.
Base: `useRender` (Button/GroupLabel/GroupAction/MenuButton/MenuAction/
MenuSubButton are polymorphic via `useRender`+`mergeProps`); other parts are
plain `div`/`ul`/`li`/`button`/`main`.

Widths: `SIDEBAR_WIDTH` = `12rem` = 192px; `SIDEBAR_WIDTH_MOBILE` = `18rem` =
288px; `SIDEBAR_WIDTH_ICON` = `3rem` = 48px. Keyboard shortcut: Cmd/Ctrl+B.
State cookie `sidebar_state`, 7-day max-age.

Background: `bg-sidebar` (0.985 0 0), text: `text-sidebar-foreground`
(0.145 0 0). Floating variant adds `rounded-lg` (10px), `shadow-sm` (Tailwind
default), `ring-1 ring-sidebar-border`.

**`SidebarMenuButton` sizes** (`sidebarMenuButtonVariants`):

| size       | height px     | type size (raw Tailwind, NOT `type-*`)                                                                                                     |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `default`* | `h-8` = 32px  | `text-sm` (raw Tailwind class — flagged in DESIGN_SYSTEM.md section 8 item 4 as one of the files with raw text classes not using `type-*`) |
| `sm`       | `h-7` = 28px  | `text-xs` (raw Tailwind)                                                                                                                   |
| `lg`       | `h-12` = 48px | `text-sm` (raw Tailwind)                                                                                                                   |

| variant    | background              | hover                                                                                                                                                   | active                                                                                                                                                                     |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`* | transparent             | `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground` (0.97 0 0/0.205 0 0)                                                                     | `active:bg-sidebar-accent active:text-sidebar-accent-foreground`; `data-active:bg-sidebar-accent data-active:font-medium` (raw `font-medium`, not a `type-*` weight token) |
| `outline`  | `bg-background` (1 0 0) | same hover, plus `shadow-[0_0_0_1px_var(--sidebar-border)]` (arbitrary inset-shadow border, not a named shadow token) hover-swaps to `--sidebar-accent` | same                                                                                                                                                                       |

Padding: `p-2` = 8px. Radius: `rounded-md` (bare Tailwind, not a `radius-*`
token). Icon: `[&_svg]:size-4` = 16px forced regardless of explicit size
class (differs from the shared `:not([class*='size-'])` pattern used
elsewhere — here it is unconditional).

`SidebarGroupLabel`: `h-8` = 32px, `px-2` = 8px, `rounded-md` (bare Tailwind),
`text-xs font-medium` (raw Tailwind classes, not `type-*`/weight tokens) —
this file is one of the three DESIGN_SYSTEM.md section 8 item 4 flags (9
raw-class occurrences here).

`SidebarGroupAction`/`SidebarMenuAction`: `size-5` = 20px (aspect-square
width), `rounded-md` (bare Tailwind), positioned `top-3.5 right-3` /
`top-1.5 right-1` respectively (14px/12px, 6px/4px offsets).

`SidebarMenuBadge`: `h-5 min-w-5` = 20px, `px-1` = 4px, `rounded-md` (bare
Tailwind), `text-xs font-medium` (raw Tailwind, not `type-*`).

`SidebarMenuSkeleton`: `h-8` = 32px, `px-2` = 8px, `rounded-md` (bare
Tailwind), wraps `Skeleton` (icon `size-4`=16px if `showIcon`, text `h-4`=16px
at a random 50–90% width).

`SidebarMenuSubButton`: `h-7` = 28px, `px-2` = 8px, `rounded-md` (bare
Tailwind); `size="md"`* → `text-sm` (raw Tailwind); `size="sm"` → `text-xs`
(raw Tailwind); active: `data-active:bg-sidebar-accent
data-active:text-sidebar-accent-foreground`.

`SidebarRail`: `w-4` = 16px hit target, cursor changes per side/state, no
visible fill until `hover:after:bg-sidebar-border`.

`SidebarInset` (main content area): `md:peer-data-[variant=inset]:m-2` = 8px
margin, `md:...:rounded-xl` = 15px, `md:...:shadow-sm` (Tailwind default).

`SidebarInput`: delegates to `Input` component, `h-8` = 32px,
`bg-background`, `shadow-none`.

Disabled: `disabled:pointer-events-none disabled:opacity-50` /
`aria-disabled:pointer-events-none aria-disabled:opacity-50` on menu buttons.

---

### Skeleton (`skeleton.tsx`)

`data-slot`: `skeleton`. Base: plain `div`.

Only three classes: `animate-pulse`, `rounded-md` (bare Tailwind, not a
`radius-*` token), `bg-muted` (0.97 0 0). No height/padding/border/type/icon —
callsite supplies dimensions via `className`. No documented shadow.

---

### Spinner (`spinner.tsx`)

`data-slot`: `spinner`. Base: `lucide-react`'s `Loader2Icon` directly (not a
wrapped base-ui or plain element — it is the icon component itself).

Fixed size: `size-4` = 16px (per DESIGN_SYSTEM.md: "The default icon size is
`size-4`"). Animation: `animate-spin` (Tailwind default spin keyframe — not
tied to any of the named `--duration-*`/`--ease-*` motion tokens; motion.css
does not define an `animate-spin` override). No background, padding, radius,
border, or type role (it is a bare icon).

---

### Switch (`switch.tsx`)

`data-slot`: `switch` (also `data-size`), `switch-thumb`. Base:
`@base-ui/react/switch`.

| size       | track W×H px          | thumb size px   | thumb travel                                |
| ---------- | --------------------- | --------------- | ------------------------------------------- |
| `default`* | `w-[32px] h-[18.4px]` | `size-4` = 16px | `translate-x-[calc(100%-2px)]` when checked |
| `sm`       | `w-[24px] h-[14px]`   | `size-3` = 12px | `translate-x-[calc(100%-2px)]` when checked |

Radius: `rounded-full` (bare Tailwind, fully round — not one of the named
`radius-*` tokens, though functionally equivalent to a pill at any size).
Border: `border border-transparent`.

Background: checked `data-checked:bg-primary` (`#007aff`); unchecked
`data-unchecked:bg-input` (0.922 0 0). Thumb background: `bg-background`
(1 0 0). Focus: `focus-visible:border-ring focus-visible:ring-3
focus-visible:ring-ring/50`. Invalid: `aria-invalid:border-destructive
aria-invalid:ring-3 aria-invalid:ring-destructive/20`. Disabled:
`data-disabled:cursor-not-allowed data-disabled:opacity-50`. No type role
(non-textual control), no shadow, no icon.

---

### Table (`table.tsx`)

`data-slot`: `table-container`, `table`, `table-header`, `table-body`,
`table-footer`, `table-row`, `table-head`, `table-cell`, `table-caption`.
Base: plain `table` elements.

`Table` root: `type-supporting-body` (14/375/1.5), wrapped in an
`overflow-x-auto` container.

`TableHeader`: `[&_tr]:border-b` (row bottom borders, `border-border`
default).

`TableFooter`: `bg-muted/50` (0.97 0 0 at 50%), `type-label` (14/450/1.35),
`border-t`.

`TableRow`: `border-b` (defaults `border-border`); selected state:
`data-[state=selected]:bg-muted` (0.97 0 0); expanded-child hover:
`has-aria-expanded:bg-muted/50`.

`TableHead`: `h-10` = 40px, `px-2` = 8px, `type-label` (14/450/1.35),
`text-foreground` (0.145 0 0), `whitespace-nowrap`.

`TableCell` variants:

| variant    | text                                    | wrap                                |
| ---------- | --------------------------------------- | ----------------------------------- |
| `default`* | inherits                                | `whitespace-nowrap`                 |
| `code`     | `type-compact-code` (12/375/1.35, Mono) | `wrap-break-word whitespace-normal` |
| `empty`    | `text-muted-foreground` (0.556 0 0)     | `h-24` = 96px, centered             |

Base cell padding: `p-2` = 8px.

`TableCaption`: `mt-4` = 16px, `type-caption` (12/375/1.35),
`text-muted-foreground`.

No radius, no background of its own outside footer/row states, no shadow, no
icon.

---

### Textarea (`textarea.tsx`)

`data-slot`: `textarea`. Base: plain `textarea`.

Base classes: `min-h-16` = 64px minimum, `field-sizing-content` (grows with
content), `px-2.5 py-2` = 10px/8px, `rounded-lg` = 10px, `border
border-input` (0.922 0 0), `bg-transparent`. Type role: `type-input` (16px, or
14px at ≥48rem).

| variant       | notes                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `default`*    | as above                                                                                                                  |
| `input-group` | `flex-1 resize-none`, `rounded-none` (0px), `border-0`, `shadow-none`, `ring-0`, no focus ring (used inside `InputGroup`) |

States: `placeholder:text-muted-foreground`; `focus-visible:border-ring
focus-visible:ring-3 focus-visible:ring-ring/50`; `disabled:cursor-not-allowed
disabled:bg-input/50 disabled:opacity-50`; `aria-invalid:border-destructive
aria-invalid:ring-3 aria-invalid:ring-destructive/20`.

---

### Tooltip (`tooltip.tsx`)

`data-slot`: `tooltip-provider`, `tooltip`, `tooltip-trigger`,
`tooltip-content`. Base: `@base-ui/react/tooltip`. Provider `delay=0` (per
DESIGN_SYSTEM.md: "Provider delay 0"); default `side="top" sideOffset=4`
(16px), `align="center" alignOffset=0`.

| dimension  | value                                                                       |
| ---------- | --------------------------------------------------------------------------- |
| max-width  | `max-w-xs` = 20rem/320px                                                    |
| padding    | `px-3 py-1.5` = 12px/6px                                                    |
| radius     | `rounded-md` (bare Tailwind, not a `radius-*` token)                        |
| background | `bg-foreground` (0.145 0 0)                                                 |
| text       | `text-background` (1 0 0) — colors inverted relative to most other popovers |
| type role  | `type-caption` (12/375/1.35)                                                |

Arrow: `size-2.5` = 10px, rotated 45°, `rounded-[2px]`, same `bg-foreground
fill-foreground` as the body, positioned per `side`.

Animation `duration-100` implied by `data-[state=delayed-open]:animate-in`
class group (no explicit `duration-*` utility on this file, unlike Dialog/
Select/DropdownMenu — animation timing here relies on the Tailwind-animate
default, not a `duration-100` class literally present, and not one of the
named `--duration-*` tokens either way).

---

## Summary

- Primitives covered: **25 / 25** (alert, badge, button-group, button, card,
  collapsible, command, dialog, dropdown-menu, field, hover-card, input-group,
  input, label, logo, select, separator, sheet, sidebar, skeleton, spinner,
  switch, table, textarea, tooltip).
- Total variant/size rows produced across all tables: **approximately 140**
  (counting every distinct variant, size, and part-level row in the tables
  above; Button alone contributes 11 size rows × up to 11 variant rows of
  distinct token combinations, tallied separately above rather than as a full
  cross-product to avoid inventing combinations not distinctly styled in the
  source).
- Files fully resolved against documented tokens: all 25, with explicit
  "cannot resolve to a `radius-*` token" flags wherever a bare Tailwind
  utility (`rounded-md`, `rounded-sm`, `rounded-full`) is used instead of one
  of the eight named `radius-xs`…`radius-4xl` tokens — this affects Command
  items, DropdownMenu items/sub-content items, Select items, Sidebar (most
  radii), Skeleton, Switch, Tooltip, and Button's `motion-box` size.
- Also flagged as unresolvable to a named token: `duration-100`/`duration-150`/
  `duration-200` (Dialog, Select, DropdownMenu, HoverCard use `duration-100`;
  Sheet overlay uses `duration-150`; Sheet content transform uses
  `duration-200` — none matches the four documented `--duration-*` values of
  80/140/220/360ms exactly), `shadow-sm`/`shadow-md`/`shadow-lg` (Tailwind
  defaults, no shadow tokens exist in DESIGN_SYSTEM.md section 3 at all), and
  raw `text-sm`/`text-xs`/`font-medium` in `sidebar.tsx` (already named in
  DESIGN_SYSTEM.md section 8 item 4 as a known gap, 9 occurrences in this
  file per that count).
- Base-library split reconciliation issue noted above: DESIGN_SYSTEM.md's own
  claim of "14 of 25 primitives" using `@base-ui/react` could not be
  cross-checked to exactly 14 distinct files by counting literal "base-ui"
  rows in its section-4 table (11) plus "useRender" rows (2, Badge and
  Sidebar) — this document reports the observed 11 `base-ui`-literal +
  2 `useRender` + Command's `cmdk` (non-base-ui) split as read, rather than
  asserting which specific 14th file DESIGN_SYSTEM.md intended.

## 2. AI Elements and Browser Components

Token source: `docs/DESIGN_SYSTEM.md` — OKLCH color tokens (§3.3), `type-*` scale (§3.2), radius tokens (§3.4). Section numbers below (e.g. "§8 item 4") refer to `docs/DESIGN_SYSTEM.md`.

---

### `src/components/ai-elements/question.tsx`

#### `Question` (line 90)

- Purpose: root form wrapper providing selection/text state via context; renders a `<form>`.
- Layout: `space-y-4` vertical stack, block padding.
- Colors: `border` (semantic border token), `bg-background` (semantic).
- Type roles: none applied directly.
- Radius: `rounded-lg` (radius-lg, 10px, token-based utility name).
- States: none (delegates to children).

#### `QuestionPrompt` (line 188)

- Purpose: prompt text (`<p>`) for the question.
- Layout: none beyond default paragraph.
- Colors: none.
- Type roles: **none** — uses raw `font-medium text-sm` (line 192). **Bypasses tokens** — `question.tsx:192` (`font-medium`, `text-sm` instead of a `type-*` class such as `type-label`). Confirmed as a known gap in DESIGN_SYSTEM.md §8 item 4.
- Radius/states: n/a.

#### `QuestionDescription` (line 197)

- Purpose: secondary description text.
- Colors: `text-muted-foreground` (semantic).
- Type roles: **none** — raw `text-sm` (line 201). **Bypasses tokens** — `question.tsx:201` (`text-sm` instead of `type-supporting-body`/`type-caption`). Matches DESIGN_SYSTEM.md §8 item 4.

#### `QuestionOptions` (line 206)

- Purpose: wrapper (`role=radiogroup|group`) around option buttons.
- Layout: `flex flex-wrap gap-2`.
- Colors/type/radius: none set directly.

#### `QuestionOption` (line 228)

- Purpose: selectable option rendered as a `Button` primitive (radio/checkbox semantics via `role`/`aria-checked`).
- Layout: `h-auto whitespace-normal` override on the Button.
- Colors: inherits from `Button` variant — `variant="default"` when selected (primary fill token), `variant="outline"` when unselected (border/background tokens per DESIGN_SYSTEM.md §4 Button table). No raw colors added here.
- Type: inherits Button's `type-label` (per DESIGN_SYSTEM.md shadcn.css compatibility rule).
- Radius: inherits Button's `rounded-lg`.
- States: `disabled` prop passed through (question.disabled || disabled); relies on Button's built-in hover/active/disabled styling.

#### `QuestionInput` (line 269)

- Purpose: free-text response field wrapping the `Textarea` primitive.
- Layout: `min-h-20` override.
- Colors/type/radius: inherited from `Textarea` primitive (semantic, `type-input`-adjacent per primitive default).
- States: `disabled` passed through.

#### `QuestionActions` (line 297)

- Purpose: action row (submit button container).
- Layout: `flex items-center justify-end gap-2`.
- Colors/type/radius: none directly.

#### `QuestionSubmit` (line 311)

- Purpose: submit button; disabled until a response exists.
- Layout: none beyond Button defaults.
- Colors: inherits `Button` default variant (primary fill).
- States: `disabled` computed from `question.disabled`, explicit `disabled` prop, or no response yet (`!hasResponse`) — a genuine disabled-state affordance.

**Bypass summary for this file:** `question.tsx:192` (`font-medium text-sm`), `question.tsx:201` (`text-sm`). This matches the documented known gap (§8 item 4: "4 occurrences" of raw text classes attributed to this file).

---

### `src/components/ai-elements/reasoning.tsx`

#### `Reasoning` (line 79, exported as memoized component)

- Purpose: collapsible container for model "thinking"/reasoning output; manages open/streaming/duration state (auto-opens while streaming, auto-closes 1s after streaming ends) via `Collapsible` primitive.
- Layout: `not-prose mb-4` on the `Collapsible` root.
- Colors: none directly (delegates to children).
- Type roles: none directly.
- Radius: none directly.
- States: `isStreaming`, `isOpen`/`onOpenChange`, computed `duration` — genuine interactive/streaming state machine (auto-open/auto-close timers).

#### `ReasoningTrigger` (line 191)

- Purpose: clickable header toggling the collapsible; shows a brain icon, a "Thinking..." shimmer while streaming, or "Thought for N seconds" once done, plus a rotating chevron.
- Layout: `flex w-full items-center gap-2`.
- Colors: `text-muted-foreground` default, `hover:text-foreground` (semantic hover state, both tokens).
- Type roles: `type-label` on the inner `<span className="contents type-label">` (line 208) — token-based.
- Radius: n/a (no border/bg here).
- States: `hover:text-foreground` (hover); chevron rotates `rotate-180`/`rotate-0` based on `isOpen` with `transition-transform`; streaming state renders `Shimmer` (see shimmer.tsx) for a loading/streaming visual.

#### `ReasoningContent` (line 235)

- Purpose: collapsible panel rendering the reasoning markdown via `Streamdown`.
- Layout: `mt-4`.
- Colors: `text-muted-foreground` (semantic).
- Type roles: `type-supporting-body` on the inner content wrapper (line 245) — token-based.
- Radius: n/a.
- States: open/close enter/exit animation classes — `data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in` — all data-attribute-driven transition utilities, no raw colors.

No raw/bypassing color or text-size classes found in this file.

---

### `src/components/ai-elements/tool.tsx`

#### `Tool` (line 58)

- Purpose: collapsible wrapper for a single tool-call render (status icon, header, input/output panels).
- Layout: `group not-prose w-full`. Carries `data-slot="chat-tool"` (per DESIGN_SYSTEM.md rule 5, every primitive/composed piece should carry a `data-slot`).
- Colors/type/radius: none directly.

#### `ToolHeader` (line 80)

- Purpose: clickable trigger row showing icon, title, optional meta, and a status badge (icon + label) driven by `statusPresentation` map (approval-requested, approval-responded, input-available, input-streaming, output-available, output-denied, output-error).
- Layout: `flex w-full items-center gap-2 py-0.5`.
- Colors: `text-muted-foreground` default, `hover:text-foreground` (semantic); status text goes `text-destructive` (semantic) when `status === "output-error"` (line 116).
- Type roles: `type-label` on the title span (line 102), `type-caption` on the status span (line 114) — both token-based.
- Radius: n/a.
- States: `hover:text-foreground` hover state; chevron rotates via `group-data-[state=open]:rotate-90`; per-status icon presentation (loading spinner-like `animate-pulse` on the "Running"/`input-available` `CircleIcon`, line 35) — a genuine loading-state affordance.

#### `ToolContent` (line 130)

- Purpose: collapsible content region for input/output panels.
- Layout: `space-y-4 py-2`.
- Colors: `text-popover-foreground` (semantic).
- Type roles: none directly (children set their own).
- States: enter/exit animation classes identical pattern to `ReasoningContent` (`data-[state=closed]:animate-out …`).

#### `ToolInput` (line 147)

- Purpose: renders the tool call's JSON input parameters.
- Layout: `space-y-2 overflow-hidden`.
- Colors: `text-muted-foreground` on label (line 150); `bg-muted/50` on the `<pre>` (semantic, opacity-modified).
- Type roles: `type-label` on the "Parameters" label (line 150); `type-code` on the `<pre>` (line 151) — both token-based.
- Radius: `rounded-md` (radius-md, ~8.75px).

#### `ToolOutput` (line 163)

- Purpose: renders the tool call's result or error text.
- Layout: `space-y-2`.
- Colors: `text-muted-foreground` on label; `bg-muted/50` for normal output; on error, `bg-destructive/10 text-destructive` (line 186 — both semantic tokens, tinted via opacity, consistent with the documented `-subtle`/opacity pattern in DESIGN_SYSTEM.md §3.3).
- Type roles: `type-label` on the "Error"/"Result" label (line 180); `type-supporting-body` on the content block (line 185).
- Radius: `rounded-md`.
- States: conditional error styling (`errorText && "bg-destructive/10 text-destructive"`) — a genuine error-state affordance.

No raw/bypassing color or text-size classes found in this file.

---

### `src/components/ai-elements/model-selector.tsx`

All exported components are thin wrappers around `Command`/`Dialog` primitives (`ModelSelector`, `ModelSelectorTrigger`, `ModelSelectorContent`, `ModelSelectorInput`, `ModelSelectorList`, `ModelSelectorEmpty`, `ModelSelectorGroup`, `ModelSelectorItem`, `ModelSelectorShortcut`, `ModelSelectorLogo`, `ModelSelectorName`).

#### `ModelSelector` / `ModelSelectorTrigger` / `ModelSelectorList` / `ModelSelectorEmpty` / `ModelSelectorGroup` / `ModelSelectorItem` / `ModelSelectorShortcut`

- Purpose: pass-through renames of `Dialog`/`Command` primitive parts for a model-picker dialog.
- No className overrides; all styling inherited from the underlying primitives (semantic by construction, per DESIGN_SYSTEM.md §4).

#### `ModelSelectorContent` (line 31)

- Purpose: dialog content hosting the `Command` palette.
- Layout: none beyond `p-0`.
- Colors: `border-none`, `outline outline-border` (semantic border token).
- Type roles: n/a (title is `sr-only`).

#### `ModelSelectorInput` (line 51)

- Purpose: search input inside the command palette.
- Layout: `h-auto py-3.5` override.
- Colors/type: inherited from `CommandInput` primitive.

#### `ModelSelectorLogo` (line 80)

- Purpose: renders an external provider logo image (`models.dev` artwork) for a model row.
- Layout: `size-4 shrink-0`.
- Colors: `dark:invert` (filter, not a color token — acceptable for image inversion, not a text/bg/border token bypass).
- Note: fetches from an external URL (`https://models.dev/logos/${provider}.svg`) — not a design-system concern but noted since it's an unusual external asset dependency in this component set.

#### `ModelSelectorName` (line 101)

- Purpose: truncated model name label.
- Layout: `min-w-0 flex-1 truncate text-left`.
- Colors/type: none set (relies on ambient text color/type from `CommandItem`).

No raw/bypassing color or text-size classes found in this file.

---

### `src/components/ai-elements/shimmer.tsx`

#### `Shimmer` (line 58, memoized `ShimmerComponent`)

- Purpose: animated shimmering-text effect used for streaming/loading indicators (e.g., "Thinking..." in `reasoning.tsx`). Built on `motion/react` (`LazyMotion`, `m.create`).
- Layout: `relative inline-block w-fit`.
- Colors: uses `var(--color-foreground)` and `var(--color-muted-foreground)` (semantic CSS custom properties, referenced directly rather than as Tailwind utility classes) inside an inline `style` `backgroundImage` gradient (line 37, 44) — this is a raw inline style, not a Tailwind class, so it isn't a "bypass a Tailwind token class" case per se, but it does reference the semantic color variables directly (not through a `bg-*`/`text-*` utility), which is a different code path than the rest of the system. No hex codes or arbitrary raw palette values are used — the two colors referenced are the documented semantic tokens `--color-foreground` and `--color-muted-foreground`.
- Type roles: none (text size/weight inherited from the `as` element, default `<p>`).
- Radius: n/a.
- States: continuously animates (`repeat: Infinity`) — this component itself _is_ the loading/streaming-state indicator used elsewhere.

No Tailwind raw-palette or raw-text-size classes found; the only non-standard styling is the inline gradient using CSS variables (flagged above for transparency, not as a hard violation since it uses the semantic tokens, not raw colors).

---

### `src/components/ai-elements/prompt-input.tsx`

This file is the largest and mostly logic (attachments, file drag/drop, screenshot capture, controller/provider contexts). Styling-bearing exports:

#### `PromptInputActionAddAttachments` (line 448) / `PromptInputActionAddScreenshot` (line 475)

- Purpose: dropdown menu items to add file attachments / take a screenshot.
- Colors/type: inherited from `DropdownMenuItem`; icons use `mr-2 size-4` spacing only.

#### `PromptInput` (line 547)

- Purpose: root composer form; manages attachments, drag/drop, paste, file validation (max files/size, accept type), optional global drop and hidden native-form sync input.
- Layout: hidden native file `<input>` (`className="hidden"`, line 950); form is `w-full` (line 958); wraps children in `InputGroup className="overflow-hidden"` (line 965) — `InputGroup` is a semantic primitive (per DESIGN_SYSTEM.md §4).
- Colors/type/radius: none set directly (delegated to `InputGroup` primitive).

#### `PromptInputBody` (line 986)

- Purpose: layout-transparent wrapper (`display: contents`).
- Layout: `contents`.

#### `PromptInputTextarea` (line 997)

- Purpose: the composer's text field; handles Enter-to-submit (respecting IME composition and Shift+Enter), Backspace-to-remove-last-attachment, and paste-to-attach-files.
- Layout: `field-sizing-content max-h-48 min-h-16` on the underlying `InputGroupTextarea` primitive.
- Colors/type: inherited from `InputGroupTextarea` (semantic, `type-input` per primitive).
- States: Enter submits (checks submit-button `disabled` first); IME composition guard; paste/backspace handlers — genuine interactive states, no visual state classes added here beyond the primitive's own.

#### `PromptInputHeader` (line 1117) / `PromptInputFooter` (line 1133)

- Purpose: top/bottom addon rows inside the `InputGroup` (e.g., attachment previews row, tool/submit row).
- Layout: `order-first flex-wrap gap-1` (header); `justify-between gap-1` (footer). Both on `InputGroupAddon` primitive (`align="block-end"`).

#### `PromptInputTools` (line 1146)

- Purpose: container for left-side composer tool buttons (attach, screenshot, model select, etc.).
- Layout: `flex min-w-0 items-center gap-1`.

#### `PromptInputButton` (line 1174)

- Purpose: generic composer icon/tool button wrapping `InputGroupButton`, optionally with a tooltip (string or `{content, shortcut, side}`).
- Layout: size auto-selected (`sm` vs `icon-sm`) based on children count.
- Colors: default `variant="ghost"` (semantic, per Button variant table); tooltip shortcut text uses `text-muted-foreground` (line 1214, semantic).
- States: tooltip on hover/focus via `Tooltip` primitive (base-ui, per DESIGN_SYSTEM.md).

#### `PromptInputActionMenu` / `PromptInputActionMenuTrigger` (line 1228) / `PromptInputActionMenuContent` (line 1245) / `PromptInputActionMenuItem` (line 1255)

- Purpose: "+" dropdown menu for composer actions (attach file, screenshot, etc.).
- Colors/type: inherited from `DropdownMenu*` primitives; trigger defaults to a `PlusIcon`.

#### `PromptInputSubmit` (line 1270)

- Purpose: submit/stop button for the composer; icon and semantics change with `ChatStatus` (`submitted` → `Spinner` loading icon; `streaming` → stop square, clicking calls `onStop`; `error` → X icon; default → send/return icon).
- Colors: `variant="default"` (primary fill, semantic).
- States: **loading state** (`Spinner` shown while `status === "submitted"`), **streaming state** (stop icon + click-to-stop while `status === "streaming"`), **error state** (X icon while `status === "error"`) — a genuine, well-defined interactive/status state machine driven entirely through Button variant/icon swaps, no raw color classes.

#### `PromptInputSelect` / `PromptInputSelectTrigger` (line 1331) / `PromptInputSelectContent` / `PromptInputSelectItem` / `PromptInputSelectValue`

- Purpose: model/mode select control embedded in the composer.
- Colors: `PromptInputSelectTrigger` sets `border-none bg-transparent text-muted-foreground shadow-none` with `hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground` (lines 1336-1339) — all semantic tokens, and includes explicit hover and `aria-expanded` (open) states.

#### `PromptInputHoverCard` / `PromptInputHoverCardTrigger` / `PromptInputHoverCardContent`

- Purpose: hover-card wrapper (e.g., for showing model details on hover) around the `HoverCard` primitive; only sets `align="start"` default.

#### `PromptInputTabsList` (line 1411) / `PromptInputTab` (line 1418)

- Purpose: generic tab container/tab wrappers (no default styling applied — pure pass-through `div`s).

#### `PromptInputTabLabel` (line 1425)

- Purpose: heading label for a tab section.
- Layout: `mb-2 px-3`.
- Colors: `text-muted-foreground` (semantic).
- Type roles: `type-card-title` (line 1431) — token-based.

#### `PromptInputTabBody` (line 1440)

- Purpose: vertical list container within a tab.
- Layout: `space-y-1`.

#### `PromptInputTabItem` (line 1449)

- Purpose: a selectable row within a tab (e.g., a command/reference-source row).
- Layout: `flex items-center gap-2 px-3 py-2`.
- Colors: `hover:bg-accent` (semantic hover state, line 1455).
- Type roles: `type-caption` (line 1455) — token-based.

#### `PromptInputCommand*` family (`PromptInputCommand`, `PromptInputCommandInput`, `PromptInputCommandList`, `PromptInputCommandEmpty`, `PromptInputCommandGroup`, `PromptInputCommandItem`, `PromptInputCommandSeparator`, lines 1464-1523)

- Purpose: thin pass-through wrappers around the `Command` (cmdk) primitive parts, used for the composer's slash-command/reference palette.
- No className overrides beyond passing through the caller's `className`; all styling inherited from `Command*` primitives (semantic by construction).

**No raw Tailwind palette or raw text-size/font-weight classes found in `prompt-input.tsx`.** All colors used (`bg-transparent`, `text-muted-foreground`, `bg-accent`, `text-foreground`) are semantic tokens; all sizing/spacing classes are layout utilities, not typography bypasses; the one text-size-shaped exception is `type-card-title`/`type-caption` which are the _correct_ token utilities, not raw ones.

---

### `src/components/ai-elements/conversation.tsx`

#### `Conversation` (line 30)

- Purpose: scrollable message list root using `use-stick-to-bottom`'s `StickToBottom`, with optional scroll-position restoration keyed by `scrollRestorationKey`.
- Layout: `relative flex-1 overflow-y-hidden`.
- Colors/type/radius: none.
- States: `role="log"`, smooth/instant scroll-to-bottom behavior.

#### `ConversationScrollRestoration` (internal, line 76) — not exported; persists/restores scroll position via `sessionStorage`.

#### `ConversationContent` (line 151)

- Purpose: padded flex column holding message bubbles.
- Layout: `flex flex-col gap-8 p-4`.

#### `ConversationEmptyState` (line 167)

- Purpose: centered empty-state placeholder (icon + title + description) shown when there are no messages.
- Layout: `flex size-full flex-col items-center justify-center gap-3 p-8 text-center`; inner `space-y-1`.
- Colors: `text-muted-foreground` on the icon wrapper (line 184, semantic) and on the description (line 188, semantic).
- Type roles: **none** — title uses raw `text-sm font-medium` (line 186); description uses raw `text-sm text-muted-foreground` (line 188). **Bypasses tokens** — `conversation.tsx:186` (`text-sm font-medium`) and `conversation.tsx:188` (`text-sm`), should be `type-card-title`/`type-supporting-body` style tokens per DESIGN_SYSTEM.md §8 item 4 (this file is named there as one of the three files with raw text classes, 5 occurrences attributed to it — this reading finds 2 direct raw-class lines, each with 2 raw sub-classes: `text-sm`+`font-medium` on line 186, `text-sm` on line 188, i.e. 3 raw class tokens across 2 lines; exact count reconciliation left to the doc's own occurrence tally).

#### `ConversationScrollButton` (line 201)

- Purpose: floating "scroll to bottom" button, shown only once hydrated and not already at bottom.
- Layout: `absolute bottom-32 left-[50%] translate-x-[-50%] rounded-full`.
- Colors: `dark:bg-background dark:hover:bg-muted` (semantic tokens, dark-mode only — note DESIGN_SYSTEM.md §7 states dark mode is currently unreachable, so these classes have no effect in the shipped app).
- Radius: `rounded-full`.
- Variant: `variant="outline"` Button (semantic).
- States: `hover` (dark only, per above), conditional render based on `isAtBottom`/hydration.

#### `ConversationDownload` (line 266)

- Purpose: floating "download conversation as markdown" button; builds a markdown blob client-side and triggers a browser download.
- Layout: `absolute top-4 right-4 rounded-full`.
- Colors: `dark:bg-background dark:hover:bg-muted` (same dark-only note as above).
- Radius: `rounded-full`.
- Variant: `variant="outline"` Button.

Helper exports `getMessageText`, `messagesToMarkdown`, `defaultFormatMessage` are non-visual utilities (no classes).

**Bypass summary for this file:** `conversation.tsx:186` (`text-sm font-medium`), `conversation.tsx:188` (`text-sm`) — matches the documented known gap in DESIGN_SYSTEM.md §8 item 4.

---

### `src/components/ai-elements/message.tsx`

#### `Message` (line 37)

- Purpose: outer message row; adds `is-user`/`is-assistant` marker classes based on `from` role, used by descendant `group-[...]` selectors.
- Layout: `flex w-full max-w-[95%] flex-col gap-2`; `ml-auto justify-end` when `from === "user"`.
- Colors/type/radius: none directly.

#### `MessageContent` (line 50)

- Purpose: the actual bubble containing message body content.
- Layout: `flex w-fit min-w-0 max-w-full flex-col gap-3 overflow-hidden`.
- Colors: for user messages — `group-[.is-user]:bg-secondary group-[.is-user]:text-foreground` (semantic secondary-fill token per DESIGN_SYSTEM.md §3.3/§4 Button-variant intent table analog); for assistant messages — `group-[.is-assistant]:text-foreground` (semantic, no fill = plain text on background).
- Type roles: `type-supporting-body` (line 57) — token-based, matches DESIGN_SYSTEM.md §5 note ("text is `type-supporting-body`").
- Radius: `group-[.is-user]:rounded-lg` (radius-lg, user bubble only; assistant messages have no bubble/radius, consistent with a "flat" assistant style).
- Padding: `group-[.is-user]:px-4 group-[.is-user]:py-3`.

#### `MessageActions` (line 70)

- Purpose: row of per-message action buttons (e.g., copy, regenerate).
- Layout: `flex items-center gap-1`.

#### `MessageAction` (line 85)

- Purpose: single icon action button, optionally wrapped in a `Tooltip`.
- Colors: default `variant="ghost"` (semantic).
- Size: default `size="icon-sm"`.
- States: tooltip shown via `TooltipTrigger`/`TooltipContent` (hover/focus, base-ui primitive).

#### `MessageBranch` (line 146) / `MessageBranchContent` (line 199) / `MessageBranchSelector` (line 232) / `MessageBranchPrevious` (line 257) / `MessageBranchNext` (line 280) / `MessageBranchPage` (line 303)

- Purpose: branch-navigation UI for alternate message responses (prev/next buttons + "X of Y" indicator), state managed via `MessageBranchContext`.
- Layout: `MessageBranch` root is `grid w-full gap-2 [&>div]:pb-0`; `MessageBranchContent` per-branch wrapper is `grid gap-2 overflow-hidden [&>div]:pb-0`, toggling `block`/`hidden` based on the active branch index; `MessageBranchSelector` is a `ButtonGroup` with rounding overrides (`[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md`).
- Colors: `MessageBranchPage` uses `border-none bg-transparent text-muted-foreground shadow-none` (line 312, semantic) on `ButtonGroupText`.
- Radius: `rounded-l-md`/`rounded-r-md` (radius-md) on `MessageBranchSelector` children.
- Icons/sizes: prev/next buttons are `variant="ghost"`, `size="icon-sm"` (semantic).
- States: prev/next buttons `disabled` when `totalBranches <= 1`; `MessageBranchSelector` renders nothing when only one branch exists (a real conditional-visibility state, not a class-driven one).

#### `MessageResponse` (line 382) and `ArtifactMessageImage` (line 327)

- Purpose: `MessageResponse` renders the assistant's markdown reply via `Streamdown`, switching between `"streaming"` and `"static"` render modes based on `isAnimating`; `ArtifactMessageImage` is a custom `img` renderer for Streamdown markdown that only displays images matching the app's own browser-artifact URL scheme (`isBrowserImageArtifactUrl`), otherwise showing a text fallback.
- Layout (`MessageResponse`): `size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0`.
- Layout (`ArtifactMessageImage` fallback span): none; (image itself): `my-3 max-h-[32rem] w-auto max-w-full`.
- Colors: `ArtifactMessageImage` fallback text is `text-muted-foreground` (line 338, semantic); the actual `<img>` uses `border bg-muted object-contain` (semantic border/bg tokens).
- Type roles: none directly (Streamdown/markdown sets its own prose typography).
- Radius: `rounded-lg` on the artifact image (line 351).
- States: `isAnimating` (streaming) toggles Streamdown's render `mode` between `"streaming"` and `"static"` — a genuine streaming-state affordance; link-safety interception (`streamdownLinkSafety`) shows an "Open external link?" confirmation only for cross-origin links (an interaction-state guard, not a visual state).

#### `MessageToolbar` (line 404)

- Purpose: row beneath a message holding secondary controls (e.g., branch selector + actions).
- Layout: `mt-4 flex w-full items-center justify-between gap-4`.

No raw Tailwind palette or raw text-size/font-weight classes found in `message.tsx` — all color and type-role usage in this file is token-based.

---

### `src/components/browser/activity-duration-breakdown.tsx`

#### `ActivityDurationBreakdown` (line 22) — the only exported component.

- Purpose: color-coded horizontal stacked bar plus a legend, showing how a browser worker's total activity time is split across kinds (`model`, `playwright`, `semantic`, `visual`, `web`, `vault`, `setup`, `waiting`, `other`), per `docs/DESIGN_SYSTEM.md` §5 ("the color legend for browser worker activity kinds"). Returns `null` when total duration is 0.
- Layout: outer `grid gap-2`; the bar is `flex h-1.5 overflow-hidden rounded-full`; each segment is a `<span>` with an inline `style={{ width: '<pct>%' }}`; the legend is `grid gap-0.5`, each row `inline-flex items-center gap-1` with a `size-1.5 rounded-full` color swatch.
- Colors: the bar's own background track is `bg-muted` (semantic, line 38). Every activity-kind swatch/segment color is a **raw Tailwind palette class** from the `activityPresentation` map (lines 11-19):
  - `bg-violet-500` (model)
  - `bg-cyan-500` (playwright)
  - `bg-blue-500` (semantic activity kind, named "Browser DOM" — coincidentally shares the word "semantic" with the _design-system_ term but is a raw palette color)
  - `bg-fuchsia-500` (visual)
  - `bg-emerald-500` (web)
  - `bg-amber-500` (vault)
  - `bg-slate-400` (setup)
  - `bg-orange-400` (waiting)
  - `bg-zinc-400` (other)

  **Bypasses tokens** — `activity-duration-breakdown.tsx:11` (`bg-violet-500`), `:12` (`bg-cyan-500`), `:13` (`bg-blue-500`), `:14` (`bg-fuchsia-500`), `:15` (`bg-emerald-500`), `:16` (`bg-amber-500`), `:17` (`bg-slate-400`), `:18` (`bg-orange-400`), `:19` (`bg-zinc-400`) — none of these appear in DESIGN_SYSTEM.md §3.3's token table (which defines `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, `ring`, `destructive`, `information`, `success`, `warning`, `chart-1`…`chart-5`, `sidebar*`). This is a categorical-legend use case (9 distinct hues needed to distinguish activity kinds), which the current semantic palette does not provide enough of — `chart-1`…`chart-5` tokens exist in `foundation.css` per DESIGN_SYSTEM.md §3.3 but are not used here, and even those would only cover 5 of the 9 kinds needed.

- Type roles: `type-caption` on the legend list (line 54) — token-based; row labels have no additional type class (inherit from `type-caption` parent).
- Radius: `rounded-full` on both the bar track and each legend swatch (both raw Tailwind `rounded-full`, not one of the named `radius-*` tokens, but `rounded-full` is a standard Tailwind utility with no numeric radius token equivalent — not flagged as a token bypass since DESIGN_SYSTEM.md's radius table only covers named scale steps, not "fully round").
- States: none (purely presentational; no hover/focus/disabled/loading affordances — it's a static data legend).

---

## Coverage count

**19 files read** (as scoped): 9 files under `src/components/ai-elements/` (`question.tsx`, `reasoning.tsx`, `tool.tsx`, `model-selector.tsx`, `shimmer.tsx`, `prompt-input.tsx`, `conversation.tsx`, `message.tsx`, plus `docs/DESIGN_SYSTEM.md` as the token reference) and 1 file under `src/components/browser/` (`activity-duration-breakdown.tsx`).

**Exported components/functions documented: 62** across the 9 component files:

- `question.tsx`: 8 (`Question`, `QuestionPrompt`, `QuestionDescription`, `QuestionOptions`, `QuestionOption`, `QuestionInput`, `QuestionActions`, `QuestionSubmit`)
- `reasoning.tsx`: 3 (`Reasoning`, `ReasoningTrigger`, `ReasoningContent`) + `useReasoning` hook
- `tool.tsx`: 5 (`Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`)
- `model-selector.tsx`: 10 (`ModelSelector`, `ModelSelectorTrigger`, `ModelSelectorContent`, `ModelSelectorInput`, `ModelSelectorList`, `ModelSelectorEmpty`, `ModelSelectorGroup`, `ModelSelectorItem`, `ModelSelectorShortcut`, `ModelSelectorLogo`, `ModelSelectorName`) = 11
- `shimmer.tsx`: 1 (`Shimmer`)
- `prompt-input.tsx`: ~29 exported components/hooks (provider/context hooks plus all `PromptInput*` visual pieces)
- `conversation.tsx`: 6 (`Conversation`, `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton`, `ConversationDownload`, plus helpers `getMessageText`/`messagesToMarkdown`)
- `message.tsx`: 15 (`Message`, `MessageContent`, `MessageActions`, `MessageAction`, `MessageBranch`, `MessageBranchContent`, `MessageBranchSelector`, `MessageBranchPrevious`, `MessageBranchNext`, `MessageBranchPage`, `MessageResponse`, `ArtifactMessageImage`, `MessageToolbar`)
- `activity-duration-breakdown.tsx`: 1 (`ActivityDurationBreakdown`)

## Every raw/token-bypassing class found (file:line)

1. `src/components/ai-elements/question.tsx:192` — `font-medium text-sm` (raw text classes on `QuestionPrompt`; documented gap, DESIGN_SYSTEM.md §8 item 4)
2. `src/components/ai-elements/question.tsx:201` — `text-sm` (raw text class on `QuestionDescription`; documented gap, DESIGN_SYSTEM.md §8 item 4)
3. `src/components/ai-elements/conversation.tsx:186` — `text-sm font-medium` (raw text classes on `ConversationEmptyState` title; documented gap, DESIGN_SYSTEM.md §8 item 4)
4. `src/components/ai-elements/conversation.tsx:188` — `text-sm` (raw text class on `ConversationEmptyState` description; documented gap, DESIGN_SYSTEM.md §8 item 4)
5. `src/components/browser/activity-duration-breakdown.tsx:11` — `bg-violet-500`
6. `src/components/browser/activity-duration-breakdown.tsx:12` — `bg-cyan-500`
7. `src/components/browser/activity-duration-breakdown.tsx:13` — `bg-blue-500`
8. `src/components/browser/activity-duration-breakdown.tsx:14` — `bg-fuchsia-500`
9. `src/components/browser/activity-duration-breakdown.tsx:15` — `bg-emerald-500`
10. `src/components/browser/activity-duration-breakdown.tsx:16` — `bg-amber-500`
11. `src/components/browser/activity-duration-breakdown.tsx:17` — `bg-slate-400`
12. `src/components/browser/activity-duration-breakdown.tsx:18` — `bg-orange-400`
13. `src/components/browser/activity-duration-breakdown.tsx:19` — `bg-zinc-400`

Items 1-4 are already named in DESIGN_SYSTEM.md §8 item 4 ("Raw text classes remain in three files" — `question.tsx` and `conversation.tsx` are two of the three, the third being `src/components/ui/sidebar.tsx`, out of scope for this pass). Items 5-13 (the browser activity legend's raw palette colors) are **not** currently named anywhere in DESIGN_SYSTEM.md's known-gaps section and were newly identified in this review.

No raw or token-bypassing classes were found in `reasoning.tsx`, `tool.tsx`, `model-selector.tsx`, `shimmer.tsx`, `prompt-input.tsx`, or `message.tsx`.

## 3. Composed Components (_components folders)

Method: every `.tsx` file in each of the 15 named folders was read in full.
Import alias is `@/*` → `./src/*` (from `tsconfig.json`). A raw class is
flagged only when it does not match `bg-{semantic-token}`, `text-{semantic-token}`,
`border-{semantic-token}`, or a `type-*` utility (per the task definition —
raw Tailwind text-size/weight classes, raw palette colors, hex codes).

### 1. `src/app/_components` (1 file)

| File          | Purpose                                                                                                                                      | `ui` primitives used                                                 | Layout                                 | Raw-class bypasses |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- | ------------------ |
| `og-mark.tsx` | Renders the Open Graph mark as an inline SVG polygon logo, with OKLCH↔hex color math to derive a 3-tone isometric look from one input color. | None — raw `<svg>`/`<polygon>`/`<path>`, no Tailwind classes at all. | No layout classes (pure SVG geometry). | None               |

### 2. `src/app/(authenticated)/_components` (2 files)

| File                           | Purpose                                                                                                                                  | `ui` primitives used                                                                                                                       | Layout                                                                                                                                                                                         | Raw-class bypasses                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `account-control.tsx`          | Sidebar footer account control: shows the signed-in phone number and a sign-out action.                                                  | `SidebarMenu`, `SidebarMenuAction`, `SidebarMenuButton`, `SidebarMenuItem` (`@/components/ui/sidebar`)                                     | No custom layout classes; structure comes entirely from the `Sidebar*` primitives.                                                                                                             | None                                                                   |
| `authenticated-navigation.tsx` | Renders the primary + admin sidebar nav (`AuthenticatedNavigation`) and the mobile header with page title (`AuthenticatedMobileHeader`). | `SidebarGroup`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarTrigger` (`@/components/ui/sidebar`) | Admin label: `px-2 pb-2`. Mobile header: flex row, `h-12 shrink-0 items-center gap-2 border-b border-border/50 px-4 md:hidden` — matches the "Mobile header" pattern in DESIGN_SYSTEM.md §3.7. | None (`type-micro`, `type-label`, `border-border/50` are all semantic) |

### 3. `src/app/sign-in/_components` (3 files)

| File              | Purpose                                                                                                                                                         | `ui` primitives used                                                                                            | Layout                                                                                                                                                                  | Raw-class bypasses |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `local-form.tsx`  | Local/dev phone sign-in form that auto-verifies with a fixed code.                                                                                              | `Button`, `FieldError`, `FieldGroup` (`field`, `input` implicitly via `PhoneNumberField`)                       | `form` gets `mt-6`; `Button` gets `w-full`. Fields stack via `FieldGroup`.                                                                                              | None               |
| `otp-form.tsx`    | Multi-step phone OTP sign-in: send-code form → verification-code form, plus a first-time-Linq-setup `Alert` instructing the user to text the Linq number first. | `Alert`, `AlertDescription`, `AlertTitle`, `Button`, `Field`, `FieldError`, `FieldGroup`, `FieldLabel`, `Input` | Forms use `mt-4`/`mt-6`, buttons `w-full`; instructions list is `mt-2 list-decimal space-y-1 pl-4`; `FirstTimeLinqSetup` alert is `mt-6`, its CTA button `mt-3 w-full`. | None               |
| `phone-field.tsx` | Shared phone-number `Field`/`Input` used by both sign-in forms.                                                                                                 | `Field`, `FieldLabel`, `Input`                                                                                  | No layout classes; single field.                                                                                                                                        | None               |

### 4. `src/app/(authenticated)/(workspace)/_components` (3 files)

| File                          | Purpose                                                                                                                                                | `ui` primitives used                                                                                                     | Layout                                                                                                                                            | Raw-class bypasses                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `square-action.tsx`           | Connect/disconnect action + status `Badge` for the Square integration on the workspace page.                                                           | `Badge`, `Button`                                                                                                        | No layout classes (single inline control).                                                                                                        | None                                                                                                                               |
| `model-selector.tsx`          | Model picker built on the `ModelSelector` composed component (`@/components/ai-elements/model-selector`), grouped by provider, with per-model pricing. | `Button` (as the `ModelSelectorTrigger` render target); composes `ModelSelector*` from `ai-elements`, not `ui` directly. | `ModelSelectorContent` gets `sm:max-w-xl`; list gets `max-h-[min(32rem,70vh)]`; item text spans use `min-w-0 flex-1 text-left`, `block truncate`. | None — `text-left` is alignment, not a flagged text-size/color bypass; `type-caption text-muted-foreground` (line 111) is semantic |
| `google-workspace-action.tsx` | Connect/disconnect action + status `Badge` for the Google Workspace integration; structurally identical to `square-action.tsx`.                        | `Badge`, `Button`                                                                                                        | No layout classes.                                                                                                                                | None                                                                                                                               |

### 5. `src/app/(authenticated)/chat/_components` (5 files)

| File                     | Purpose                                                                                                                                                                                   | `ui` primitives used                                                                                                                                                                      | Layout                                                                                                                                                                                                                                                                                                                                                                                        | Raw-class bypasses |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `agent-message.tsx`      | Renders one chat message and all its parts: text, reasoning, tool calls, authorization requests, inline `Question` forms, and file/image attachments.                                     | `Alert`, `AlertDescription`, `AlertTitle`, `Badge`, `Button`, `Card`, `CardContent`; composes `Message*`, `Question*`, `Reasoning*`, `Tool*` from `ai-elements`                           | Attachment row: `flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground`; label block `min-w-0 flex-1`; option buttons `flex-col items-stretch`, `justify-start text-left`; badge/code row `flex flex-wrap items-center gap-2`; file-part card `flex items-center gap-3`.                                                                                | None               |
| `subagent-trace.tsx`     | Renders a subagent's own message trace inside a collapsible panel, with a failure `Alert` when the latest turn failed.                                                                    | `Alert`, `AlertDescription`, `AlertTitle`, `Badge`; composes `Shimmer` (`ai-elements`) and `AgentMessage`                                                                                 | `space-y-5 py-5` on the trace list.                                                                                                                                                                                                                                                                                                                                                           | None               |
| `subagent-panel.tsx`     | `Sheet`-based side panel listing active/completed subagent sessions, each expandable into its `SubagentTrace`, with usage stats and a live/eve-agent switch.                              | `Badge`, `Button`, `Card`, `CardContent`, `Field`, `FieldLabel`, `Switch`, `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` (names inferred from the `sheet` import group)            | Sheet content: `h-[85svh] w-full gap-0 p-0 sm:max-w-none` (mobile) and `max-h-full w-full gap-0 overflow-hidden`; list row header `flex h-14 shrink-0 items-center gap-3 border-b px-4`; scroll body `min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6`; empty state `type-supporting-body flex items-center p-2 text-muted-foreground`.                                                      | None               |
| `agent-chat.tsx`         | Top-level chat surface: streams `eve/react` messages into `Conversation`/`Message`, renders the `PromptInput` composer, wires up the `SubagentPanel`, and surfaces turn-failure `Alert`s. | `Alert`, `AlertDescription`, `AlertTitle`; composes `Conversation*`, `Message`, `MessageContent`, `PromptInput*`, `Shimmer` from `ai-elements`, plus local `AgentMessage`/`SubagentPanel` | Root: `relative flex h-full min-h-0 overflow-hidden bg-background text-foreground`; message column `relative flex min-w-0 flex-1 flex-col overflow-hidden`; scroll area `min-h-0 flex-1`; message list `mx-auto w-full max-w-3xl gap-6 px-4 pt-6 pb-36 sm:px-6` (page-container-style pattern); loading row `type-supporting-body mb-4 flex w-full items-center gap-2 text-muted-foreground`. | None               |
| `agent-message.test.tsx` | Vitest unit test: renders `AgentMessage` to static markup and asserts on turn-failure detection and message-part rendering. Not product UI.                                               | Imports the component under test only; no `ui` primitives used directly in the test.                                                                                                      | N/A (test file, no rendered layout of its own beyond what it asserts on).                                                                                                                                                                                                                                                                                                                     | None               |

### 6. `src/app/(authenticated)/admin/_components` (1 file)

| File              | Purpose                                                                                                                       | `ui` primitives used                            | Layout                                                                                                                                                                                                                   | Raw-class bypasses                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `admin-shell.tsx` | Shared admin page chrome: page title/description header plus a horizontal admin sub-nav (`next/link`, no `ui` nav primitive). | None (`Link` only; no `@/components/ui` import) | `mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8` (page container, matches DESIGN_SYSTEM.md §3.7 pattern); header `space-y-4 border-b border-border pb-5`; nav `flex flex-wrap gap-x-4 gap-y-2 type-label`. | None (`text-muted-foreground hover:text-foreground` on line 36 is semantic) |

### 7. `src/app/(authenticated)/admin/(overview)/_components` (1 file)

| File                     | Purpose                                                                                                                                                                           | `ui` primitives used                                                                                                        | Layout                                                                                                                                                                                                                                                          | Raw-class bypasses |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `overview-dashboard.tsx` | Admin overview: metric cards (workspaces/agents/identities/etc.), usage/webhook summary cards, and recent-audit / recent-agent-activity tables. Wraps everything in `AdminShell`. | `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | Metric grid `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`; two-card row `grid gap-6 lg:grid-cols-2`; audit list `divide-y divide-border`, rows `flex flex-wrap justify-between gap-x-4 gap-y-1 py-3`; summary list `space-y-2`, rows `flex justify-between gap-4`. | None               |

### 8. `src/app/(authenticated)/admin/usage/_components` (1 file)

| File              | Purpose                                                                                 | `ui` primitives used                                                      | Layout                                                          | Raw-class bypasses |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
| `usage-table.tsx` | Admin usage table: top-50 usage rows by workspace/kind/quantity. Wraps in `AdminShell`. | `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | No custom flex/grid layout beyond the `Table` primitive itself. | None               |

### 9. `src/app/(authenticated)/admin/workspaces/_components` (1 file)

| File                  | Purpose                                                                                                                   | `ui` primitives used                                                                                                                                                                        | Layout                                                                                                                                    | Raw-class bypasses |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `workspace-table.tsx` | Admin workspace table with lifecycle badges, a suspend/reactivate action, cursor pagination, and a confirmation `Dialog`. | `Badge`, `Button`, `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | No custom flex/grid beyond `Table` cells; workspace-name cell stacks `type-label` + `type-compact-code` divs with no extra spacing class. | None               |

### 10. `src/app/(authenticated)/admin/audit/_components` (1 file)

| File                  | Purpose                                                                                            | `ui` primitives used                                                                         | Layout                              | Raw-class bypasses |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------ |
| `audit-log-table.tsx` | Admin audit log table with a workspace-ID filter form and cursor pagination ("Load older events"). | `Button`, `Input`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | Filter form: `flex max-w-lg gap-2`. | None               |

### 11. `src/app/(authenticated)/admin/webhooks/_components` (1 file)

| File                     | Purpose                                                                                   | `ui` primitives used                                                                         | Layout                                                                              | Raw-class bypasses |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------ |
| `webhook-deliveries.tsx` | Admin webhook deliveries table plus a manual "Drain now" action and outcome-summary text. | `Badge`, `Button`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | Toolbar row `flex flex-wrap items-center gap-3`; endpoint cell `max-w-64 truncate`. | None               |

### 12. `src/app/(authenticated)/personal-info/_components` (1 file)

| File                     | Purpose                                                                                                                                            | `ui` primitives used                                                  | Layout                                                                                                                                                                                                                                                                                                                                                      | Raw-class bypasses |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `personal-info-form.tsx` | Full personal-info form (identity/contact + mailing address sections) used by browser autofill; saves via a single mutation with an error `Alert`. | `Alert`, `AlertDescription`, `AlertTitle`, `Button`, `Input`, `Label` | Page container `mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8` (matches DESIGN_SYSTEM.md §3.7 "Page container" pattern exactly); header block `space-y-2`; form `space-y-10`; each section `space-y-4` with a `grid gap-5 sm:grid-cols-2` field grid; footer row `flex items-center gap-3 border-t border-border/50 pt-6`. | None               |

### 13. `src/app/(authenticated)/vault/_components` (12 `.tsx` files; `setup.ts` excluded — not a component)

| File                  | Purpose                                                                                                                                                                                                            | `ui` primitives used                                                                                                                                                | Layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Raw-class bypasses |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `field.tsx`           | Shared labeled `Field`/`Input`/error/description wrapper (`FormField`) reused by every vault item form.                                                                                                            | `Field`, `FieldDescription`, `FieldError`, `FieldLabel`, `Input`                                                                                                    | No layout classes (single field).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | None               |
| `section.tsx`         | Shared vault "section" scaffolding: dialog open/view state hook, section trigger row, dialog content wrapper, back button, searchable item browser, and the item list/row (with favicon lookup and remove action). | `Button`, `Dialog`, `DialogContent`, `DialogTrigger`, `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `Label`                                                   | Trigger label block `min-w-0 flex-1`; dialog content view-dependent `grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden` or `no-scrollbar overflow-y-auto`; item list `divide-y divide-border/50`; item row `flex min-w-0 items-center gap-3 py-3`; search/list section `-mx-4 no-scrollbar min-h-0 overflow-y-auto px-4`; icon well `relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground` (variant of the DESIGN_SYSTEM.md "Row icon well" pattern). | None               |
| `other.tsx`           | Renders any vault items that don't fit the four typed categories (cards/contacts/addresses/logins), reusing `VaultItemList`.                                                                                       | None directly (composes local `VaultItemList` from `section.tsx`)                                                                                                   | `space-y-3` section wrapper; `border-y border-border/50` list frame.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | None               |
| `cards/index.tsx`     | Payment-card vault section: list/search view plus an "Add card" view, built on the shared `VaultSection*` scaffolding.                                                                                             | `Button`, `DialogDescription`, `DialogHeader`, `DialogTitle`                                                                                                        | `DialogHeader` gets `pr-10 sm:pr-6`; footer `flex justify-end gap-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | None               |
| `cards/form.tsx`      | Payment-card add form: Luhn-validated card number, expiration, CVC, billing ZIP, with live card-type `Badge`.                                                                                                      | `Badge`, `Button`, `DialogFooter`, `Field`, `FieldError`, `FieldGroup`, `FieldLabel`, `Input`                                                                       | Name/nickname row `grid gap-3 sm:grid-cols-2`; card-number row full width; expiration/CVC/ZIP row `grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1.4fr]`; field label row `flex items-center justify-between gap-2`.                                                                                                                                                                                                                                                                                                         | None               |
| `contacts/index.tsx`  | Contact-info vault section (list/add), same `VaultSection*` scaffolding as `cards/index.tsx`.                                                                                                                      | `Button`, `DialogDescription`, `DialogHeader`, `DialogTitle`                                                                                                        | Identical pattern to `cards/index.tsx`: `pr-10 sm:pr-6` header, `flex justify-end gap-2` footer.                                                                                                                                                                                                                                                                                                                                                                                                                            | None               |
| `contacts/form.tsx`   | Contact add form (name/full name/email/phone), each field optional but at least one required.                                                                                                                      | `Button`, `DialogFooter`, `FieldGroup`; composes shared `FormField`                                                                                                 | No `className` at all — layout comes entirely from `FieldGroup` spacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None               |
| `addresses/index.tsx` | Address vault section (list/add), same `VaultSection*` scaffolding.                                                                                                                                                | `Button`, `DialogDescription`, `DialogHeader`, `DialogTitle`                                                                                                        | Same `pr-10 sm:pr-6` / `flex justify-end gap-2` pattern.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None               |
| `addresses/form.tsx`  | Address add form (recipient, lines 1/2, city/region, postal/country).                                                                                                                                              | `Button`, `DialogFooter`, `FieldGroup`; composes shared `FormField`                                                                                                 | Name/recipient row `grid gap-3 sm:grid-cols-2`; city/region row `grid gap-3 sm:grid-cols-2`; postal/country row `grid grid-cols-[1fr_0.6fr] gap-3`.                                                                                                                                                                                                                                                                                                                                                                         | None               |
| `logins/index.tsx`    | Login vault section: list/add/import views, adds a "Bulk import" entry point to `ChromeImportPanel`.                                                                                                               | `Button`, `DialogDescription`, `DialogHeader`, `DialogTitle`                                                                                                        | Same `pr-10 sm:pr-6` / `flex justify-end gap-2` pattern; two-button footer.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None               |
| `logins/import.tsx`   | Chrome-CSV password import flow: file picker, in-browser CSV parsing, per-row validation/skip counting, and result `Alert`s.                                                                                       | `Alert`, `AlertDescription`, `AlertTitle`, `Button`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `Input`, `Label`                           | Step list `grid gap-5`, each step `grid gap-2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | None               |
| `logins/form.tsx`     | Login add form: website, identifier-type `Select` (email/phone/username), identifier, optional/required password depending on type.                                                                                | `Button`, `DialogFooter`, `Field`, `FieldGroup`, `FieldLabel`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`; composes shared `FormField` | Identifier-type + identifier row: `grid gap-3 sm:grid-cols-[0.8fr_1.4fr]` (or `undefined`/stacked when the type is fixed by setup); `SelectTrigger` gets `w-full`.                                                                                                                                                                                                                                                                                                                                                          | None               |

### 14. `src/app/(authenticated)/tasks/(overview)/_components` (1 file)

| File                | Purpose                                                                                                               | `ui` primitives used                                                                                                      | Layout                                                                                                                                                                                                     | Raw-class bypasses |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `trace-history.tsx` | Paginated table of browser-worker trace runs (status, duration, domains, result, started time) with a refresh action. | `Alert`, `AlertDescription`, `Badge`, `Button`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` | Section `grid gap-4`; toolbar `flex flex-wrap items-center justify-end gap-x-5 gap-y-2 type-label`; `Table` gets `table-fixed` with per-column `w-[N%]` widths; "load older" button `justify-self-center`. | None               |

### 15. `src/app/(authenticated)/tasks/[sessionId]/_components` (1 file)

| File                 | Purpose                                                                                                            | `ui` primitives used | Layout                                    | Raw-class bypasses |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- | ----------------------------------------- | ------------------ |
| `refresh-button.tsx` | Small refresh action button that triggers `router.refresh()` inside a transition and spins its icon while pending. | `Button`             | No layout classes (single inline button). | None               |

## Summary

**Files covered per folder (15 folders):**

1. `src/app/_components` — 1
2. `src/app/(authenticated)/_components` — 2
3. `src/app/sign-in/_components` — 3
4. `src/app/(authenticated)/(workspace)/_components` — 3
5. `src/app/(authenticated)/chat/_components` — 5
6. `src/app/(authenticated)/admin/_components` — 1
7. `src/app/(authenticated)/admin/(overview)/_components` — 1
8. `src/app/(authenticated)/admin/usage/_components` — 1
9. `src/app/(authenticated)/admin/workspaces/_components` — 1
10. `src/app/(authenticated)/admin/audit/_components` — 1
11. `src/app/(authenticated)/admin/webhooks/_components` — 1
12. `src/app/(authenticated)/personal-info/_components` — 1
13. `src/app/(authenticated)/vault/_components` — 12 (`.tsx` files; `setup.ts` excluded as non-component)
14. `src/app/(authenticated)/tasks/(overview)/_components` — 1
15. `src/app/(authenticated)/tasks/[sessionId]/_components` — 1

Total `.tsx` files read: 35.

**Raw-class bypass flags found across all 15 folders: 0.**

Every file in these `_components` folders uses only semantic color tokens
(`text-muted-foreground`, `bg-muted`, `border-border`, `text-destructive`,
etc.), `type-*` typography utilities, or plain layout/spacing utilities
(flex, grid, gap, padding, margin, width) with no raw palette colors, hex
codes, or raw text-size/font-weight classes. This differs from
DESIGN_SYSTEM.md §8 item 4, which flags `text-sm`/`text-xs`/`font-medium`
bypasses — but those are in `src/components/ui/sidebar.tsx` and
`src/components/ai-elements/question.tsx` / `conversation.tsx`, which are
primitive/composed-component source files, not inside any of the 15
`_components` folders scoped for this task.

## 4. Pages and Layouts

Design-token source of truth: `docs/DESIGN_SYSTEM.md` (read first; page-container
and page-header patterns quoted below match its section 3.7).

### `src/app/layout.tsx` (root layout)

- Container: none — renders `<html lang="en"><body data-workspace-id={...}>`
  directly. No max-width/padding/background classes (background comes from
  the base layer's `bg-background text-foreground` on `body`, per design doc
  section 3.3).
- Headings: none.
- Renders: `QueryProvider` (`@/app/_providers/query-provider`), `TooltipProvider`
  (`@/components/ui/tooltip`), `{children}`. Resolves `accessScopeForUser`
  (`@/lib/access-scope`), `getAuthSession` (`@/auth/session`).

### `src/app/sign-in/page.tsx`

- Container: `<main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 text-foreground">`
  wrapping a `max-w-5xl` responsive grid. The grid keeps Jory above the login
  card below `lg` and places Jory beside the card at `lg` and above.
- Headings: `h1.type-hero` "Hey, Jory"; supporting text
  `p.type-supporting-body.text-muted-foreground`.
- Renders (conditionally, based on `localPhoneAuthBypassEnabled` /
  `env.LINQ_CONNECTOR`): `PhoneOtpAuthForm` (`./_components/otp-form`) in
  development-code or live-Linq mode, or a plain fallback paragraph. The local
  mode still has separate phone-number and verification-code steps and names
  the development code `000000`. Imports `env`, `localPhoneAuthBypassEnabled` (`@/env`),
  `getAuthSession` (`@/auth/session`), `readLinqOnboardingPhoneNumber`
  (`@/auth/linq`), and the Jory mascot through `next/image`.

### `src/app/(authenticated)/layout.tsx`

- Container: no direct page container; establishes the app shell —
  `SidebarProvider` > (`Sidebar` + `SidebarInset className="h-svh overflow-y-auto"`).
- Headings: none directly (product name "OpenInstinct" as plain text next to
  `Logo` in the sidebar header, not a `type-*` heading class).
- Renders: `Logo` (`@/components/ui/logo`); `Sidebar`, `SidebarContent`,
  `SidebarFooter`, `SidebarHeader`, `SidebarInset`, `SidebarMenu`,
  `SidebarMenuButton`, `SidebarMenuItem`, `SidebarProvider`
  (`@/components/ui/sidebar`); `TRPCProvider` (`@/trpc/client`);
  `AuthenticatedAccountControl` (`./_components/account-control`);
  `AuthenticatedMobileHeader`, `AuthenticatedNavigation`
  (`./_components/authenticated-navigation`). Auth/authorization via
  `requireRequestScope`, `UnauthenticatedError` (`@/lib/request-scope`),
  `isAdmin` (`@/lib/admin`).

### `src/app/(authenticated)/(workspace)/page.tsx` (workspace home)

- Container: `<div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">`
  — the canonical "Page container" pattern from design doc 3.7.
- Headings: `h1.sr-only` "Workspace" (screen-reader only — no visible page
  title); each section uses the "Section" pattern: `<section aria-labelledby><h2 className="type-section-title">`
  for "Channels", "Connections", "Infrastructure".
- Renders directly: `Alert`, `AlertDescription`, `AlertTitle`
  (`@/components/ui/alert`), `Badge` (`@/components/ui/badge`), `Button`
  (`@/components/ui/button`); local `GoogleWorkspaceAction`
  (`./_components/google-workspace-action`), `ModelSelector`
  (`./_components/model-selector`), `SquareAction`
  (`./_components/square-action`); locally-defined helper components in the
  same file: `ChannelsSection`, `ConnectionsSection`, `WorkspaceSection`,
  `ConnectorRow`. Data via `getGatewayModel` (`@/db/services/settings`),
  `@vercel/connect` token helpers, `googleWorkspaceTokenParams`
  (`@/lib/google-workspace`), `squareTokenParams` (`@/lib/square`).

### `src/app/(authenticated)/chat/(new)/page.tsx` (chat, new)

- Container: none of its own — delegates entirely to `AgentChat`.
- Headings: none in the page file itself (see `AgentChat` for the
  `h1.type-product-title` rendered when no conversation has started).
- Renders: `AgentChat` (`../_components/agent-chat`) with `sessionless`.

### `src/app/(authenticated)/chat/[sessionId]/page.tsx` (chat, existing session)

- Container: none of its own — delegates to `ChatSession`.
- Headings: none in the page file.
- Renders: `ChatSession` (`./_components/chat-session`) with `initialUsage`,
  `sessionId`, and the server-evaluated `developerActivity` feature flag. The
  chat Activity panel is absent when the flag is off. Data via `readChat`
  (`@/db/services/chats`), `requireRequestScope` (`@/lib/request-scope`), and
  `isFeatureEnabled` (`@/env`).

### `src/app/(authenticated)/chat/history/page.tsx`

- Container: `<div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">`.
- Headings: `header` with `h1.type-page-title` "All chats" and
  `p.type-supporting-body.mt-1.text-muted-foreground` showing total usage —
  the "Page header" pattern from design doc 3.7.
- Renders: `Alert`, `AlertDescription` (`@/components/ui/alert`), `Button`
  (`@/components/ui/button`), `MessageSquareIcon`, `PlusIcon`
  (`lucide-react`). Each chat row is a `Button` (`variant="surface"`)
  wrapping a `Link`. Data via `listChats` (`@/db/services/chats`),
  `combineChatUsage`/`formatChatUsage` (`@/app/(authenticated)/chat/_lib/chat-usage`).

### `src/app/(authenticated)/admin/layout.tsx`

- Container: none — pure auth gate (`requireAdminScope`, `AdminNotFoundError`
  from `@/lib/admin`; `notFound()` from `next/navigation`). Renders
  `{children}` only.
- Headings: none.

### `src/app/(authenticated)/admin/(overview)/page.tsx`

- Container: page file itself renders no container; delegates to
  `OverviewDashboard`, which wraps its content in the shared `AdminShell`
  (`../../_components/admin-shell.tsx`) — container
  `<div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">`.
- Headings: `AdminShell` renders `h1.type-page-title` (title prop) and
  `p.type-supporting-body.mt-1.text-muted-foreground` (description), plus an
  admin sub-`nav` (`type-label`, links to Overview/Workspaces/Audit
  log/Webhooks/Usage). `OverviewDashboard` itself renders `CardTitle`
  (`type-section-title`) for its two panel titles.
- Renders: `OverviewDashboard` (`./_components/overview-dashboard`), which
  imports `Card`, `CardContent`, `CardHeader`, `CardTitle`
  (`@/components/ui/card`), `Table`/`TableBody`/`TableCell`/`TableHead`/
  `TableHeader`/`TableRow` (`@/components/ui/table`), `AdminShell`
  (`../../_components/admin-shell`), data via `api.admin.overview.useQuery()`
  and `api.admin.sessionsActivity.useQuery()` (`@/trpc/client`).

### `src/app/(authenticated)/admin/usage/page.tsx`

- Container: `AdminShell` (title "Usage", description "Usage aggregates by
  workspace and recorded usage kind. Top 50 by volume.").
- Headings: from `AdminShell` (`h1.type-page-title`).
- Renders: `UsageTable` (`./_components/usage-table`), which imports
  `Table`/... (`@/components/ui/table`) and `AdminShell`.

### `src/app/(authenticated)/admin/workspaces/page.tsx`

- Container: `AdminShell` (title "Workspaces", description "Workspace
  lifecycle, membership, and this month's model token use.").
- Headings: from `AdminShell`.
- Renders: `WorkspaceTable` (`./_components/workspace-table`), which imports
  `Badge`, `Button`, `Dialog`/`DialogContent`/... (`@/components/ui/dialog`),
  `Table`/... (`@/components/ui/table`), and `AdminShell`.

### `src/app/(authenticated)/admin/audit/page.tsx`

- Container: `AdminShell` (title "Audit log", description "Append-only
  operational audit events across all workspaces.").
- Headings: from `AdminShell`.
- Renders: `AuditLogTable` (`./_components/audit-log-table`), which imports
  `Button`, `Input` (`@/components/ui/input`), `Table`/..., and `AdminShell`.

### `src/app/(authenticated)/admin/webhooks/page.tsx`

- Container: `AdminShell` (title "Webhooks", description "Recent delivery
  attempts and a controlled manual delivery drain.").
- Headings: from `AdminShell`.
- Renders: `WebhookDeliveries` (`./_components/webhook-deliveries`), which
  imports `Badge`, `Button`, `Table`/..., and `AdminShell`.

### `src/app/(authenticated)/personal-info/page.tsx`

- Container: none in the page file — delegates to `PersonalInfoForm`, whose
  internal container was not deep-read (owned by another agent), but the top
  of that file shows `h1.type-page-title` "Personal info" and
  `h2.type-label` section headings ("identity-heading", "address-heading").
- Renders: `PersonalInfoForm` (`./_components/personal-info-form`), which
  imports `Alert`/`AlertDescription`/`AlertTitle` (`@/components/ui/alert`),
  `Button`, `Input`, `Label` (`@/components/ui/label`). Data via
  `readUserProfile` (`@/db/services/user-profile`), `requireRequestScope`.

### `src/app/(authenticated)/vault/page.tsx`

- Container: `<div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">`.
- Headings: `h1.type-page-title` "Vault"; each sub-section
  (`VaultOtherItems`) uses `h2.type-section-title` (id `other-vault-heading`)
  — same pattern likely repeated in the other kind sections (`VaultLogins`,
  `VaultCards`, `VaultAddresses`, `VaultContacts`), not deep-read here.
- Renders: `VaultAddresses` (`./_components/addresses`), `VaultCards`
  (`./_components/cards`), `VaultContacts` (`./_components/contacts`),
  `VaultLogins` (`./_components/logins`), `VaultOtherItems`
  (`./_components/other`). Data via `readVaultItems`
  (`@/db/services/vault`), items grouped by `kind` with `Object.groupBy`.
  Vault local components dir also holds shared `field.tsx`, `section.tsx`
  (exports `useVaultSection`, `VaultSection`, `VaultSectionTrigger`,
  `VaultSectionContent`, `VaultSectionBackButton`, `VaultItemBrowser`,
  `VaultItemList` — a shared dialog/list-browser primitive used across the
  four item-kind folders), and `setup.ts`.

### `src/app/(authenticated)/tasks/(overview)/page.tsx` (tasks overview)

- Container: `<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:p-8">`
  (wider than the standard 4xl container — this route uses a table-heavy
  7xl width).
- Headings: `header.flex.flex-col.gap-4.sm:flex-row...` with
  `h1.type-page-title` "Browser traces" and
  `p.type-supporting-body.mt-2.text-muted-foreground` description.
- Renders: `Button` (`@/components/ui/button`), `MessageSquareIcon`
  (`lucide-react`, used as `data-icon="inline-end"`), `TraceHistory`
  (`./_components/trace-history`). Data via `listBrowserTraces`
  (`@/db/services/browser-traces`), `requireRequestScope`.

### `src/app/(authenticated)/tasks/[sessionId]/page.tsx` (task detail)

- Container: `<div className="flex w-full flex-col gap-6 px-4 py-6 sm:p-8">`
  (no `mx-auto`/`max-w-*` — full width, unlike the other detail pages).
- Headings: `header` containing a back `Button` ("All traces"), then
  `h1.truncate.type-card-title` (the trace's task text, NOT `type-page-title`
  — this page uses the smaller card-title scale for its h1), next to a
  status `Badge`.
- Renders: `ArrowLeftIcon` (`lucide-react`), `Badge`, `Button`,
  `ActivityDurationBreakdown` (`@/components/browser/activity-duration-breakdown`,
  the color-legend component named in design doc section 5), `Table`/
  `TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow`
  (`@/components/ui/table`), `RefreshButton` (`./_components/refresh-button`).
  Data via `listBrowserTraceEvents`, `readBrowserTrace`
  (`@/db/services/browser-traces`), `browserTraceActivityDurations`
  (`@/lib/browser-activity`). Uses a local `statusText` map to pick `Badge`
  variant (`secondary`/`destructive`/`warning`/`information`/`success`) from
  a `zod`-validated `trace.status`.

### Route map

| Route                | Components rendered (layout chain -> page -> key composed components)                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/sign-in`           | `RootLayout` -> `SignInPage` -> `PhoneOtpAuthForm`                                                                                                                                                        |
| `/` (workspace home) | `RootLayout` -> `AuthenticatedLayout` (Sidebar shell) -> `Page` -> `ChannelsSection`, `ConnectionsSection` (`GoogleWorkspaceAction`, `SquareAction`), `WorkspaceSection`/`ConnectorRow` (`ModelSelector`) |
| `/chat` (new)        | `RootLayout` -> `AuthenticatedLayout` -> `NewChatPage` -> `AgentChat` (`sessionless`)                                                                                                                     |
| `/chat/[sessionId]`  | `RootLayout` -> `AuthenticatedLayout` -> `ChatSessionPage` -> `ChatSession` -> optional `SubagentPanel` (`developerActivity`)                                                                             |
| `/chat/history`      | `RootLayout` -> `AuthenticatedLayout` -> `AllChatsPage` -> chat row `Button`s, `Alert` (empty state)                                                                                                      |
| `/admin` (overview)  | `RootLayout` -> `AuthenticatedLayout` -> `AdminLayout` -> `AdminOverviewPage` -> `OverviewDashboard` (`AdminShell`, `Card`/`Table`)                                                                       |
| `/admin/usage`       | ... -> `AdminLayout` -> `AdminUsagePage` -> `UsageTable` (`AdminShell`, `Table`)                                                                                                                          |
| `/admin/workspaces`  | ... -> `AdminLayout` -> `AdminWorkspacesPage` -> `WorkspaceTable` (`AdminShell`, `Table`, `Dialog`)                                                                                                       |
| `/admin/audit`       | ... -> `AdminLayout` -> `AdminAuditPage` -> `AuditLogTable` (`AdminShell`, `Table`, `Input`)                                                                                                              |
| `/admin/webhooks`    | ... -> `AdminLayout` -> `AdminWebhooksPage` -> `WebhookDeliveries` (`AdminShell`, `Table`, `Badge`)                                                                                                       |
| `/personal-info`     | `RootLayout` -> `AuthenticatedLayout` -> `Page` -> `PersonalInfoForm`                                                                                                                                     |
| `/vault`             | `RootLayout` -> `AuthenticatedLayout` -> `Page` -> `VaultLogins`, `VaultCards`, `VaultAddresses`, `VaultContacts`, `VaultOtherItems`                                                                      |
| `/tasks` (overview)  | `RootLayout` -> `AuthenticatedLayout` -> `TasksPage` -> `TraceHistory`                                                                                                                                    |
| `/tasks/[sessionId]` | `RootLayout` -> `AuthenticatedLayout` -> `TraceDetailPage` -> `ActivityDurationBreakdown`, `Table`, `RefreshButton`                                                                                       |

## 5. Screen Compositions

### Sign-in page

- `main` centered container (`min-h-svh`, `bg-background`)
- Responsive grid with Jory above the card below `lg` and beside it from `lg`
- `h1.type-hero` "Hey, Jory"
- `p.type-supporting-body` describing the phone-code flow
- One of, based on config:
  - Unconfigured-state text ("iMessage sign-in is not configured...")
  - `PhoneOtpAuthForm` in local mode with a visible `000000` development-code
    notice and separate request/verify steps
  - `PhoneOtpAuthForm` in live mode with the Linq setup alert, `Field` group,
    `Input`, `Button`, and `MessageSquareIcon`

### Workspace home

- Sidebar app shell (see Application shell, design doc section 6): `Sidebar`
  (`Logo` + "OpenInstinct" header, `AuthenticatedNavigation` nav items,
  `AuthenticatedAccountControl` footer) + mobile header on small screens
- Page container (`max-w-4xl`)
- `h1.sr-only` "Workspace" (no visible title)
- Conditional `Alert`s for "Google Workspace unavailable" / "Square
  unavailable" (query-param driven)
- Section "Channels" (`h2.type-section-title`): grid of `Button
variant="surface"` tiles — WebChat (`MessageSquareIcon`), iMessage
  (`MailIcon`), each disabled when not ready; a `type-caption` availability
  message below
- Section "Connections" (`h2.type-section-title`): `ConnectorRow` list
  (icon well, label, description, `GoogleWorkspaceAction`/`SquareAction`)
  for Google Workspace and Square
- Section "Infrastructure" (`h2.type-section-title`): `ConnectorRow` list for
  Kernel browser (`Badge` "Connected"), Vercel Blob (`Badge`), AI Gateway
  model (`ModelSelector`)

### Chat (new)

- Sidebar app shell
- `AgentChat` in "no conversation yet" layout: centered column
  (`max-w-xl`), `h1.type-product-title` "Local Vault Assistant", composer
  below (`PromptInput`/`PromptInputBody`/`PromptInputFooter`/
  `PromptInputTextarea`/`PromptInputTools`/`PromptInputSubmit`)
- Optional `SubagentPanel` (sheet/panel rendered alongside; trace-view toggle),
  controlled by the server-side `developerActivity` feature. Its Activity card
  uses a compact, capsule-shaped task-row presentation adapted from Beautiful
  UI while retaining the local `Button`, `Badge`, semantic tokens, and real
  subagent state.

### Chat history

- Sidebar app shell
- Page container (`max-w-4xl`)
- `header`: `h1.type-page-title` "All chats" + usage summary text (left),
  "New chat" `Button` with `PlusIcon` (right)
- `section aria-label="Chat history"`: either an `Alert` empty state
  ("No chats yet.") or a list of `Button variant="surface"` rows, each with
  `MessageSquareIcon`, chat title, usage summary, and a formatted `time`

### Tasks overview

- Sidebar app shell
- Wide page container (`max-w-7xl`)
- `header`: `h1.type-page-title` "Browser traces" + description (left),
  "Open chat" outline `Button` with trailing `MessageSquareIcon` (right)
- `TraceHistory` (table/list of trace rows; not deep-read, owned by another
  agent, but page-level imports show `RefreshCwIcon`, `Alert`, `Badge`,
  `Button`, `Table`)

### Task detail

- Sidebar app shell
- Full-width container (no `max-w-*`)
- `header`: back `Button` ("All traces", `ArrowLeftIcon`), then title row
  with `h1.type-card-title` (trace task text, truncated) + status `Badge`,
  then a `type-supporting-body` metadata line (duration, start time,
  domains), optional result-message line, and `ActivityDurationBreakdown`
  (color legend for activity kinds)
- `section aria-label="Trace events"`: right-aligned event count +
  `RefreshButton`, then a `Table` of trace events (Time / Event / Detail
  columns), with an empty-state row when there are no events

### Vault

- Sidebar app shell
- Page container (`max-w-4xl`)
- `h1.type-page-title` "Vault"
- `VaultLogins`, `VaultCards`, `VaultAddresses`, `VaultContacts` sections (one
  per vault item kind — each presumably a `VaultSection` with its own
  `h2.type-section-title`, per the shared `section.tsx` primitives, not
  deep-read here)
- `VaultOtherItems` section (`h2.type-section-title` id `other-vault-heading`)
  for identity/phone/token kinds

### Personal info

- Sidebar app shell
- `PersonalInfoForm`: `h1.type-page-title` "Personal info", then form
  sections with `h2.type-label` headings ("identity-heading",
  "address-heading"); imports `Alert`/`AlertDescription`/`AlertTitle`,
  `Button`, `Input`, `Label`

### Admin overview

- Sidebar app shell (with Admin nav group visible for admins:
  Overview/Workspaces/Audit log/Webhooks/Usage, each with its own icon)
- `AdminShell` wrapper: `max-w-6xl` container, `header` with
  `h1.type-page-title` "Admin overview" + description, admin sub-`nav`
  (Overview/Workspaces/Audit log/Webhooks/Usage links)
- Two `Card`s with `CardHeader`/`CardTitle` (`type-section-title`) and
  `CardContent`: metrics (Workspaces, Agents, Verified phone identities,
  Active conversations, Active API credentials, Webhook endpoints) and a
  recent-sessions-activity `Table`

### Admin usage

- Sidebar app shell + Admin nav group
- `AdminShell` (title "Usage", description "Usage aggregates by workspace
  and recorded usage kind. Top 50 by volume.")
- `Table` of usage rows (not deep-read; owned by another agent)

### Admin workspaces

- Sidebar app shell + Admin nav group
- `AdminShell` (title "Workspaces", description "Workspace lifecycle,
  membership, and this month's model token use.")
- `Table` of workspace rows with `Badge` (lifecycle state) and row actions
  (`Button`), and a `Dialog` (likely for a detail/edit flow — not deep-read)

### Admin audit

- Sidebar app shell + Admin nav group
- `AdminShell` (title "Audit log", description "Append-only operational
  audit events across all workspaces.")
- `Input` (filter/search) + `Button`, then a `Table` of audit events

### Admin webhooks

- Sidebar app shell + Admin nav group
- `AdminShell` (title "Webhooks", description "Recent delivery attempts and
  a controlled manual delivery drain.")
- `Table` of delivery rows with `Badge` (delivery status) and `Button`
  (manual drain action)

## A. Restyle checklist

One line per primitive/composed component: what a Jory restyle would touch vs. what is structural (layout, composition, base-ui behavior, data plumbing — unchanged by a visual reskin).

### Primitives (src/components/ui)

| Component           | Restyle touches                                                                                                                                                         | Structural (unchanged)                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Button              | background/text/border tokens per variant, radius (`rounded-lg`, `rounded-xl` on `surface`), shadow on `surface`, hover/active state colors, icon size defaults         | cva variant/size axis, base-ui `render` polymorphism, `active:translate-y-px` press motion, disabled pointer-events logic |
| Badge               | background/text/border token per variant, radius, `type-label`/`type-caption` sizing                                                                                    | data-slot, polymorphic render prop                                                                                        |
| Alert               | background/border/text tokens per tone (`destructive`/`information`/`success`/`warning` + `-border`/`-subtle`), radius                                                  | icon slot layout, grid structure                                                                                          |
| Card                | background, border, radius, shadow (if any)                                                                                                                             | header/content/footer slot structure                                                                                      |
| Input / Textarea    | border/background/text tokens, radius, focus ring color, `type-input` sizing                                                                                            | native form semantics, disabled/invalid state wiring                                                                      |
| Label               | `type-label` type role only                                                                                                                                             | htmlFor association                                                                                                       |
| Select              | trigger/content background, border, radius, hover/selected item background                                                                                              | base-ui Select primitive behavior, portal/positioning                                                                     |
| Command             | background, border, radius, selected-item background                                                                                                                    | cmdk filtering/keyboard nav                                                                                               |
| Dialog / Sheet      | overlay color/opacity, panel background, radius, shadow, `duration-*` transition value                                                                                  | base-ui portal, focus trap, open/close state                                                                              |
| DropdownMenu        | panel background, border, radius, item hover background, shadow                                                                                                         | base-ui menu behavior, keyboard nav                                                                                       |
| HoverCard / Tooltip | panel background, border, radius, shadow, `duration-*`                                                                                                                  | base-ui positioning/trigger logic                                                                                         |
| Field               | label/description type roles, error text color                                                                                                                          | fieldset/legend structure, validation wiring                                                                              |
| InputGroup          | border, radius, addon background                                                                                                                                        | slot composition (leading/trailing addons)                                                                                |
| Separator           | border/background color, thickness                                                                                                                                      | orientation logic                                                                                                         |
| Sidebar             | background, border, hover/active item background, radius (currently raw `rounded-md`, a gap), `text-sm`/`text-xs`/`font-medium` (raw — flagged, should become `type-*`) | collapsible width/state machine, group structure, keyboard shortcuts                                                      |
| Skeleton            | background/shimmer color, radius                                                                                                                                        | animation timing                                                                                                          |
| Spinner             | stroke color, size                                                                                                                                                      | rotation animation                                                                                                        |
| Switch              | track/thumb background per state, radius (pill)                                                                                                                         | base-ui Switch state machine                                                                                              |
| Table               | header/row background, border, hover row background, `type-*` for cells                                                                                                 | column/row structure                                                                                                      |
| Collapsible         | none (unstyled pass-through)                                                                                                                                            | open/close state                                                                                                          |
| Logo                | fill color                                                                                                                                                              | SVG paths                                                                                                                 |
| ButtonGroup         | border between buttons, radius on end buttons                                                                                                                           | grouping/orientation logic                                                                                                |

### Composed components (ai-elements, browser, _components)

| Component group                                                                                       | Restyle touches                                                                                                                                                                                                                          | Structural (unchanged)                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ai-elements (question, reasoning, tool, model-selector, shimmer, prompt-input, conversation, message) | the flagged raw `text-sm`/`font-medium` in question.tsx and conversation.tsx (should move to `type-*`), shimmer gradient colors, streaming/loading state colors                                                                          | streamdown markdown rendering, message role branching, tool-call state machine |
| browser/activity-duration-breakdown                                                                   | all 9 raw category colors (`bg-violet-500` etc.) — needs a real categorical token set, not ad hoc palette classes                                                                                                                        | duration calculation/aggregation logic                                         |
| _components (35 files, 15 folders)                                                                    | none found bypassing tokens — restyle is inherited automatically from the primitives and `type-*` classes they compose; only each file's own layout spacing (gap/padding utilities) is a restyle-adjacent choice, not a hard requirement | data fetching, route params, business logic, primitive composition itself      |

## B. Count table

| Item                                                 | Count                                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI primitives (`src/components/ui/*.tsx`)            | 25                                                                                                                                                                                  |
| Primitive variant/size spec rows produced            | ~140                                                                                                                                                                                |
| ai-elements + browser composed components documented | 9 files / 62 exported components                                                                                                                                                    |
| Composed components under `_components` folders      | 35 files across 15 folders                                                                                                                                                          |
| Route-level `page.tsx`/`layout.tsx` files            | 17                                                                                                                                                                                  |
| Named screens documented as compositions             | 13 (sign-in, workspace home, chat new, chat history, tasks overview, task detail, vault, personal info, admin overview, admin usage, admin workspaces, admin audit, admin webhooks) |

## C. Raw Tailwind classes that bypass tokens (file:line)

Found by `grep -rnE` over `src/app` and `src/components` for raw palette colors (`text-`/`bg-`/`border-{gray,red,blue,...}-N`), raw text-size classes (`text-xs`...`text-3xl`), raw font-weight classes, and hex codes — excluding test files.

1. `src/app/icon.tsx:16` — `background: "#f5f3ed"` (favicon generator, not product UI)
2. `src/app/icon.tsx:24` — `color="#deddd7"` (favicon generator, not product UI)
3. `src/components/ui/sidebar.tsx:417` — `text-xs font-medium`
4. `src/components/ui/sidebar.tsx:463` — `text-sm`
5. `src/components/ui/sidebar.tsx:492` — `text-sm` ... `data-active:font-medium`
6. `src/components/ui/sidebar.tsx:501` — `text-sm` (size variant `default`)
7. `src/components/ui/sidebar.tsx:502` — `text-xs` (size variant `sm`)
8. `src/components/ui/sidebar.tsx:503` — `text-sm` (size variant `lg`)
9. `src/components/ui/sidebar.tsx:606` — `text-xs font-medium`
10. `src/components/ui/sidebar.tsx:697` — `text-sm`/`text-xs` (data-size variants)
11. `src/components/ai-elements/question.tsx:192` — `font-medium text-sm`
12. `src/components/ai-elements/question.tsx:201` — `text-sm`
13. `src/components/ai-elements/shimmer.tsx:37` — inline gradient using `#0000` (transparent) stops, not a semantic color token
14. `src/components/browser/activity-duration-breakdown.tsx:11` — `bg-violet-500`
15. `src/components/browser/activity-duration-breakdown.tsx:12` — `bg-cyan-500`
16. `src/components/browser/activity-duration-breakdown.tsx:13` — `bg-blue-500`
17. `src/components/browser/activity-duration-breakdown.tsx:14` — `bg-fuchsia-500`
18. `src/components/browser/activity-duration-breakdown.tsx:15` — `bg-emerald-500`
19. `src/components/browser/activity-duration-breakdown.tsx:16` — `bg-amber-500`
20. `src/components/browser/activity-duration-breakdown.tsx:17` — `bg-slate-400`
21. `src/components/browser/activity-duration-breakdown.tsx:18` — `bg-orange-400`
22. `src/components/browser/activity-duration-breakdown.tsx:19` — `bg-zinc-400`
23. `src/components/ai-elements/conversation.tsx:186` — `text-sm font-medium`
24. `src/components/ai-elements/conversation.tsx:188` — `text-sm`

Sidebar (items 3-10) and question.tsx/conversation.tsx (11-12, 23-24) match the known gap already logged in `docs/DESIGN_SYSTEM.md` section 8. The `activity-duration-breakdown.tsx` 9-color legend (items 14-22) is not currently listed there; no existing semantic token set (the 5 `chart-*` tokens) covers all 9 categories it needs. No bypasses were found anywhere in the 15 `_components` folders (35 files) — those compose primitives and `type-*` classes only.
