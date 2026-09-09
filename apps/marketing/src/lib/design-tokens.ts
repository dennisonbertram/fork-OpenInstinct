/**
 * JORY Design Tokens — TypeScript mirror of globals.css @theme
 * Source of truth: src/app/globals.css (which mirrors colors_and_type.css)
 * Do NOT edit values here independently — keep in sync with globals.css.
 */

export const colors = {
  // Brand
  bg: "#FAF7F0",
  ink: "#071B36",
  ink2: "#16233B",
  muted: "#E6E6E6",
  mutedInk: "#5A6A82",

  // JORY wordmark per-letter
  joryJ: "#4434E8",
  joryO: "#F7B313",
  joryR: "#7467E8",
  joryY: "#FF5A32",

  // Accent
  mustard: "#D4A72C",
  skin: "#F4A261",

  // CTA / button
  cta: "#061A33",
  ctaHover: "#0F2A4D",

  // Soft tints
  softPurple: "#EDE8FF",
  softYellow: "#FFF1CF",
  softGreen: "#E9F8E8",
  softRed: "#FFE7DF",

  // Chat bubbles
  bubbleUser: "#F1F5F9",
  bubbleJory: "#E0E7FF",

  // Single-accent system
  accentIndigo: "#4F46E5",
  accentOrange: "#F97316",
  accentGreen: "#22C55E",
} as const;

export const typeScale = {
  display: "96px",
  hero: "240px",
  h1: "56px",
  h2: "36px",
  h3: "24px",
  bodyLg: "20px",
  body: "16px",
  caption: "14px",
  micro: "12px",
} as const;

export const lineHeights = {
  tight: 1.02,
  display: 1.08,
  heading: 1.15,
  body: 1.5,
} as const;

export const letterSpacing = {
  hero: "-0.04em",
  display: "-0.03em",
  heading: "-0.02em",
  body: "0em",
  caps: "0.08em",
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semi: 600,
  bold: 700,
  extra: 800,
  black: 900,
} as const;

export const spacing = {
  s1: "4px",
  s2: "8px",
  s3: "12px",
  s4: "16px",
  s5: "24px",
  s6: "32px",
  s7: "48px",
  s8: "64px",
  s9: "96px",
  s10: "128px",
  container: "1200px",
  gutter: "24px",
} as const;

export const radii = {
  input: "12px",
  card: "16px",
  bubble: "18px",
  pill: "999px",
} as const;

export const shadows = {
  card: "0 2px 10px rgba(0, 0, 0, 0.04)",
  cardHover: "0 6px 20px rgba(0, 0, 0, 0.06)",
  float: "0 12px 40px rgba(7, 27, 54, 0.10)",
} as const;

export const motion = {
  fast: "120ms",
  base: "180ms",
  slow: "280ms",
  ease: "cubic-bezier(0.2, 0.7, 0.2, 1)",
} as const;

export const tokens = {
  colors,
  typeScale,
  lineHeights,
  letterSpacing,
  fontWeights,
  spacing,
  radii,
  shadows,
  motion,
} as const;
