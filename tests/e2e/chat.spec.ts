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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat/history");
  const history = page.getByRole("region", { name: "Chat history" });
  const chatCard = history.locator(
    `a[href="${new URL(conversationUrl).pathname}"]:visible`
  );
  await expect(chatCard).toHaveCount(1);
  await expect(chatCard).toBeVisible();
  const historyBox = await history.boundingBox();
  const cardBox = await chatCard.boundingBox();
  if (!historyBox || !cardBox) {
    throw new Error("Chat history and its card must have visible bounds");
  }
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(
    historyBox.x + historyBox.width + 1
  );
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

test("shows a durable recovery notice when a completed fixture turn has no visible reply", async ({
  page,
}, testInfo) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Jory" });
  await composer.fill("silent");
  await composer.press("Enter");

  await expect(
    page.getByText("Jory couldn’t finish this request", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Please try sending your message again.", { exact: true })
  ).toBeVisible();
  await expect(composer).toBeEnabled();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("silent-terminal-feedback.png"),
  });

  await page.reload();
  await expect(
    page.getByText("Jory couldn’t finish this request", { exact: true })
  ).toBeVisible();
  await composer.fill("say The visible recovery reply arrived.");
  await composer.press("Enter");
  await expect(
    page
      .locator(".is-assistant")
      .getByText("The visible recovery reply arrived.", { exact: true })
  ).toBeVisible();
});

test("waits for each accepted stop to settle before accepting the next message", async ({
  page,
}, testInfo) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Jory" });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await composer.fill("wait");
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await composer.press("Enter");
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await expect(stop).toBeVisible();
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await stop.click();
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await expect(
      page.getByText("Jory stopped this request", { exact: true })
    ).toBeVisible();
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await expect(
      page.getByText("Stop requested. Waiting for Jory to finish stopping.", {
        exact: true,
      })
    ).toHaveCount(0);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each stop must settle before exercising the next stop in the same session history.
    await expect(composer).toBeEnabled();
    if (attempt === 1) {
      // The second stop verifies that an older cancellation does not settle a newer one.
      // oxlint-disable-next-line eslint/no-await-in-loop -- Capture the final asserted stop state in the test artifact directory.
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("stopped-confirmation.png"),
      });
    }
  }

  await composer.fill("say The post-stop reply arrived.");
  await composer.press("Enter");
  await expect(
    page
      .locator(".is-assistant")
      .getByText("The post-stop reply arrived.", { exact: true })
  ).toBeVisible();
});

test("keeps a rejected 409 draft and attachment for an explicit retry", async ({
  page,
}, testInfo) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Jory" });
  await composer.fill("say Establish the existing session.");
  await composer.press("Enter");
  await expect(
    page
      .locator(".is-assistant")
      .getByText("Establish the existing session.", { exact: true })
  ).toBeVisible();

  let interceptedSends = 0;
  await page.route(/\/eve\/v1\/session\/[^/?]+$/u, async (route) => {
    if (route.request().method() !== "POST" || interceptedSends !== 0) {
      await route.continue();
      return;
    }

    interceptedSends += 1;
    await route.fulfill({
      body: JSON.stringify({ code: "conflict", error: "Synthetic conflict" }),
      contentType: "application/json",
      status: 409,
    });
  });

  await page.getByLabel("Upload files").setInputFiles({
    buffer: Buffer.from("synthetic attachment"),
    mimeType: "text/plain",
    name: "draft.txt",
  });
  await composer.fill("say Keep this exact draft.");
  await composer.press("Enter");

  await expect(
    page.getByText("Message not sent", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Jory is still getting ready for another message. Your draft and attachments are still in the composer; wait for the current request to finish, then try again.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByText("Jory couldn’t finish this request", { exact: true })
  ).toHaveCount(0);
  await expect(composer).toHaveValue("say Keep this exact draft.");
  await expect(
    page.getByRole("button", { name: "Remove draft.txt" })
  ).toBeVisible();
  expect(interceptedSends).toBe(1);
  const retriedMessage = page
    .locator(".is-user")
    .getByText("say Keep this exact draft.", { exact: true });
  await expect(retriedMessage).toHaveCount(0);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("rejected-409-draft.png"),
  });

  await page.unroute(/\/eve\/v1\/session\/[^/?]+$/u);
  await composer.press("Enter");
  await expect(
    page
      .locator(".is-assistant")
      .getByText(
        /^Keep this exact draft\.Attached file \/workspace\/attachments\/[^/]+\/draft\.txt \(text\/plain\)$/u
      )
  ).toBeVisible();
  await expect(retriedMessage).toHaveCount(1);
});
