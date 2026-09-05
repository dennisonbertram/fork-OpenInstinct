import type { MessageStreamEvent } from "eve/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SubagentPanel } from ".";

vi.mock("./use-chat-usage", () => ({
  useChatUsage: () => ({ costUsd: null, inputTokens: 0, outputTokens: 0 }),
}));
vi.mock("./preview", () => ({
  TracePreview: () => {
    throw new Error("No child trace should open for task status");
  },
}));

function rootEvents(delivery: string): MessageStreamEvent[] {
  return [
    {
      type: "subagent.called",
      meta: { id: "called", at: "2026-09-05T13:00:00Z" },
      data: {
        callId: "call",
        childSessionId: "child",
        childStreamPath: "/child/stream",
        name: "browser-agent",
        sequence: 0,
        sessionId: "root",
        toolName: "browser-agent",
        turnId: "turn",
        workflowId: "workflow",
      },
    },
    {
      type: "subagent.completed",
      meta: { id: "receipt", at: "2026-09-05T13:00:01Z" },
      data: {
        callId: "call",
        subagentName: "browser-agent",
        backgroundTask: { taskId: "task", status: "working" },
        output: "working",
      },
    },
    {
      type: "message.received",
      meta: { id: "delivery", at: "2026-09-05T13:01:00Z" },
      data: {
        message: `Background task task (browser-agent) ${delivery}`,
        sequence: 1,
        turnId: "result",
      },
    },
  ];
}

describe("normal task status from parent receipts", () => {
  it.each([
    ["is completed.\n\nResult:\nDone", "complete", "0 working", "1 done"],
    ["is cancelled.", "cancelled", "0 working", "1 done"],
    ["failed.\n\nError:\nUnavailable", "failed", "0 working", "1 done"],
    ["needs input.", "starting", "1 working", "0 done"],
  ])(
    "renders %s without opening child trace",
    (delivery, status, working, done) => {
      const markup = renderToStaticMarkup(
        <SubagentPanel
          events={rootEvents(delivery)}
          historyComplete
          onTraceViewChange={vi.fn<(view: "imessage" | "trace") => void>()}
          traceView="imessage"
        />
      );
      expect(markup).toContain(`aria-label="Browser-agent task, ${status}"`);
      expect(markup).toContain(working);
      expect(markup).toContain(done);
    }
  );
});
