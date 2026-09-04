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
