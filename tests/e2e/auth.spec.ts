import { expect, test } from "@playwright/test";
import { signInThroughBypass } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("rejects an incorrect local verification code", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Phone number").fill("+12025550125");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Verification Code").fill("123456");
  await page.getByRole("button", { name: "Verify code", exact: true }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByText("That code could not be verified", { exact: false })
  ).toBeVisible();
});

test("redirects, signs in through the bypass, and signs out", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2F$/);

  await signInThroughBypass(page);
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await context.close();
});
