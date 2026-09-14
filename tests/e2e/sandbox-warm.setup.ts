import { expect, test as setup } from "@playwright/test";

// Attachment staging (eve/dist/src/harness/attachment-staging.js) needs a
// docker sandbox workspace to hold anything other than a small image or PDF,
// and the first sandbox any test needs pays a one-time template build (~15s
// cold, ~100ms warm). That build has nothing to do with the message content;
// it is a prerequisite of the *runtime*, not of any one test. Paying it here,
// in a project that chromium depends on, keeps it out of every timed test
// assertion downstream. This is not a sleep and not a timeout change.
setup(
  "warm the docker sandbox template for attachment staging",
  async ({ page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: "Message Jory" });
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Attach files" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      buffer: Buffer.from("sandbox warm-up attachment"),
      mimeType: "text/plain",
      name: "warm.txt",
    });
    // The upload attaches asynchronously; wait for the composer to show it
    // before submitting, the same way chat.spec.ts's attachment tests do,
    // so the message is not sent ahead of its own attachment.
    await expect(
      page.getByRole("button", { name: "Remove warm.txt" })
    ).toBeVisible();
    await composer.fill("say Sandbox warmed.");
    await composer.press("Enter");

    // Match either the bare `say` text or the attached-file suffix staging
    // injects into lastUserMessage. exact:true failed when the suffix was
    // present; the #242 regex failed when it was not.
    await expect(
      page.locator(".is-assistant").getByText("Sandbox warmed.")
    ).toBeVisible({ timeout: 90_000 });
  }
);
