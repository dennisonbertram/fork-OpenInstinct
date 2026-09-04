import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  SubagentSession,
  SubagentStatus,
} from "@/app/_lib/subagent-sessions";
import { ActivityCard } from "./card";

const session = {
  callId: "call_1",
  childSessionId: "child_1",
  childStreamPath: "/eve/v1/session/child_1/stream",
  name: "researcher",
  sequence: 0,
  sessionId: "parent_1",
  task: "Review the design system",
  toolName: "researcher",
  turnId: "turn_1",
  workflowId: "workflow_1",
} satisfies SubagentSession;

describe("activity card task rows", () => {
  it("uses the compact task-row pattern with an explicit status label", () => {
    const markup = renderToStaticMarkup(
      <ActivityCard
        doneCount={0}
        eventsBySession={new Map()}
        onSelect={vi.fn<(sessionId: string) => void>()}
        onTraceViewChange={vi.fn<(view: "imessage" | "trace") => void>()}
        sessions={[session]}
        statuses={new Map<string, SubagentStatus>([["child_1", "working"]])}
        traceView="imessage"
        usage={{ costUsd: null, inputTokens: 3, outputTokens: 2 }}
        workingCount={1}
      />
    );

    expect(markup).toContain('aria-label="Researcher task, working"');
    expect(markup).toMatch(
      /<button[^>]*data-task-session="child_1"[^>]*class="[^"]*rounded-full/
    );
    expect(markup.indexOf(">working<")).toBeLessThan(
      markup.indexOf(">Researcher<")
    );
    expect(markup).toContain("Review the design system");
    expect(markup).not.toContain("Verified vendor records");
  });
});
