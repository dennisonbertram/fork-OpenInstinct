import { test, expect } from "@playwright/test";

for (const width of [768, 1024, 1440]) {
  test(`pricing card is horizontally centered at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/pricing");

    const card = page.locator(".pricing-tier-card");
    await expect(card).toBeVisible();
    const { left, right } = await card.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: window.innerWidth - rect.right };
    });
    expect(
      Math.abs(left - right),
      `card margins left=${left} right=${right} at ${width}px`
    ).toBeLessThanOrEqual(2);
  });
}
