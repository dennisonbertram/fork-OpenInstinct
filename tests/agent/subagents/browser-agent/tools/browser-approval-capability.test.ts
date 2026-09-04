import { beforeEach, describe, expect, it, vi } from "vitest";
import * as WorkerAccess from "@/agent/subagents/browser-agent/lib/access";
import * as OwnedBrowser from "@/agent/subagents/browser-agent/lib/owned-browser";
import { kernel } from "@/lib/kernel";
import { toolContextFor } from "@/tests/helpers/tool-context";
import computerAction from "@/agent/subagents/browser-agent/tools/computer_action";
import commitBrowserAction, {
  commitBrowserActionApproval,
  commitBrowserActionInputSchema,
} from "@/agent/subagents/browser-agent/tools/commit_browser_action";

const mocks = {
  batch: vi.spyOn(kernel.browsers.computer, "batch"),
  writeClipboard: vi.spyOn(kernel.browsers.computer, "writeClipboard"),
  requireOwnedBrowserSession: vi.spyOn(
    OwnedBrowser,
    "requireOwnedBrowserSession"
  ),
  requireWorkerScope: vi.spyOn(WorkerAccess, "requireWorkerScope"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkerScope.mockResolvedValue({
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  mocks.requireOwnedBrowserSession.mockResolvedValue({
    createdAt: "2026-09-03T00:00:00.000Z",
    sessionId: "browser-1",
    workerSessionId: "worker-session-1",
  });
  mocks.batch.mockResolvedValue();
  mocks.writeClipboard.mockResolvedValue();
});

describe("worker browser approval capability", () => {
  it("blocks raw coordinate mutation from bypassing the commit boundary", async () => {
    await expect(
      computerAction.execute(
        {
          actions: [
            {
              click_mouse: { x: 320, y: 240 },
              type: "click_mouse",
            },
          ],
          session_id: "browser-1",
        },
        toolContextFor({
          sessionId: "worker-session-1",
          parentSessionId: "root-session-1",
        })
      )
    ).rejects.toThrow(/raw coordinate/i);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("requires Eve approval on the typed consequential commit boundary", async () => {
    expect(commitBrowserAction.approval).toBeDefined();
    expect(commitBrowserAction.approval).toBe(commitBrowserActionApproval);
    expect(
      commitBrowserActionInputSchema.safeParse({
        action: "place_order",
        browser_session_id: "browser-1",
        frame_id: "checkout-frame",
        origin: "https://merchant.example",
        target_label: "button: Place order",
        target_ref: "e12",
        terms: {
          kind: "place_order",
          item: "Example item",
          merchant: "Example merchant",
          option: "Standard",
          quantity: 1,
          total: "USD 10.00",
        },
      }).success
    ).toBe(true);
  });

  it("rejects raw clipboard mutation instead of treating it as approved", async () => {
    await expect(
      computerAction.execute(
        {
          actions: [
            { type: "write_clipboard", write_clipboard: { text: "secret" } },
          ],
          session_id: "browser-1",
        },
        toolContextFor({ sessionId: "worker-session-1" })
      )
    ).rejects.toThrow(/clipboard/i);
    expect(mocks.writeClipboard).not.toHaveBeenCalled();
  });
});
