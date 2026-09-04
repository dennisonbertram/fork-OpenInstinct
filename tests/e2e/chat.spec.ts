import { expect, test } from "@playwright/test";

test("delivers, reloads, and continues a real authenticated conversation", async ({
  page,
}) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Jory" });
  const firstReply = "The first synthetic business reply arrived.";
  const followUpReply = "The synthetic follow-up arrived in the same chat.";

  await composer.fill(`say ${firstReply}`);
  await composer.press("Enter");
  await expect(page).toHaveURL(/\/chat\/[^/?]+$/);
  const conversationUrl = page.url();
  const firstBubble = page.locator(".is-assistant").getByText(firstReply, {
    exact: true,
  });
  await expect(firstBubble).toBeVisible();
  await expect(firstBubble).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Submit", exact: true })
  ).toBeEnabled();

  await page.reload();
  await expect(page).toHaveURL(conversationUrl);
  await expect(firstBubble).toBeVisible();
  await expect(firstBubble).toHaveCount(1);
  await expect(composer).toBeEnabled();
  await composer.fill(`say ${followUpReply}`);
  await composer.press("Enter");
  const followUpBubble = page
    .locator(".is-assistant")
    .getByText(followUpReply, {
      exact: true,
    });
  await expect(followUpBubble).toBeVisible();
  await expect(followUpBubble).toHaveCount(1);
  await expect(firstBubble).toHaveCount(1);
  await expect(page).toHaveURL(conversationUrl);
  await page.reload();
  await expect(firstBubble).toHaveCount(1);
  await expect(followUpBubble).toHaveCount(1);
});

test("settles a failed real turn and shows actionable recovery", async ({
  page,
}) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Jory" });
  // The guarded local model rejects unknown commands; no HTTP response is mocked.
  await composer.fill("unsupported-e2e-fixture-command");
  await composer.press("Enter");

  await expect(
    page.getByText("Jory couldn’t finish this request", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Please try sending your message again.", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Jory is working…", { exact: true })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: "Stop", exact: true })
  ).toHaveCount(0);
  await expect(composer).toBeEnabled();
  await composer.fill("say The synthetic recovery reply arrived.");
  await composer.press("Enter");
  await expect(
    page
      .locator(".is-assistant")
      .getByText("The synthetic recovery reply arrived.", { exact: true })
  ).toBeVisible();
});
