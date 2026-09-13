import { expect, test as setup } from "@playwright/test";
import { signInThroughBypass } from "./helpers";

// Attachment staging (eve/dist/src/harness/attachment-staging.js) needs a
// docker sandbox workspace to hold anything other than a small image or PDF,
// and the first sandbox any test needs pays a one-time template build (~15s
// cold, ~100ms warm). That build has nothing to do with the message content;
// it is a prerequisite of the *runtime*, not of any one test. Paying it here,
// in setup, keeps it out of every timed test assertion downstream -- this is
// not a sleep and not a timeout change, it provisions the template before
// measurement begins. chat.spec.ts's rejected-409 test is the first timed
// test that needs this and previously paid the cold cost itself.
setup(
  "warm the docker sandbox template for attachment staging",
  async ({ page }) => {
    await page.goto("/");
    await signInThroughBypass(page);

    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: "Message Jory" });
    await page.getByLabel("Upload files").setInputFiles({
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

    // A generous, explicit timeout on this one assertion -- not the global
    // `expect.timeout`, not a retry, not a Playwright config change -- because
    // this is the one place in the suite that is expected to pay a cold sandbox
    // build. If the template never builds, this fails loudly instead of the
    // warm silently doing nothing.
    await expect(
      page
        .locator(".is-assistant")
        .getByText(
          /^Sandbox warmed\.Attached file \/workspace\/attachments\/[^/]+\/warm\.txt \(text\/plain\)$/u
        )
    ).toBeVisible({ timeout: 60_000 });
  }
);
