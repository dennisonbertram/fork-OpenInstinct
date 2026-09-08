import { wrapLanguageModel, type LanguageModel } from "ai";
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
  firstModelProviderAttemptStarted: z.boolean().optional(),
  admissionToFirstModelProviderStartMs: z.number().optional(),
  firstModelProviderDoStreamReturnMs: z.number().optional(),
  firstModelProviderTimeToFirstConsumedChunkMs: z.number().optional(),
  firstModelProviderConsumedStreamLifetimeMs: z.number().optional(),
  firstModelProviderStreamCompleted: z.boolean().optional(),
  firstModelProviderStreamFailed: z.boolean().optional(),
  firstModelProviderStreamCancelled: z.boolean().optional(),
});

const evlogTimingContextSchema = z
  .object({ linqLatency: linqLatencyStagesSchema.optional() })
  .loose();

export type LinqAdmissionTiming = z.infer<typeof linqAdmissionTimingSchema>;
export type LinqLatencyStages = z.infer<typeof linqLatencyStagesSchema>;
type WrappableLanguageModel = Exclude<LanguageModel, string>;
interface LinqTimingContext {
  session: { id: string; turn: { id: string } };
}

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
  if (!readLinqAdmissionTiming(context.session.auth.current)) return false;
  return writeLinqLatencyStage(context, values, onlyIfMissing);
}

/**
 * Adds numeric-only model-stream timing for one eligible Linq turn. The wrapper
 * reads a source chunk only when its consumer pulls it; it never buffers,
 * tees, or inspects content. Its lifetime includes consumer backpressure.
 */
export function wrapLinqModelDurationProbe<
  Model extends WrappableLanguageModel,
>(
  model: Model,
  input: {
    auth: SessionAuthContext | null | undefined;
    sessionId: string;
    turnId: string | undefined;
  }
) {
  const timing = readLinqAdmissionTiming(input.auth);
  if (!timing || !input.turnId) return model;
  const context = {
    session: { id: input.sessionId, turn: { id: input.turnId } },
  };

  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      wrapStream: async ({ doStream }) => {
        const claimed = writeLinqLatencyStage(
          context,
          {
            firstModelProviderAttemptStarted: true,
            admissionToFirstModelProviderStartMs: durationSince(
              timing.admissionStartedAtMs,
              Date.now()
            ),
          },
          "firstModelProviderAttemptStarted"
        );
        if (!claimed) return doStream();

        const startedAtMs = Date.now();
        let result: Awaited<ReturnType<typeof doStream>>;
        try {
          result = await doStream();
        } catch (error) {
          writeLinqLatencyStage(context, {
            firstModelProviderStreamFailed: true,
          });
          throw error;
        }
        writeLinqLatencyStage(context, {
          firstModelProviderDoStreamReturnMs: durationSince(
            startedAtMs,
            Date.now()
          ),
        });
        try {
          return {
            ...result,
            // AI SDK middleware exposes the V4 stream here; preserve its inferred chunk union.
            // oxlint-disable-next-line typescript/no-unsafe-assignment
            stream: observeConsumedStream(result.stream, context, startedAtMs),
          };
        } catch {
          // A locked provider stream must continue unchanged if it cannot be observed.
          return result;
        }
      },
    },
  });
}

function observeConsumedStream<Chunk extends { type: string }>(
  stream: ReadableStream<Chunk>,
  context: LinqTimingContext,
  startedAtMs: number
) {
  const reader = stream.getReader();
  let released = false;
  let sawErrorChunk = false;
  let sawFirstChunk = false;
  let settled = false;
  let cancellationRequested = false;
  let cancellation: Promise<void> | undefined;

  const release = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };
  const recordOutcome = (values: LinqLatencyStages) => {
    if (settled) return;
    settled = true;
    writeLinqLatencyStage(context, {
      firstModelProviderConsumedStreamLifetimeMs: durationSince(
        startedAtMs,
        Date.now()
      ),
      ...values,
    });
  };

  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const next = await reader.read();
          if (cancellationRequested) {
            release();
            return;
          }
          if (next.done) {
            recordOutcome(
              sawErrorChunk
                ? { firstModelProviderStreamFailed: true }
                : { firstModelProviderStreamCompleted: true }
            );
            release();
            controller.close();
            return;
          }
          if (!sawFirstChunk) {
            sawFirstChunk = true;
            writeLinqLatencyStage(context, {
              firstModelProviderTimeToFirstConsumedChunkMs: durationSince(
                startedAtMs,
                Date.now()
              ),
            });
          }
          if (next.value.type === "error") sawErrorChunk = true;
          controller.enqueue(next.value);
        } catch (error) {
          if (!cancellationRequested) {
            recordOutcome({ firstModelProviderStreamFailed: true });
            controller.error(error);
          }
          release();
        }
      },
      async cancel(reason) {
        cancellationRequested = true;
        recordOutcome({ firstModelProviderStreamCancelled: true });
        cancellation ??= reader.cancel(reason);
        try {
          await cancellation;
        } finally {
          release();
        }
      },
    },
    { highWaterMark: 0 }
  );
}

function writeLinqLatencyStage(
  context: LinqTimingContext,
  values: LinqLatencyStages,
  onlyIfMissing?: keyof LinqLatencyStages
) {
  try {
    const logger = getEvlogLogger(context);
    const current = evlogTimingContextSchema.safeParse(logger.getContext().eve);
    const existing = current.success ? (current.data.linqLatency ?? {}) : {};
    if (onlyIfMissing !== undefined && existing[onlyIfMissing] !== undefined)
      return false;
    logger.set({ eve: { linqLatency: { ...existing, ...values } } });
    return true;
  } catch {
    // Instrumentation must never affect channel admission, delivery, or model execution.
    return false;
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
