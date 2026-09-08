import type { SessionAuthContext, SessionContext } from "eve/context";
import type { InstrumentationStepStartedEventInput } from "eve/instrumentation";
import { useLogger as getEvlogLogger } from "evlog/eve";
import { z } from "zod";
import { env } from "@/env";

const admissionTimingAttribute = "linqAdmissionTiming";

const linqAdmissionTimingSchema = z.object({
  admissionStartedAtMs: z.number(),
  phoneLookupMs: z.number(),
  scopeVerificationMs: z.number(),
  scopeVerifiedAtMs: z.number(),
  identityLookupMs: z.number().optional(),
  bindingResolveMs: z.number().optional(),
  inboundClaimMs: z.number().optional(),
  pendingInputResolveMs: z.number().optional(),
  connectionInstallationMs: z.number().optional(),
  markReadMs: z.number().optional(),
  markReadSucceeded: z.boolean().optional(),
  bridgeSendStartedAtMs: z.number().optional(),
});

const serializedLinqAdmissionTimingSchema = z
  .string()
  .transform((value, context) => {
    try {
      const parsed = z.json().safeParse(JSON.parse(value));
      if (parsed.success) return parsed.data;
      context.addIssue({ code: "custom", message: "Invalid timing JSON." });
      return z.NEVER;
    } catch {
      context.addIssue({ code: "custom", message: "Invalid timing JSON." });
      return z.NEVER;
    }
  })
  .pipe(linqAdmissionTimingSchema);

const linqLatencyStagesSchema = z.object({
  admissionStartedAtMs: z.number().optional(),
  admissionToTurnStartMs: z.number().optional(),
  phoneLookupMs: z.number().optional(),
  scopeVerificationMs: z.number().optional(),
  identityLookupMs: z.number().optional(),
  bindingResolveMs: z.number().optional(),
  inboundClaimMs: z.number().optional(),
  pendingInputResolveMs: z.number().optional(),
  connectionInstallationMs: z.number().optional(),
  markReadMs: z.number().optional(),
  markReadSucceeded: z.boolean().optional(),
  bridgeSendStarted: z.boolean().optional(),
  admissionToBridgeSendStartMs: z.number().optional(),
  bridgeSendToTurnStartMs: z.number().optional(),
  admissionToFirstModelInputPreparedMs: z.number().optional(),
  admissionToFirstStepStartedMs: z.number().optional(),
  modelIsLunaFast: z.boolean().optional(),
  admissionToFirstAssistantTextDeltaMs: z.number().optional(),
  admissionToProviderPostStartMs: z.number().optional(),
  admissionToProviderAcceptedMs: z.number().optional(),
  providerPostAccepted: z.boolean().optional(),
});

const evlogTimingContextSchema = z
  .object({ linqLatency: linqLatencyStagesSchema.optional() })
  .loose();

export type LinqAdmissionTiming = z.infer<typeof linqAdmissionTimingSchema>;
export type LinqLatencyStages = z.infer<typeof linqLatencyStagesSchema>;

function isLinqLatencyProbeEnabled(
  auth: SessionAuthContext | null | undefined
) {
  return (
    env.LINQ_LATENCY_MODE === "on" &&
    env.LINQ_LATENCY_WORKSPACE_ID !== undefined &&
    auth?.authenticator === "linq-message" &&
    auth.attributes.workspaceId === env.LINQ_LATENCY_WORKSPACE_ID
  );
}

export function withLinqAdmissionTiming(
  auth: SessionAuthContext,
  timing: LinqAdmissionTiming
): SessionAuthContext {
  if (!isLinqLatencyProbeEnabled(auth)) return auth;
  return {
    ...auth,
    attributes: {
      ...auth.attributes,
      [admissionTimingAttribute]: JSON.stringify(timing),
    },
  };
}

export function readLinqAdmissionTiming(
  auth: SessionAuthContext | null | undefined
): LinqAdmissionTiming | undefined {
  if (!isLinqLatencyProbeEnabled(auth)) return undefined;
  const result = serializedLinqAdmissionTimingSchema.safeParse(
    auth?.attributes[admissionTimingAttribute]
  );
  return result.success ? result.data : undefined;
}

export function linqLatencyRuntimeContext(
  auth: SessionAuthContext | null | undefined,
  nowMs: number
) {
  const timing = readLinqAdmissionTiming(auth);
  if (!timing) return undefined;
  return {
    linqLatency: {
      admissionStartedAtMs: timing.admissionStartedAtMs,
      admissionToModelInputPreparedMs: durationSince(
        timing.admissionStartedAtMs,
        nowMs
      ),
      bridgeSendStarted: timing.bridgeSendStartedAtMs !== undefined,
    },
  };
}

export function recordLinqLatencyStage(
  context: SessionContext,
  values: LinqLatencyStages,
  onlyIfMissing?: keyof LinqLatencyStages
) {
  const timing = readLinqAdmissionTiming(context.session.auth.current);
  if (!timing) return;
  try {
    const logger = getEvlogLogger(context);
    const current = evlogTimingContextSchema.safeParse(logger.getContext().eve);
    const existing = current.success ? (current.data.linqLatency ?? {}) : {};
    if (onlyIfMissing !== undefined && existing[onlyIfMissing] !== undefined)
      return;
    logger.set({ eve: { linqLatency: { ...existing, ...values } } });
  } catch {
    // Instrumentation must never affect channel admission or delivery.
  }
}

export function recordLinqLatencyModelInputPrepared(
  input: InstrumentationStepStartedEventInput,
  preparedAtMs: number
) {
  const timing = readLinqAdmissionTiming(input.session.auth.current);
  if (!timing) return;
  try {
    const logger = getEvlogLogger({
      session: {
        id: input.session.id,
        turn: { id: input.turn.id },
      },
    });
    const current = evlogTimingContextSchema.safeParse(logger.getContext().eve);
    const existing = current.success ? (current.data.linqLatency ?? {}) : {};
    if (existing.admissionToFirstModelInputPreparedMs !== undefined) return;
    logger.set({
      eve: {
        linqLatency: {
          ...existing,
          admissionToFirstModelInputPreparedMs: durationSince(
            timing.admissionStartedAtMs,
            preparedAtMs
          ),
        },
      },
    });
  } catch {
    // Instrumentation must never affect model execution.
  }
}

export function durationSince(startedAtMs: number, endedAtMs: number) {
  return Math.max(0, endedAtMs - startedAtMs);
}
