import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

type SendOtpMockBody =
  | { readonly message: string }
  | { readonly code: string; readonly message: string };

interface SendOtpMockResponse {
  readonly status: number;
  readonly body: SendOtpMockBody;
}

test.describe("SendBlue OTP UI regression", () => {
  test("configured form, accepted, unconfirmed, and error states", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const sendOtpRequests: { method: string; url: string; body: unknown }[] =
      [];
    let verifyRequestBody: unknown;
    let sendOtpResponse: SendOtpMockResponse = {
      status: 200,
      body: { message: "code sent" },
    };

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.route("**/api/auth/phone-number/send-otp", async (route) => {
      const request = route.request();
      sendOtpRequests.push({
        method: request.method(),
        url: request.url(),
        body: request.postDataJSON(),
      });
      await route.fulfill({
        status: sendOtpResponse.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendOtpResponse.body),
      });
    });

    await page.route("**/api/auth/phone-number/verify", async (route) => {
      verifyRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "INVALID_OTP" }),
      });
    });

    const screenshotDir = ".eve/review";

    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("SendBlue sends your code")).toBeVisible();
    await expect(
      page.getByText("registered SendBlue sending line")
    ).toBeVisible();
    await expect(page.getByText("+12025550199")).toBeVisible();
    await page.screenshot({
      path: `${screenshotDir}/sendblue-form-configured.png`,
    });

    await page.getByLabel("Phone number").fill("+12025550123");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText("Verification Code").first()).toBeVisible();
    await expect(
      page.getByText("Code submission could not be confirmed")
    ).not.toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/sendblue-accepted.png` });

    await page.getByRole("button", { name: "Use a different number" }).click();
    await expect(page.getByLabel("Phone number")).toBeVisible();

    sendOtpResponse = {
      status: 400,
      body: {
        code: "SENDBLUE_SUBMISSION_UNCONFIRMED",
        message:
          "The SendBlue submission could not be confirmed. The request may have reached SendBlue. Enter the code if it arrives, or use a different number.",
      },
    };

    await page.getByLabel("Phone number").fill("+12025550456");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByText("Code submission could not be confirmed")
    ).toBeVisible();
    await expect(page.getByText("Verification Code").first()).toBeVisible();
    await page.screenshot({
      path: `${screenshotDir}/sendblue-unconfirmed.png`,
    });

    await page.getByLabel("Verification Code").fill("123456");
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect.poll(() => verifyRequestBody).toBeDefined();
    expect(verifyRequestBody).toMatchObject({
      code: "123456",
      phoneNumber: "+12025550456",
    });
    expect(sendOtpRequests).toHaveLength(2);

    await page.getByRole("button", { name: "Use a different number" }).click();
    await expect(page.getByLabel("Phone number")).toBeVisible();

    sendOtpResponse = {
      status: 429,
      body: {
        code: "SENDBLUE_RATE_LIMITED",
        message:
          "SendBlue rate-limited the request. Wait a moment and try again.",
      },
    };

    await page.getByLabel("Phone number").fill("+12025550789");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(
      page.getByText("SendBlue rate-limited the request")
    ).toBeVisible();
    await expect(
      page.getByText("Code submission could not be confirmed")
    ).not.toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/sendblue-error-rate.png` });

    expect(sendOtpRequests).toHaveLength(3);
    expect(sendOtpRequests.map((r) => r.body)).toEqual([
      { phoneNumber: "+12025550123" },
      { phoneNumber: "+12025550456" },
      { phoneNumber: "+12025550789" },
    ]);

    writeFileSync(
      `${screenshotDir}/sendblue-network-log.json`,
      JSON.stringify(
        {
          sendOtpRequestCount: sendOtpRequests.length,
          sendOtpRequestBodies: sendOtpRequests.map((r) => r.body),
          verifyRequestBody,
        },
        null,
        2
      )
    );

    const unexpectedConsoleErrors = consoleErrors.filter(
      (msg) => !msg.includes("Failed to load resource")
    );
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
