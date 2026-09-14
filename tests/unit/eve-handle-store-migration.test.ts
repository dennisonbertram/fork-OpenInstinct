import { describe, expect, it } from "vitest";
import {
  AGENT_HANDLES_STATE_KEY,
  getAgentHandleStore,
} from "../../node_modules/eve/dist/src/subagents/handles/store.js";

describe("Eve agent handle store legacy migration", () => {
  it("normalizes legacy 0.49 addressed phase to available without throwing invalid_union", () => {
    const legacyState = {
      [AGENT_HANDLES_STATE_KEY]: {
        handles: [
          {
            address: {
              continuationToken: "tok_test",
              kind: "agent/local" as const,
              sessionId: "session_child_1",
            },
            identity: {
              id: "ag_browser:123456789012",
              name: "browser-agent",
              nodeId: "node_test",
            },
            phase: "addressed",
          },
        ],
      },
    };

    const store = getAgentHandleStore(legacyState);
    expect(store).toBeDefined();
    expect(store?.handles).toHaveLength(1);
    const firstHandle = store?.handles[0];
    expect(firstHandle?.phase).toBe("available");
    expect(firstHandle?.identity.name).toBe("browser-agent");
    expect(
      firstHandle && "address" in firstHandle
        ? firstHandle.address.sessionId
        : undefined
    ).toBe("session_child_1");
  });

  it("preserves native 0.54.3 available phase handles", () => {
    const nativeState = {
      [AGENT_HANDLES_STATE_KEY]: {
        handles: [
          {
            address: {
              continuationToken: "tok_test",
              kind: "agent/local" as const,
              sessionId: "session_child_2",
            },
            identity: {
              id: "ag_browser:987654321098",
              name: "browser-agent",
              nodeId: "node_test",
            },
            phase: "available" as const,
          },
        ],
      },
    };

    const store = getAgentHandleStore(nativeState);
    expect(store).toBeDefined();
    expect(store?.handles[0]?.phase).toBe("available");
  });

  it("migrates addressed handles in multiple session state formats", () => {
    const rawState = {
      [AGENT_HANDLES_STATE_KEY]: {
        handles: [
          {
            address: {
              continuationToken: "tok_test",
              kind: "agent/local" as const,
              sessionId: "session_child_3",
            },
            identity: {
              id: "ag_browser:112233445566",
              name: "browser-agent",
              nodeId: "node_test",
            },
            phase: "addressed",
          },
        ],
      },
    };

    const persisted = getAgentHandleStore(rawState);
    expect(persisted?.handles[0]?.phase).toBe("available");
  });
});
