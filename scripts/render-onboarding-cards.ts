import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { ONBOARDING_EXAMPLE_CARDS } from "../agent/lib/onboarding/messages";

const viewport = { height: 500, width: 390 } as const;
const deviceScaleFactor = 2;
const outputDirectory = resolve(process.cwd(), "public/onboarding");

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cardMarkup(card: (typeof ONBOARDING_EXAMPLE_CARDS)[number]) {
  const bubbles = card.conversation
    .map(
      ({ speaker, text }) => `
        <div class="row ${speaker === "Owner" ? "owner" : "jory"}">
          <div class="bubble"><div class="bubble-text">${escapeHtml(text)}</div></div>
        </div>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${escapeHtml(card.title)}</title></head>
  <body>
    <main class="canvas">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">J</span><span>Jory</span></div>
      </header>
      <div class="thread-title">${escapeHtml(card.title)}</div>
      <section class="thread" aria-label="${escapeHtml(card.title)} example conversation">
        ${bubbles}
      </section>
    </main>
  </body>
</html>`;
}

/* oxlint-disable tailwindcss/no-duplicate-classes, tailwindcss/no-unknown-classes -- This standalone renderer serializes plain CSS into a Playwright document; these tokens are not Tailwind classes. */
const styles = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${String(viewport.width)}px;
    min-height: ${String(viewport.height)}px;
    background: #fff;
    color: #17233c;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .canvas {
    width: ${String(viewport.width)}px;
    height: ${String(viewport.height)}px;
    display: flex;
    flex-direction: column;
    padding: 17px 16px 14px;
    background: #fff;
  }
  .topbar { display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .brand { display: flex; align-items: center; gap: 7px; color: #182645; font-size: 17px; font-weight: 700; }
  .brand-mark { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 50%; background: #182645; color: #fff; font-size: 14px; }
  .thread-title { margin: 17px 0 13px; color: #65728a; font-size: 12px; font-weight: 700; letter-spacing: .02em; text-align: center; }
  .thread { display: flex; flex-direction: column; gap: 8px; padding: 0 1px; }
  .row { display: flex; width: 100%; }
  .row.jory { justify-content: flex-start; }
  .row.owner { justify-content: flex-end; }
  .bubble { max-width: 88%; padding: 9px 13px 10px; border-radius: 18px; font-size: 18px; line-height: 1.23; white-space: pre-wrap; }
  .jory .bubble { border: 1px solid #d9e0e9; border-bottom-left-radius: 5px; background: #f0f2f5; color: #263653; }
  .owner .bubble { border-bottom-right-radius: 5px; background: #1877f2; color: #fff; }
`;
/* oxlint-enable tailwindcss/no-duplicate-classes, tailwindcss/no-unknown-classes */

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      deviceScaleFactor,
      viewport,
    });
    try {
      /* oxlint-disable eslint/no-await-in-loop -- Render cards serially so each output has deterministic browser/font state. */
      for (const [index, card] of ONBOARDING_EXAMPLE_CARDS.entries()) {
        const page = await context.newPage();
        await page.setContent(cardMarkup(card), { waitUntil: "load" });
        await page.addStyleTag({ content: styles });
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: resolve(outputDirectory, `example-${String(index + 1)}.png`),
        });
        await page.close();
      }
      /* oxlint-enable eslint/no-await-in-loop */
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

await main();
