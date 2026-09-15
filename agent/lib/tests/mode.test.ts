import type { DynamicResolveContext } from "eve";
import { describe, expect, it } from "vitest";
import { channelObservedAttributes, resolveModeValue } from "@/agent/lib/mode";

describe("channel-observed mode", () => {
  it("keeps a channel-observed initiator restricted after current changes", () => {
    expect(
      resolveModeValue(
        modeContext(fullPrincipal("authjs"), channelObservedPrincipal()),
        { "channel-observed": "restricted", interactive: "full" }
      )
    ).toBe("restricted");
  });

  it("allows the same server-verified OTP user to upgrade", () => {
    expect(
      resolveModeValue(
        modeContext(
          fullPrincipal("sendblue-message"),
          channelObservedPrincipal()
        ),
        { "channel-observed": "restricted", interactive: "full" }
      )
    ).toBe("full");
  });

  it("does not accept a mismatched canonical OTP tuple as an upgrade", () => {
    const values = { "channel-observed": "restricted", interactive: "full" };
    const canonical = fullPrincipal("sendblue-message");
    const mismatches = [
      { ...canonical, principalId: "better-auth:other-user" },
      {
        ...canonical,
        attributes: { ...canonical.attributes, workspaceId: "personal:other" },
      },
      {
        ...canonical,
        attributes: {
          ...canonical.attributes,
          conversationId: "other-conversation",
        },
      },
      {
        ...canonical,
        attributes: {
          ...canonical.attributes,
          channelBindingId: "other-binding",
        },
      },
    ];
    for (const current of mismatches) {
      expect(
        resolveModeValue(
          modeContext(current, channelObservedPrincipal()),
          values
        )
      ).toBe("restricted");
    }
  });

  it("fails closed when a channel-observed claim is incomplete", () => {
    expect(
      resolveModeValue(
        modeContext({
          ...channelObservedPrincipal(),
          attributes: {
            ...channelObservedPrincipal().attributes,
            identityProvenance: "wrong",
          },
        }),
        { "channel-observed": "restricted", interactive: "full" }
      )
    ).toBe("restricted");
  });

  it("fails closed when enrollment fields carry unknown values", () => {
    expect(
      resolveModeValue(
        modeContext({
          ...channelObservedPrincipal(),
          attributes: {
            authAssurance: "unknown",
            capabilityProfile: "other",
            channelBindingId: "binding-1",
            conversationChannel: "sendblue",
            conversationId: "conversation-1",
            identityProvenance: "other",
            workspaceId: "personal:workspace",
          },
        }),
        { "channel-observed": "restricted", interactive: "full" }
      )
    ).toBe("restricted");
  });

  it("does not let an altered initiator authenticator evade the ceiling", () => {
    expect(
      resolveModeValue(
        modeContext(fullPrincipal("authjs"), {
          ...channelObservedPrincipal(),
          authenticator: "runtime",
        }),
        { "channel-observed": "restricted", interactive: "full" }
      )
    ).toBe("restricted");
  });

  it("leaves the explicit OTP-verified SendBlue principal interactive", () => {
    expect(
      resolveModeValue(modeContext(fullPrincipal("sendblue-message")), {
        "channel-observed": "restricted",
        interactive: "full",
      })
    ).toBe("full");
  });
});

function channelObservedPrincipal() {
  return {
    attributes: {
      ...channelObservedAttributes,
      channelBindingId: "binding-1",
      conversationId: "conversation-1",
      workspaceId: "personal:workspace",
    },
    authenticator: "sendblue-message",
    principalId: "better-auth:user-1",
    principalType: "user" as const,
  };
}

function fullPrincipal(authenticator: string) {
  return {
    attributes: {
      authAssurance: "otp_verified",
      capabilityProfile: "full",
      channelBindingId: "binding-1",
      conversationChannel: "sendblue",
      conversationId: "conversation-1",
      identityProvenance: "phone_otp",
      workspaceId: "personal:workspace",
    },
    authenticator,
    principalId: "better-auth:user-1",
    principalType: "user" as const,
  };
}

function modeContext(
  current: ReturnType<typeof fullPrincipal>,
  initiator: ReturnType<typeof channelObservedPrincipal> | null = null
) {
  return {
    session: { auth: { current, initiator }, id: "session-1" },
  } satisfies Pick<DynamicResolveContext, "session">;
}
