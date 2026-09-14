import type { DynamicResolveContext } from "eve";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const applicationOrigin = vi.hoisted(() =>
  vi.fn<() => string>(() => "https://jory.example.test")
);

vi.mock("@/lib/application-origin", () => ({ applicationOrigin }));
vi.mock("eve/instructions", () => ({
  defineDynamic: <T>(definition: T) => definition,
  defineInstructions: <T>(definition: T) => definition,
}));

const role = (await import("@/agent/instructions/20-role")).default;

describe("channel-observed business role", () => {
  it("offers the configured secure web path without inventing a connection URL", async () => {
    const resolve = role.events["turn.started"];
    if (!resolve) throw new Error("Role resolver unavailable");

    const resolved = await resolve({}, channelObservedContext());

    expect(applicationOrigin).toHaveBeenCalledOnce();
    const content = z.object({ content: z.string() }).parse(resolved).content;
    expect(content).toContain(
      "https://jory.example.test/sign-in?callbackUrl=%2F"
    );
    expect(content).toContain("small business");
    expect(content).toContain("Square");
    expect(content).toContain("public web sources");
    expect(content).toMatch(/ask a\s+clarification/);
    expect(content).toContain("same session");
    expect(content).toMatch(
      /Never ask for a\s+password or one-time code in chat/
    );
    expect(content).not.toMatch(/https?:\/\/(?!jory\.example\.test)/);
  });
});

function channelObservedContext() {
  return {
    channel: { kind: "channel:sendblue" },
    messages: [],
    session: {
      auth: {
        current: {
          attributes: {
            authAssurance: "channel_observed",
            capabilityProfile: "channel-basic",
            channelBindingId: "binding-1",
            conversationChannel: "sendblue",
            conversationId: "conversation-1",
            identityProvenance: "sendblue_direct",
            workspaceId: "personal:workspace",
          },
          authenticator: "sendblue-message",
          principalId: "better-auth:user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
    },
  } satisfies DynamicResolveContext;
}
