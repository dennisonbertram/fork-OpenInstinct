import type { DynamicResolveContext } from "eve/connections";
import { describe, expect, it, vi } from "vitest";

const squareAuth = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@/agent/lib/square/auth", () => ({ squareAuth }));
vi.mock("@/env", () => ({
  env: { SQUARE_BASE_URL: undefined, SQUARE_ENVIRONMENT: "sandbox" },
}));

const square = (await import("@/agent/connections/square")).default;

describe("Square dynamic connection capability boundary", () => {
  it("does not register Square or resolve its auth for a channel-observed sender", async () => {
    const resolve = square.events["session.started"];
    if (!resolve) throw new Error("Square session resolver unavailable");

    expect(await resolve({}, channelObservedContext())).toBeNull();
    expect(squareAuth).not.toHaveBeenCalled();
  });

  it("retains the existing Square auth with a durable non-secret instance key", async () => {
    const resolve = square.events["session.started"];
    if (!resolve) throw new Error("Square session resolver unavailable");

    expect(await resolve({}, fullContext())).toMatchObject({
      auth: squareAuth,
      instanceKey: "personal:workspace:better-auth:user-1",
    });
  });

  it("registers Square for an exact canonical OTP upgrade", async () => {
    const resolve = square.events["turn.started"];
    if (!resolve) throw new Error("Square turn resolver unavailable");

    expect(await resolve({}, upgradedContext())).toMatchObject({
      auth: squareAuth,
      instanceKey: "personal:workspace:better-auth:user-1",
    });
  });

  it("does not register Square for a mismatched canonical OTP tuple", async () => {
    const resolve = square.events["turn.started"];
    if (!resolve) throw new Error("Square turn resolver unavailable");

    const upgrade = upgradedContext();
    expect(await resolve({}, mismatchedUpgradeContext(upgrade))).toBeNull();
  });
});

function channelObservedContext() {
  return connectionContext({
    authAssurance: "channel_observed",
    capabilityProfile: "channel-basic",
    channelBindingId: "binding-1",
    conversationChannel: "sendblue",
    conversationId: "conversation-1",
    identityProvenance: "sendblue_direct",
    workspaceId: "personal:workspace",
  });
}

function fullContext() {
  return connectionContext({
    authAssurance: "otp_verified",
    capabilityProfile: "full",
    channelBindingId: "binding-1",
    conversationChannel: "sendblue",
    conversationId: "conversation-1",
    identityProvenance: "phone_otp",
    workspaceId: "personal:workspace",
  });
}

function upgradedContext() {
  const upgrade = fullContext();
  return {
    ...upgrade,
    session: {
      ...upgrade.session,
      auth: {
        ...upgrade.session.auth,
        initiator: channelObservedContext().session.auth.current,
      },
    },
  } satisfies DynamicResolveContext;
}

function mismatchedUpgradeContext(upgrade: ReturnType<typeof upgradedContext>) {
  return {
    ...upgrade,
    session: {
      ...upgrade.session,
      auth: {
        ...upgrade.session.auth,
        current: {
          ...upgrade.session.auth.current,
          attributes: {
            ...upgrade.session.auth.current.attributes,
            workspaceId: "personal:other",
          },
        },
      },
    },
  } satisfies DynamicResolveContext;
}

function connectionContext(attributes: Record<string, string>) {
  return {
    channel: { kind: "channel:sendblue" },
    messages: [],
    session: {
      auth: {
        current: {
          attributes,
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
