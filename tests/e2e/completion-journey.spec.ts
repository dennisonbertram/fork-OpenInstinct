import { expect, test } from "@playwright/test";

/**
 * Plan 009 step 3: the completion journey a user can actually see.
 *
 * Everything else about this work is proven a layer below — unit suites,
 * the crash boundary, the real-Postgres lane, the mounted channel. None of
 * them shows a person a message. This does: the real app in a real browser,
 * with the contract fixture standing in for both models.
 *
 * It exists because of what happened when forcing was activated on the
 * strength of those lower layers. The guard behaved exactly as designed, the
 * log looked correct, and the message that reached the phone was "i'm checking
 * a public time source for Tokyo now." — which reported nothing, described work
 * that had never started, and closed the turn. The lower layers could not have
 * caught that. This one can, because it reads what is on the screen.
 */

const workerAssignment = JSON.stringify({
  outputSchema: {
    additionalProperties: false,
    properties: {
      images: { items: {}, maxItems: 4, type: "array" },
      message: { minLength: 1, type: "string" },
      status: { enum: ["success", "failure"], type: "string" },
    },
    required: ["status", "message", "images"],
    type: "object",
  },
  prompt:
    'call final_output {"status":"success","message":"Submitted the demo comment for Maya Chen","images":[]}',
});

// Skipped, and the reason is structural rather than a matter of effort.
//
// The journey needs a settled worker cohort, which needs the worker to run on
// the contract fixture. It cannot: a subagent's model comes from the config its
// resolver returns, and Eve requires that config to be serializable, so a
// provider object makes it omit the subagent entirely -- "Dynamic model
// selection returned a provider object, but durable model selections must be
// serializable". `step.started` is not available to subagents either; see
// node_modules/eve/docs/subagents/index.mdx.
//
// One route remains. A static agent config may hold a direct provider, so
// taking it means restructuring how browser-agent is defined and moving its
// mode gating -- a change to production delegation made to suit a test, which
// deserves a deliberate decision rather than a late one.
//
// The harness below is known to work: it ran end to end and failed on the
// assertion, not on the plumbing. Set PLAYWRIGHT_PORT if something already
// holds 3000. It also needs forcing active, which is the thing this journey is
// meant to be the evidence for.
test.skip("reports settled background work, and answers a later question from evidence", async ({
  page,
}, testInfo) => {
  await page.goto("/chat");
  const composer = page.getByRole("textbox", { name: "Message Jory" });

  // One background worker, settled through the typed adapter with a known fact.
  await composer.fill(`call browser-agent ${workerAssignment}`);
  await composer.press("Enter");
  await expect(composer).toBeEnabled({ timeout: 60_000 });

  // The turn that owes the summary. The fixture is told to send a progress
  // note, which is exactly what the model chose in production: it reports
  // nothing about the settled work.
  await composer.fill("say i'm checking a public time source for Tokyo now.");
  await composer.press("Enter");

  // The records travel with it, so the user sees what actually happened even
  // though the model's own sentence says nothing about it.
  await expect(
    page
      .locator(".is-assistant")
      .filter({ hasText: "Submitted the demo comment" })
  ).toBeVisible({ timeout: 60_000 });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("completion-report-visible.png"),
  });

  // Survives a reload: the report is in the persisted history, not just in the
  // stream that delivered it.
  await page.reload();
  await expect(
    page
      .locator(".is-assistant")
      .filter({ hasText: "Submitted the demo comment" })
  ).toBeVisible({ timeout: 30_000 });

  // The later summary question, asked the way Plan 009 words it.
  await composer.fill(
    "say What was the result? Please summarize it. Do not submit again."
  );
  await composer.press("Enter");
  await expect(composer).toBeEnabled({ timeout: 60_000 });

  // Answered without starting the work again. One worker ran in this session,
  // and asking about it does not start a second.
  await expect(
    page
      .locator(".is-assistant")
      .filter({ hasText: "Submitted the demo comment" })
  ).not.toHaveCount(0);
});
