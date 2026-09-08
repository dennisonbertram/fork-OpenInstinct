import { otelIntegration, type SpanProcessor } from "eve/instrumentation/otel";
import { disableInstrumentation } from "eve/instrumentation";
import { z } from "zod";
import { isWorkflowResumeTimingEnabled } from "@/env";

const RESUME_STEP_SPAN = "step.execute turnStep";
const RESUME_TRIGGER = "hook";
const finiteDuration = z.number().nonnegative();
const timingSpanSchema = z.object({
  name: z.literal(RESUME_STEP_SPAN),
  attributes: z.object({
    "workflow.resume.phase.producer_prep_ms": finiteDuration,
    "workflow.resume.phase.queue_delivery_ms": finiteDuration,
    "workflow.resume.phase.resume_setup_ms": finiteDuration,
    "workflow.resume.phase.replay_ms": finiteDuration,
    "workflow.resume.phase.step_dispatch_ms": finiteDuration,
    "workflow.resume.phase.step_claim_ms": finiteDuration,
    "workflow.resume.phase.step_prepare_ms": finiteDuration,
    "workflow.resume.total_ms": finiteDuration,
    "workflow.resume.trigger": z.literal(RESUME_TRIGGER),
  }),
});

function timingRecordFromSpan(span: Parameters<SpanProcessor["onEnd"]>[0]) {
  const result = timingSpanSchema.safeParse(span);
  if (!result.success) return undefined;

  return { event: "workflow.resume.timing", ...result.data.attributes };
}

const workflowResumeTimingProcessor: SpanProcessor = {
  onStart() {
    return undefined;
  },
  onEnd(span) {
    const record = timingRecordFromSpan(span);
    if (record !== undefined) console.info(JSON.stringify(record));
  },
  forceFlush() {
    return Promise.resolve();
  },
  shutdown() {
    return Promise.resolve();
  },
};

export default isWorkflowResumeTimingEnabled()
  ? otelIntegration({ spanProcessors: [workflowResumeTimingProcessor] })
  : disableInstrumentation();
