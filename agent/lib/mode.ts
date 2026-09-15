import type { DynamicResolveContext } from "eve";
import type { SessionAuthContext } from "eve/context";
import { defineInstructions } from "eve/instructions";
import { z } from "zod";

interface AgentModeContext {
  readonly session: {
    readonly auth: Pick<
      DynamicResolveContext["session"]["auth"],
      "current" | "initiator"
    >;
  };
}

export const channelObservedAttributes = {
  authAssurance: "channel_observed",
  capabilityProfile: "channel-basic",
  conversationChannel: "sendblue",
  identityProvenance: "sendblue_direct",
} as const;

const otpVerifiedAttributes = {
  authAssurance: "otp_verified",
  capabilityProfile: "full",
  identityProvenance: "phone_otp",
} as const;

const channelObservedAttributeSchema = z.object({
  authAssurance: z.literal(channelObservedAttributes.authAssurance),
  capabilityProfile: z.literal(channelObservedAttributes.capabilityProfile),
  channelBindingId: z.string().min(1),
  conversationChannel: z.literal(channelObservedAttributes.conversationChannel),
  conversationId: z.string().min(1),
  identityProvenance: z.literal(channelObservedAttributes.identityProvenance),
  workspaceId: z.string().min(1),
});
const otpVerifiedAttributeSchema = z.object({
  authAssurance: z.literal(otpVerifiedAttributes.authAssurance),
  capabilityProfile: z.literal(otpVerifiedAttributes.capabilityProfile),
  channelBindingId: z.string().min(1),
  conversationChannel: z.literal("sendblue"),
  conversationId: z.string().min(1),
  identityProvenance: z.literal(otpVerifiedAttributes.identityProvenance),
  workspaceId: z.string().min(1),
});
const sessionAuthAttributesSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())])
);

type ChannelObservedClaim = "absent" | "malformed" | "restricted";

function channelObservedClaim(
  principal: SessionAuthContext | null
): ChannelObservedClaim {
  if (!principal) return "absent";

  const parsedAttributes = sessionAuthAttributesSchema.safeParse(
    principal.attributes
  );
  // Route-auth principals always carry attributes. A malformed caller cannot
  // establish that it has no enrollment claim, so keep the capability ceiling.
  if (!parsedAttributes.success) return "malformed";
  const attributes = parsedAttributes.data;
  const hasEnrollmentMarker =
    "authAssurance" in attributes ||
    "capabilityProfile" in attributes ||
    "identityProvenance" in attributes ||
    "channelBindingId" in attributes;
  if (!hasEnrollmentMarker) return "absent";

  if (isExplicitOtpPrincipal(principal)) return "absent";

  return principal.principalType === "user" &&
    principal.authenticator === "sendblue-message" &&
    principal.principalId.startsWith("better-auth:") &&
    channelObservedAttributeSchema.safeParse(attributes).success
    ? "restricted"
    : "malformed";
}

function isExplicitOtpPrincipal(principal: SessionAuthContext) {
  return (
    principal.authenticator === "sendblue-message" &&
    principal.principalType === "user" &&
    principal.principalId.startsWith("better-auth:") &&
    otpVerifiedAttributeSchema.safeParse(principal.attributes).success
  );
}

function isVerifiedChannelUpgrade(context: AgentModeContext) {
  const { current, initiator } = context.session.auth;
  if (
    !initiator ||
    !current ||
    channelObservedClaim(initiator) !== "restricted" ||
    !isExplicitOtpPrincipal(current)
  ) {
    return false;
  }

  // SendBlue constructs `current` only after its DB-backed identity resolver
  // verifies the provider binding and the canonical OTP identity. Keep the
  // session history, but lift the ceiling only for that exact identity and
  // immutable conversation binding.
  return (
    current.principalId === initiator.principalId &&
    current.attributes.workspaceId === initiator.attributes.workspaceId &&
    current.attributes.conversationChannel ===
      initiator.attributes.conversationChannel &&
    current.attributes.conversationId === initiator.attributes.conversationId &&
    current.attributes.channelBindingId ===
      initiator.attributes.channelBindingId
  );
}

export function isChannelObservedSession(context: AgentModeContext) {
  const { auth } = context.session;
  if (isVerifiedChannelUpgrade(context)) return false;

  // Initiator remains the durable ceiling for malformed claims or another
  // caller. Only the narrow canonical OTP upgrade above may lift it.
  return (
    channelObservedClaim(auth.initiator) !== "absent" ||
    channelObservedClaim(auth.current) !== "absent"
  );
}

function agentMode(authenticator: string | undefined) {
  if (authenticator === "scheduled-worker") return "scheduled-worker" as const;
  if (authenticator === "scheduled-result") return "scheduled-report" as const;
  return "interactive" as const;
}

type AgentMode = ReturnType<typeof agentMode> | "channel-observed";

function sessionAgentMode(context: AgentModeContext) {
  const { auth } = context.session;
  if (isChannelObservedSession(context)) return "channel-observed" as const;
  if (auth.initiator?.authenticator === "scheduled-worker") {
    return "scheduled-worker" as const;
  }
  const caller = auth.current ?? auth.initiator;
  return agentMode(caller?.authenticator);
}

export function resolveModeValue<T>(
  context: AgentModeContext,
  valueByMode: Partial<Record<AgentMode, T>>
) {
  return valueByMode[sessionAgentMode(context)] ?? null;
}

export function resolveModeInstructions(
  context: DynamicResolveContext,
  contentByMode: Partial<Record<AgentMode, string>>
) {
  const content = resolveModeValue(context, contentByMode);
  return content === null ? null : defineInstructions({ content });
}
