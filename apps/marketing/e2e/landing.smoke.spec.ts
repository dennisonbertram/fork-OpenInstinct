import { test, expect } from "@playwright/test";

test("landing page smoke test", async ({ page }) => {
  await page.goto("/");

  // Hero heading (the scroll-world section repeats the line, so scope to first)
  await expect(page.getByText(/train your staff once/i).first()).toBeVisible();
  await expect(page.getByText(/prove it every shift/i).first()).toBeVisible();

  // Early-access CTA — at least one visible, and it opens the signup dialog
  const ctaButtons = page.getByRole("button", { name: /get early access/i });
  await expect(ctaButtons.first()).toBeVisible();
  await ctaButtons.first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeVisible();
});

test("why page renders the narrative", async ({ page }) => {
  await page.goto("/why");
  await expect(
    page.getByRole("heading", { name: /why we.re building jory/i })
  ).toBeVisible();
  await expect(page.getByText(/one system, five parts/i)).toBeVisible();
  await expect(page.getByText(/proof, not paperwork/i)).toBeVisible();
});

for (const width of [390, 768, 1024]) {
  test(`nav links are clickable (not occluded) at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    // Every nav link must be the top element at its own center point —
    // regression guard for the wordmark/mascot painting over the nav pills.
    const nav = page.locator("nav");
    for (const label of [
      "Features",
      "How it works",
      "Pricing",
      "Security",
      "About",
      "Why we're building Jory",
    ]) {
      const link = nav.getByRole("link", { name: label });
      await expect(link).toBeVisible();
      const clickable = await link.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        return el.contains(top) || top === el;
      });
      expect(clickable, `${label} pill is occluded at ${width}px`).toBe(true);
    }

    // And an actual navigation works.
    await nav.getByRole("link", { name: "Pricing" }).click({ timeout: 5000 });
    await expect(page).toHaveURL(/\/pricing/);
  });

  test(`mascot does not overlap headline or nav at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const overlaps = await page.evaluate(() => {
      const mascot = document.querySelector(".landing-hero-character");
      if (!mascot) return { missing: true, headline: 0, nav: 0 };
      const b = mascot.getBoundingClientRect();
      const area = (el: Element | null) => {
        if (!el) return -1;
        const a = el.getBoundingClientRect();
        const x = Math.max(
          0,
          Math.min(a.right, b.right) - Math.max(a.left, b.left)
        );
        const y = Math.max(
          0,
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        );
        return x * y;
      };
      return {
        missing: false,
        headline: area(document.querySelector(".landing-hero-title")),
        nav: area(document.querySelector("nav")),
      };
    });
    expect(overlaps.missing).toBe(false);
    expect(overlaps.headline, `headline/mascot overlap at ${width}px`).toBe(0);
    expect(overlaps.nav, `nav/mascot overlap at ${width}px`).toBe(0);
  });
}

for (const width of [375, 768, 1440]) {
  test(`landing page has no horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const overflow = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth);
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth);
  });
}
