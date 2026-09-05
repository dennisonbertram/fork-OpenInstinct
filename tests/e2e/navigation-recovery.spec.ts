import { expect, test, type Page } from "@playwright/test";
import { signInThroughBypass } from "./helpers";

const mobileSheet = (page: Page) =>
  page.locator('[data-sidebar="sidebar"][data-mobile="true"]');

async function expectReadableNotFound(page: Page) {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(
    page.getByText("This page could not be found.", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Return to workspace", exact: true })
  ).toBeVisible();

  const contrastRatios = await page
    .locator("h1, p, a")
    .evaluateAll((elements) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Canvas unavailable for contrast check");

      const channels = (value: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      };
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- This function runs inside the browser evaluation.
      const relativeLuminance = (value: number[]) =>
        value.reduce((sum, channel, index) => {
          const linear =
            channel / 255 <= 0.03928
              ? channel / 255 / 12.92
              : ((channel / 255 + 0.055) / 1.055) ** 2.4;
          const weight = [0.2126, 0.7152, 0.0722][index];
          if (weight === undefined) throw new Error("Unexpected color channel");
          return sum + linear * weight;
        }, 0);

      return elements.map((element) => {
        const foreground = channels(getComputedStyle(element).color);
        let ancestor: Element | null = element;
        let background: number[] | null = null;
        while (ancestor && !background) {
          const candidate = channels(
            getComputedStyle(ancestor).backgroundColor
          );
          const alpha = candidate[3];
          if (alpha !== undefined && alpha > 0) background = candidate;
          ancestor = ancestor.parentElement;
        }
        if (!background)
          throw new Error("Could not resolve not-found background");

        const foregroundLuminance = relativeLuminance(foreground.slice(0, 3));
        const backgroundLuminance = relativeLuminance(background.slice(0, 3));
        const lighter = Math.max(foregroundLuminance, backgroundLuminance);
        const darker = Math.min(foregroundLuminance, backgroundLuminance);
        return (lighter + 0.05) / (darker + 0.05);
      });
    });
  for (const ratio of contrastRatios) {
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
}

test("closes the mobile navigation after pointer and keyboard route changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/personal-info");

  const sheet = mobileSheet(page);
  const trigger = page.getByRole("button", { name: "Toggle Sidebar" });

  await trigger.click();
  await expect(sheet).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "All chats", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chat\/history$/);
  await expect(page.getByRole("heading", { name: "All chats" })).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        const sheetElement = document.querySelector(
          '[data-sidebar="sidebar"][data-mobile="true"]'
        );
        return {
          focusOutsideSheet: !sheetElement?.contains(active ?? null),
          focusVisible: Boolean(active?.getClientRects().length),
        };
      })
    )
    .toEqual({ focusOutsideSheet: true, focusVisible: true });
  await trigger.click();
  await expect(sheet).toBeVisible();
  const tasksLink = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Tasks", exact: true });
  await tasksLink.focus();
  await tasksLink.press("Enter");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true })
  ).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        const sheetElement = document.querySelector(
          '[data-sidebar="sidebar"][data-mobile="true"]'
        );
        return {
          focusOutsideSheet: !sheetElement?.contains(active ?? null),
          focusVisible: Boolean(active?.getClientRects().length),
        };
      })
    )
    .toEqual({ focusOutsideSheet: true, focusVisible: true });
});

test("keeps the desktop sidebar available after mobile navigation coverage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/tasks");

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(
    page.locator('[data-sidebar="sidebar"][data-mobile="true"]')
  ).toHaveCount(0);
  await expect(page.locator('a[href="/tasks"]')).toHaveAttribute(
    "data-active",
    ""
  );
});

test.describe("authenticated not-found surfaces", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`keeps a missing trace readable with ${colorScheme} browser preference`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      const response = await page.goto(
        "/tasks/missing-synthetic-trace-for-404"
      );

      // The route's notFound() keeps the exclusion behavior; Next may stream
      // the fallback with HTTP 200 in development per its installed contract.
      expect([200, 404]).toContain(response?.status());
      await expectReadableNotFound(page);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`keeps a denied admin route readable with ${colorScheme} browser preference`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        colorScheme,
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();

      try {
        await signInThroughBypass(page, "+12025550424");
        const response = await page.goto("/admin");

        expect([200, 404]).toContain(response?.status());
        await expectReadableNotFound(page);
      } finally {
        await context.close();
      }
    });
  }
});
