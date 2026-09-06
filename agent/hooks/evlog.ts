import { defineHook } from "eve/hooks";
import { defineEvlogHook } from "evlog/eve";
import {
  durationSince,
  readLinqAdmissionTiming,
  recordLinqLatencyStage,
  type LinqLatencyStages,
} from "@/agent/lib/linq/timing";

const evlogHook = defineEvlogHook({
  init: {
    env: { service: "open-instinct" },
    // Fork decision: production tenants' message content stays out of logs.
    redact: true,
  },
  message: "omit",
  redact: true,
  sessionEvent: true,
});

const evlogEvents = evlogHook.events ?? {};

export default defineHook({
  events: {
    ...evlogEvents,
    async "turn.started"(event, context) {
      await evlogEvents["turn.started"]?.(event, context);
      const timing = readLinqAdmissionTiming(context.session.auth.current);
      if (!timing) return;
      const eventAtMs = Date.parse(event.meta.at);
      if (!Number.isFinite(eventAtMs)) return;
      const stages: LinqLatencyStages = {
        admissionStartedAtMs: timing.admissionStartedAtMs,
        admissionToTurnStartMs: durationSince(
          timing.admissionStartedAtMs,
          eventAtMs
        ),
        phoneLookupMs: timing.phoneLookupMs,
        scopeVerificationMs: timing.scopeVerificationMs,
        bridgeSendStarted: timing.bridgeSendStartedAtMs !== undefined,
      };
      if (timing.identityLookupMs !== undefined)
        stages.identityLookupMs = timing.identityLookupMs;
      if (timing.bindingResolveMs !== undefined)
        stages.bindingResolveMs = timing.bindingResolveMs;
      if (timing.inboundClaimMs !== undefined)
        stages.inboundClaimMs = timing.inboundClaimMs;
      if (timing.pendingInputResolveMs !== undefined)
        stages.pendingInputResolveMs = timing.pendingInputResolveMs;
      if (timing.connectionInstallationMs !== undefined)
        stages.connectionInstallationMs = timing.connectionInstallationMs;
      if (timing.markReadMs !== undefined)
        stages.markReadMs = timing.markReadMs;
      if (timing.markReadSucceeded !== undefined)
        stages.markReadSucceeded = timing.markReadSucceeded;
      if (timing.bridgeSendStartedAtMs !== undefined) {
        stages.admissionToBridgeSendStartMs = durationSince(
          timing.admissionStartedAtMs,
          timing.bridgeSendStartedAtMs
        );
        stages.bridgeSendToTurnStartMs = durationSince(
          timing.bridgeSendStartedAtMs,
          eventAtMs
        );
      }
      recordLinqLatencyStage(context, stages);
    },
    async "step.started"(event, context) {
      await evlogEvents["step.started"]?.(event, context);
      const timing = readLinqAdmissionTiming(context.session.auth.current);
      if (!timing) return;
      const eventAtMs = Date.parse(event.meta.at);
      if (!Number.isFinite(eventAtMs)) return;
      recordLinqLatencyStage(
        context,
        {
          admissionToFirstStepStartedMs: durationSince(
            timing.admissionStartedAtMs,
            eventAtMs
          ),
          modelIsLunaFast: event.data.modelId === "openai/gpt-5.6-luna-fast",
        },
        "admissionToFirstStepStartedMs"
      );
    },
    async "message.appended"(event, context) {
      await evlogEvents["message.appended"]?.(event, context);
      const timing = readLinqAdmissionTiming(context.session.auth.current);
      if (!timing) return;
      const eventAtMs = Date.parse(event.meta.at);
      if (!Number.isFinite(eventAtMs)) return;
      recordLinqLatencyStage(
        context,
        {
          admissionToFirstAssistantTextDeltaMs: durationSince(
            timing.admissionStartedAtMs,
            eventAtMs
          ),
        },
        "admissionToFirstAssistantTextDeltaMs"
      );
    },
  },
});
