import { expect, test } from "@playwright/test";

// oxlint-disable-next-line eslint/no-restricted-properties, turbo/no-undeclared-env-vars -- The test runner selects the provider mode for this isolated SendBlue E2E config.
const isSendblue = process.env.PHONE_OTP_PROVIDER === "sendblue";

test.describe("SendBlue OTP UI regression", () => {
  test.skip(!isSendblue, "PHONE_OTP_PROVIDER is not sendblue");

  test("configured form, accepted, unconfirmed, and error states", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const networkRequests: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/phone-number/send-otp")) {
        networkRequests.push(`${req.method()} ${req.url()}`);
      }
    });

    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    // Configured SendBlue form
    await expect(page.getByText("SendBlue sends your code")).toBeVisible();

    // Normal accepted submission: shows code-entry form, no uncertain warning
    await page.route("**/api/auth/phone-number/send-otp", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "code sent" }),
      });
    });

    await page.getByLabel("Phone number").fill("+12025550123");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText("Verification Code").first()).toBeVisible();
    await expect(
      page.getByText("Code submission could not be confirmed")
    ).not.toBeVisible();

    // Use a different number to reset
    await page.getByRole("button", { name: "Use a different number" }).click();
    await expect(page.getByLabel("Phone number")).toBeVisible();

    // Unconfirmed submission: shows warning and keeps code-entry form
    await page.route("**/api/auth/phone-number/send-otp", async (route) => {
      await route.fulfill({
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "SENDBLUE_SUBMISSION_UNCONFIRMED",
          message:
            "The SendBlue submission could not be confirmed. The request may have reached SendBlue. Enter the code if it arrives, or use a different number.",
        }),
      });
    });

    await page.getByLabel("Phone number").fill("+12025550456");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByText("Code submission could not be confirmed")
    ).toBeVisible();
    await expect(page.getByText("Verification Code").first()).toBeVisible();

    // Error state: normal refusal/rate error is not mislabeled as accepted or unconfirmed
    await page.route("**/api/auth/phone-number/send-otp", async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "SENDBLUE_RATE_LIMITED",
          message:
            "SendBlue rate-limited the request. Wait a moment and try again.",
        }),
      });
    });

    await page.getByRole("button", { name: "Use a different number" }).click();
    await page.getByLabel("Phone number").fill("+12025550789");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByText("SendBlue rate-limited the request")
    ).toBeVisible();
    await expect(
      page.getByText("Code submission could not be confirmed")
    ).not.toBeVisible();

    // The form must not have sent duplicate POSTs after the unconfirmed response.
    // We routed every request, so count intercepted requests.
    const sendOtpRequests = networkRequests.filter((r) =>
      r.includes("/api/auth/phone-number/send-otp")
    );
    expect(sendOtpRequests).toHaveLength(3);

    const unexpectedConsoleErrors = consoleErrors.filter(
      (msg) => !msg.includes("Failed to load resource")
    );
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
