# Design canvas

`design-system.pen` is a Pencil document. Open it with the Pen desktop app or
the Pencil MCP tools; do not edit it by hand.

Sections, left to right on the canvas:

| Section | Content                                                                                                      | Source                                        |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 00      | Read me: sources, stand-ins, variable prefixes, open decisions                                               | this folder                                   |
| 01      | Jory foundations: token palette, marketing palette, conflicts, type, spacing, radius, shadow, motion         | `../JORY_DESIGN_MERGE.md`, `design-tokens.ts` |
| 02      | Jory marketing: 16 patterns as components, landing, why, other pages                                         | `catalog-jory-marketing.md`                   |
| 03      | Jory product: 12 patterns as components, dashboard shell and views, login, behavior review, QA               | `catalog-jory-product.md`                     |
| 04      | OpenInstinct foundations: color tokens light and dark, 18 type roles, radius, motion, icons, layout patterns | `../DESIGN_SYSTEM.md`                         |
| 05      | OpenInstinct primitives: all 25, every variant and size, states                                              | `catalog-openinstinct.md` section 1           |
| 06      | OpenInstinct composed: chat elements, browser legend, app shell, 35 route components                         | `catalog-openinstinct.md` sections 2 and 3    |
| 07      | OpenInstinct screens: 14 desktop routes and one mobile view                                                  | `catalog-openinstinct.md` sections 4 and 5    |
| 08      | Restyle map (Proposed): token map, component map, bypasses to fix, counts                                    | all catalogs, `../JORY_DESIGN_MERGE.md`       |

Document variables: `oi-*` (OpenInstinct, light and dark on the `mode` axis),
`jory-*` (Jory token file), `jory-mk-*` (the marketing palette that is inline
on the landing and why pages and not in the token file), `font-jory`,
`font-oi`, `font-oi-mono`.

Font stand-ins: OpenInstinct's Vault fonts are Mona Sans derivatives and are
not installed in Pencil; the canvas uses Mona Sans and JetBrains Mono with the
real sizes, weights, and tracking. OpenInstinct colors are OKLCH in code and
are converted to sRGB hex on the canvas.

`assets/` holds the Jory wordmark and three mascot renders copied from
`jory/apps/web/public/assets` for the image fills in section 02.

The three `catalog-*.md` files are the written specs the canvas was drawn
from. Every value in them is read from a source file on 2026-09-03; the
catalogs name the file for each value.
