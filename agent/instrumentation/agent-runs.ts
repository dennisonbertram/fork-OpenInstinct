import {
  agentRuns,
  composeSpanExportPolicies,
  redactSpanInputs,
  redactSpanOutputs,
  type SpanExportPolicy,
} from "eve/instrumentation/otel";
import { disableInstrumentation } from "eve/instrumentation";
import { isWorkflowResumeTimingEnabled } from "@/env";

const ALLOWED_ATTRIBUTES = new Set([
  "agent.channel.delivery.outcome",
  "agent.channel.delivery.id",
  "agent.channel.kind",
  "agent.channel.name",
  "agent.channel.request.id",
  "agent.framework.name",
  "agent.framework.version",
  "agent.model.id",
  "agent.model.provider",
  "agent.name",
  "agent.session.id",
  "agent.step.attempt",
  "agent.step.index",
  "agent.turn.id",
  "agent.turn.sequence",
  "ai.telemetry.functionId",
  "deployment.id",
  "error.type",
  "eve.environment",
  "eve.link.type",
  "eve.version",
  "gen_ai.agent.name",
  "gen_ai.conversation.id",
  "gen_ai.operation.name",
  "gen_ai.provider.name",
  "gen_ai.request.model",
  "workflow.events.pages_loaded",
  "workflow.events.count",
  "workflow.events.pages",
  "workflow.execution_mode",
  "workflow.queue.deserialize_time_ms",
  "workflow.queue.execution_time_ms",
  "workflow.queue.overhead_ms",
  "workflow.queue.serialize_time_ms",
  "workflow.resume.phase.producer_prep_ms",
  "workflow.resume.phase.queue_delivery_ms",
  "workflow.resume.phase.replay_ms",
  "workflow.resume.phase.resume_setup_ms",
  "workflow.resume.phase.step_claim_ms",
  "workflow.resume.phase.step_dispatch_ms",
  "workflow.resume.phase.step_prepare_ms",
  "workflow.resume.setup_source",
  "workflow.resume.step_execution",
  "workflow.resume.strategy",
  "workflow.resume.total_ms",
  "workflow.resume.trigger",
  "workflow.resume_setup_source",
  "workflow.replay.load.source",
  "workflow.route.entrypoint_age_ms",
  "workflow.route.handler_cached",
  "workflow.route.invocation_count",
  "workflow.route.module_body_init_ms",
  "workflow.route.type",
  "step.final_scheduling_replay_ms",
  "step.rsfs_ms",
  "step.ttfs_ms",
]);

// These are the fixed resume-path names emitted by Eve 0.49.0's compiled
// Workflow runtime. Its phase measurements are attached to the outer
// `step.execute ${stepName}` span. The runtime derives the visible suffix from
// a step identifier, so exporting a prefix or a general pattern would create a
// content-export surface. Keep only the three framework-owned step identifiers
// registered by the bundled agent runtime.
const ALLOWED_SPAN_NAMES = new Set([
  "agent.channel.delivery",
  "ai.eve.turn",
  "workflow.bundle.compile",
  "workflow.bundle.evaluate",
  "workflow.execute",
  "workflow.hook_received.create.start",
  "workflow.input.hydrate",
  "workflow.precondition_reinvocations",
  "workflow.precondition_restarts",
  "workflow.replay.execute",
  "workflow.replay.load",
  "workflow.route.flow",
  "workflow.route.get_world",
  "workflow.route.get_world_handlers",
  "workflow.route.init",
  "workflow.run_started.create.start",
  "workflow.vm.create_context",
  "step.execute dispatchTurnStep",
  "step.execute settleCancelledTurnStep",
  "step.execute turnStep",
]);

const metadataOnlyPolicy: SpanExportPolicy = {
  span({ name }) {
    return ALLOWED_SPAN_NAMES.has(name);
  },
  attribute({ key }) {
    return ALLOWED_ATTRIBUTES.has(key)
      ? { action: "keep" }
      : { action: "drop" };
  },
};

export default isWorkflowResumeTimingEnabled()
  ? agentRuns({
      exportPolicy: composeSpanExportPolicies(
        redactSpanInputs(),
        redactSpanOutputs(),
        metadataOnlyPolicy
      ),
    })
  : disableInstrumentation();
