# Jory Design System

Source of truth: `src/app/globals.css` `@theme` block (derived from `colors_and_type.css`).
TypeScript mirror: `src/lib/design-tokens.ts`.

## Colors

| Token       | CSS var               | Value     | Usage                            |
| ----------- | --------------------- | --------- | -------------------------------- |
| bg          | `--color-bg`          | `#FAF7F0` | Page background (warm off-white) |
| ink         | `--color-ink`         | `#071B36` | Primary text (deep navy)         |
| ink-2       | `--color-ink-2`       | `#16233B` | Secondary text                   |
| muted       | `--color-muted`       | `#E6E6E6` | Dividers, borders                |
| muted-ink   | `--color-muted-ink`   | `#5A6A82` | Muted body text                  |
| jory-j      | `--color-jory-j`      | `#4434E8` | JORY wordmark "J"                |
| jory-o      | `--color-jory-o`      | `#F7B313` | JORY wordmark "O"                |
| jory-r      | `--color-jory-r`      | `#7467E8` | JORY wordmark "R"                |
| jory-y      | `--color-jory-y`      | `#FF5A32` | JORY wordmark "Y"                |
| mustard     | `--color-mustard`     | `#D4A72C` | Mono wordmark fill               |
| cta         | `--color-cta`         | `#061A33` | Button background                |
| cta-hover   | `--color-cta-hover`   | `#0F2A4D` | Button hover                     |
| soft-purple | `--color-soft-purple` | `#EDE8FF` | Feature tints                    |
| soft-yellow | `--color-soft-yellow` | `#FFF1CF` | Feature tints                    |
| soft-green  | `--color-soft-green`  | `#E9F8E8` | Feature tints                    |
| soft-red    | `--color-soft-red`    | `#FFE7DF` | Feature tints                    |
| bubble-user | `--color-bubble-user` | `#F1F5F9` | User chat bubble                 |
| bubble-jory | `--color-bubble-jory` | `#E0E7FF` | Jory chat bubble                 |

## Type Scale

| Name    | Size  | Weight | Usage                  |
| ------- | ----- | ------ | ---------------------- |
| display | 96px  | 800    | Large section displays |
| hero    | 240px | 900    | JORY wordmark          |
| h1      | 56px  | 800    | Page title             |
| h2      | 36px  | 800    | Section headings       |
| h3      | 24px  | 700    | Card headings          |
| body-lg | 20px  | 400    | Large body copy        |
| body    | 16px  | 400    | Default text           |
| caption | 14px  | 400    | Captions               |
| micro   | 12px  | 600    | Eyebrows, labels       |

Font family: **Inter Tight** (loaded via `next/font/google`)

## Spacing (8px base)

| Token | Value | CSS var                                   |
| ----- | ----- | ----------------------------------------- |
| s1    | 4px   | `--spacing-s1`                            |
| s2    | 8px   | `--spacing-s2`                            |
| s3    | 12px  | `--spacing-s3`                            |
| s4    | 16px  | `--spacing-s4`                            |
| s5    | 24px  | `--spacing-s5`                            |
| s6    | 32px  | `--spacing-s6`                            |
| s7    | 48px  | `--spacing-s7`                            |
| s8    | 64px  | `--spacing-s8`                            |
| s9    | 96px  | `--spacing-s9` (canonical section rhythm) |
| s10   | 128px | `--spacing-s10`                           |

Container: 1200px. Gutter: 24px.

## Radii

| Name   | Value | Usage        |
| ------ | ----- | ------------ |
| input  | 12px  | Form inputs  |
| card   | 16px  | Cards        |
| bubble | 18px  | Chat bubbles |
| pill   | 999px | Buttons      |

## Shadows

| Name       | Value                            | Usage             |
| ---------- | -------------------------------- | ----------------- |
| card       | `0 2px 10px rgba(0,0,0,0.04)`    | Default card      |
| card-hover | `0 6px 20px rgba(0,0,0,0.06)`    | Hovered card      |
| float      | `0 12px 40px rgba(7,27,54,0.10)` | Floating elements |

## Motion

| Token | Value                            |
| ----- | -------------------------------- |
| fast  | 120ms                            |
| base  | 180ms                            |
| slow  | 280ms                            |
| ease  | `cubic-bezier(0.2, 0.7, 0.2, 1)` |

## Extending the design system

1. Add a new CSS custom property in `src/app/globals.css` under `@theme`.
2. Mirror it in `src/lib/design-tokens.ts` for TypeScript consumers.
3. Use `bg-[var(--color-foo)]` or the Tailwind utility class if you added a `--color-` token.
4. Follow the existing naming conventions (kebab-case in CSS, camelCase in TS).
