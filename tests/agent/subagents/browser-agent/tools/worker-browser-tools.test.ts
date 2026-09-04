import { beforeEach, describe, expect, it, vi } from "vitest";
import * as WorkerAccess from "@/agent/subagents/browser-agent/lib/access";
import * as OwnedBrowser from "@/agent/subagents/browser-agent/lib/owned-browser";
import { kernel } from "@/lib/kernel";
import { toolContextFor } from "@/tests/helpers/tool-context";
import computerAction from "@/agent/subagents/browser-agent/tools/computer_action";

const mocks = {
  batch: vi.spyOn(kernel.browsers.computer, "batch"),
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
    createdAt: "2026-08-31T00:00:00.000Z",
    sessionId: "browser-1",
    workerSessionId: "worker-session-1",
  });
  mocks.batch.mockResolvedValue();
});

describe("worker browser tools", () => {
  it("sends contiguous reversible computer actions through Kernel batch", async () => {
    const execute = computerAction.execute;
    const context = toolContextFor();
    const result = await execute(
      {
        actions: [
          { sleep: { duration_ms: 100 }, type: "sleep" },
          { scroll: { x: 10, y: 20, delta_y: 4 }, type: "scroll" },
        ],
        session_id: "browser-1",
      },
      context
    );

    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(mocks.batch).toHaveBeenCalledWith(
      "browser-1",
      {
        actions: [
          { sleep: { duration_ms: 100 }, type: "sleep" },
          { scroll: { x: 10, y: 20, delta_y: 4 }, type: "scroll" },
        ],
      },
      { signal: context.abortSignal }
    );
    expect(result).toMatchObject({ data: undefined });
  });
});
