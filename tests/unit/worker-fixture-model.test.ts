import type { DynamicResolveContext } from "eve/tools";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

/**
 * The worker's model selection, which the end-to-end completion journey needs.
 *
 * The root already swaps in the contract fixture under `EVAL_CONTRACT_FIXTURE`.
 * The worker did not, so settling a single synthetic cohort in an end-to-end
 * test would have required a paid model and a live browser — which is why the
 * browser-visible proof in Plan 009 step 3 had no way to run.
 */

const fixture = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/env", async (importOriginal) => ({
  ...(await importOriginal()),
  isContractFixtureEnabled: () => fixture.enabled,
}));

const browserAgent = (await import("@/agent/subagents/browser-agent/agent"))
  .default;

/** Just enough of the model object to name which one was selected. */
const modelIdentitySchema = z.object({ modelId: z.string() });

function workerFor(authenticator: string) {
  const resolve = browserAgent.events["turn.started"];
  if (!resolve) throw new Error("Browser agent resolver unavailable");
  return resolve({}, dynamicContext(authenticator));
}

function dynamicContext(authenticator: string) {
  return {
    channel: { kind: "channel:linq", metadata: {} },
    messages: [],
    session: {
      auth: {
        current: {
          attributes: { workspaceId: "personal:workspace" },
          authenticator,
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
    },
  } satisfies DynamicResolveContext;
}

describe("the worker's model", () => {
  it("WF-01: is the real model when the contract fixture is off", async () => {
    fixture.enabled = false;

    const worker = await workerFor("test");

    // The production path, and the one that must not change: a real browser
    // assignment needs a real model with native image input.
    expect(worker).toMatchObject({ model: "openai/gpt-5.6-luna-fast" });
  });

  it("WF-02: is the contract fixture when the fixture is on", async () => {
    fixture.enabled = true;

    const worker = await workerFor("test");

    // Same switch the root uses. EVAL_CONTRACT_FIXTURE is never set in
    // production, so this cannot reach a user.
    // SAFETY: the resolver returns an agent definition or null; reading an
    // optional `model` off it asserts nothing about which model it holds, which
    // is what the parse below establishes.
    const model: unknown = (worker as { model?: unknown } | null)?.model;
    // Parsed rather than asserted: the resolver's return is the agent union.
    expect(modelIdentitySchema.parse(model).modelId).toBe("contract-fixture");
  });
});
