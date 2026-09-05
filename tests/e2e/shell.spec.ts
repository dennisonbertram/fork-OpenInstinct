import { expect, test } from "@playwright/test";

test("loads the authenticated workspace, chat, and vault surfaces", async ({
  page,
}) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(
    navigation.getByRole("link", { name: "Workspace", exact: true })
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Vault", exact: true })
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Chat", exact: true })
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "All chats", exact: true })
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Tasks", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();

  await page.goto("/chat");
  await expect(page.getByPlaceholder("Send a message…")).toBeVisible();
  await page.getByRole("button", { name: "Make a plan", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message Jory" })).toHaveValue(
    "Help me plan my day and decide what to tackle first."
  );
  await expect(
    page.getByRole("textbox", { name: "Message Jory" })
  ).toBeFocused();
  await expect(page).toHaveURL(/\/chat$/);
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await fileChooser
  ).setFiles({
    name: "chat-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("A synthetic attachment for the composer test."),
  });
  const removeAttachment = page.getByRole("button", {
    name: "Remove chat-note.txt",
    exact: true,
  });
  await expect(removeAttachment).toBeVisible();
  await removeAttachment.click();
  await expect(removeAttachment).toHaveCount(0);

  await page.goto("/vault");
  await expect(page.getByRole("heading", { name: "Vault" })).toBeVisible();
});

test("keeps empty browser task guidance readable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tasks");
  const guidance = page
    .getByRole("region", { name: "Browser task history" })
    .getByText(
      "No browser tasks yet. Give the agent a browser task from the chat.",
      { exact: true }
    );
  await expect(guidance).toBeVisible();
  const overflow = await guidance.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("scrolls populated browser task columns on mobile with a synthetic list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tasks");
  // Only list data is mocked: no browser worker ran and no trace was persisted.
  await page.route("**/api/trpc/traces.list?*", async (route) => {
    await route.fulfill({
      json: [
        {
          result: {
            data: {
              nextCursor: null,
              traces: [
                {
                  sessionId: "synthetic-mobile-layout",
                  task: "Synthetic mobile layout check",
                  status: "success",
                  resultMessage:
                    "Synthetic fixture only; no browser execution.",
                  startedAt: "2026-09-05T12:00:00.000Z",
                  completedAt: "2026-09-05T12:00:12.000Z",
                  durationMs: 12000,
                  domains: ["example.com"],
                },
              ],
            },
          },
        },
      ],
    });
  });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.locator('a[href="/tasks/synthetic-mobile-layout"]')
  ).toBeVisible();
  const table = page.getByRole("table");
  const headerOverflow = await table
    .locator("th")
    .evaluateAll((cells) =>
      cells.map((cell) => cell.scrollWidth - cell.clientWidth)
    );
  expect(Math.max(...headerOverflow)).toBeLessThanOrEqual(1);
  const scrollContainer = page.locator('[data-slot="table-container"]');
  const scrollable = await scrollContainer.evaluate((element) => {
    const hasOverflow = element.scrollWidth > element.clientWidth;
    element.scrollLeft = element.scrollWidth;
    return hasOverflow;
  });
  expect(scrollable).toBe(true);
  await expect(
    page.getByRole("columnheader", { name: "Started", exact: true })
  ).toBeInViewport();
  const viewportOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(viewportOverflow).toBeLessThanOrEqual(1);
});
