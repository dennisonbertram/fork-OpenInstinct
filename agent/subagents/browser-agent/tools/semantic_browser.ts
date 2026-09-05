import { z } from "zod";
import {
  loop,
  type BrowserActResult,
  type LoopToolExecutionResult,
  type LoopToolSpec,
} from "@onkernel/browser-loop";
import {
  defineDynamic,
  defineTool,
  toolOutput,
  toolOutputPart,
} from "eve/tools";
import { requireWorkerScope } from "@/agent/subagents/browser-agent/lib/access";
import { requireOwnedBrowserSession } from "@/agent/subagents/browser-agent/lib/owned-browser";
import {
  browserRefStateForSession,
  executeBrowserLoopTool,
  modelText,
} from "../lib/semantic-loop";
import {
  browserActionTargets,
  browserActionTargetsJson,
  redactBrowserValues,
} from "../lib/browser-action-targets";
import { isVaultFilledBrowserSession } from "../lib/vault-browser-guard";

/* oxlint-disable anti-slop/no-known-value-widening, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- Browser Loop supplies runtime-selected JSON Schemas and JSON inputs, so this adapter must preserve its dynamic vendor boundary. */

const allSpecs = [
  loop.tools.browser.snapshot(),
  loop.tools.browser.text(),
  loop.tools.browser.find(),
  loop.tools.browser.navigate(),
  loop.tools.browser.waitFor(),
  loop.tools.browser.act(),
];
const specsByName = new Map(allSpecs.map((spec) => [spec.name, spec]));
const relaxedBrowserActTimeoutMs = 8_000;
const relaxedBrowserActSnapshotCharacters = 4_000;
const relaxedBrowserActOutputCharacters = 6_000;

export default defineDynamic({
  events: {
    "session.started": () => {
      return Object.fromEntries(
        allSpecs.map((spec) => [
          spec.name,
          defineTool({
            description: toolDescription(spec),
            execute: executeSemanticTool,
            inputSchema: withSessionId(spec),
            toModelOutput,
          }),
        ])
      );
    },
  },
});

async function executeSemanticTool(
  input: Record<string, unknown>,
  context: Parameters<typeof requireWorkerScope>[0] & {
    abortSignal?: AbortSignal;
    toolName: string;
  }
) {
  const spec = specsByName.get(context.toolName);
  if (!spec) {
    throw new Error(`Unknown Browser Loop tool: ${context.toolName}`);
  }

  const scope = await requireWorkerScope(context);
  const { sessionId, toolInput } = splitSessionInput(input);
  await requireOwnedBrowserSession(scope, sessionId);
  const output = await executeBrowserLoopTool(
    sessionId,
    spec,
    boundedToolInput(spec, toolInput),
    context.abortSignal
  );
  return isVaultFilledBrowserSession(sessionId)
    ? redactVaultFilledBrowserOutput(output)
    : withActionTargets(output, spec, sessionId);
}

function withActionTargets(
  output: LoopToolExecutionResult,
  spec: LoopToolSpec,
  sessionId: string
): LoopToolExecutionResult {
  if (spec.name !== "browser_snapshot" && spec.name !== "browser_find")
    return output;
  const targets = browserActionTargets(
    sessionId,
    modelText(output),
    browserRefStateForSession(sessionId)
  );
  if (targets.length === 0) return output;
  return {
    ...output,
    content: [
      ...output.content,
      {
        type: "text",
        text: `Observed action targets (pass target_ref and target_token into interact_browser_element or commit_browser_action; display_label is for choosing the target only; use browser_find if your target is absent):\n${browserActionTargetsJson(targets)}`,
      },
    ],
  };
}

function boundedToolInput(spec: LoopToolSpec, input: Record<string, unknown>) {
  if (spec.name === "browser_snapshot" && input.ref === "root") {
    const freshPageInput = { ...input };
    delete freshPageInput.ref;
    return freshPageInput;
  }
  if (spec.name === "browser_act") {
    return relaxedBrowserActInput(input);
  }
  return input;
}

// Keep the vendor's finite verification evidence, never page-derived text.
const vaultWaitEvidenceSchema = z.object({
  status: z.enum(["satisfied", "timed_out", "unverifiable", "interrupted"]),
  evidence: z.enum(["preexisting", "newly_verified", "failed", "unverifiable"]),
  elapsed_ms: z.number().nonnegative(),
  final: z.object({ truth: z.boolean().optional() }),
  reason: z
    .enum([
      "navigation",
      "dialog",
      "target_changed",
      "target_detached",
      "stale_ref",
      "observation_failed",
      "incomplete_observation",
    ])
    .optional(),
});

function redactVaultFilledBrowserOutput(output: LoopToolExecutionResult) {
  const wait = vaultWaitEvidenceSchema.safeParse(
    output.details.readResults?.find((read) => read.type === "browser_wait_for")
      ?.result
  );
  return {
    ...output,
    content: [
      {
        type: "text" as const,
        text: wait.success
          ? `Browser wait verification: ${JSON.stringify(wait.data)}. Sensitive browser content omitted after vault autofill.`
          : "Sensitive browser content omitted after vault autofill.",
      },
    ],
    details: {
      statusText: "Sensitive browser content omitted after vault autofill.",
      skippedActions: output.details.skippedActions,
      isError: output.details.isError,
    },
  };
}

function boundedTimeout(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, 1), maximum)
    : maximum;
}

function toModelOutput(output: LoopToolExecutionResult) {
  if (browserActResult(output)) {
    return toolOutput.text(relaxedBrowserActModelText(output));
  }
  const parts = output.content.map((part) =>
    part.type === "text"
      ? toolOutputPart.text(redactBrowserValues(part.text))
      : toolOutputPart.file(part.data, { mediaType: part.mimeType })
  );
  return parts.length > 0
    ? toolOutput.content(parts)
    : toolOutput.text(modelText(output));
}

function splitSessionInput(input: Record<string, unknown>) {
  const sessionId = input.session_id;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error("A browser session ID is required.");
  }
  const { session_id: _sessionId, ...toolInput } = input;
  return { sessionId, toolInput };
}

function withSessionId(spec: LoopToolSpec) {
  const schema: Record<string, unknown> = {
    ...(spec.name === "browser_act"
      ? relaxedBrowserActSchema(spec.declaration.parameters)
      : spec.name === "browser_wait_for"
        ? atomicLocationWaitSchema(spec.declaration.parameters)
        : spec.declaration.parameters),
  };
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  return {
    ...schema,
    additionalProperties: false,
    properties: {
      session_id: {
        description: "Owned Kernel browser session ID.",
        minLength: 1,
        type: "string",
      },
      ...properties,
    },
    required: ["session_id", ...required],
    type: "object",
  };
}

// Avoid optional URL/title operators becoming empty/false placeholders in model calls.
// Deliberate conjunctions remain expressible through the vendor's `all` leaves.
function atomicLocationWaitSchema(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const schema = structuredClone(value);
  const properties = isRecord(schema.properties) ? schema.properties : {};
  function visit(condition: unknown) {
    if (!isRecord(condition)) return;
    if (Array.isArray(condition.anyOf)) condition.anyOf.forEach(visit);
    const fields = isRecord(condition.properties) ? condition.properties : {};
    for (const group of [fields.all, fields.any]) {
      if (isRecord(group)) visit(group.items);
    }
    const type = isRecord(fields.type) ? fields.type : undefined;
    const variants = type && Array.isArray(type.anyOf) ? type.anyOf : [];
    if (
      variants.length === 0 ||
      !variants.every(
        (variant) =>
          isRecord(variant) &&
          (variant.const === "url" || variant.const === "title")
      )
    )
      return;
    const required = Array.isArray(condition.required)
      ? condition.required
      : [];
    const operator = ["equals", "contains", "changed"].find((key) =>
      required.includes(key)
    );
    if (!operator) return;
    condition.properties = { type: fields.type, [operator]: fields[operator] };
    condition.additionalProperties = false;
  }
  visit(properties.expect);
  return schema;
}

function toolDescription(spec: LoopToolSpec) {
  if (spec.name !== "browser_act") return spec.declaration.description;
  return "Run 1–8 short dependent browser actions against current refs without waiting for model-authored postconditions. The result distinguishes dispatch failures and browser boundaries, then returns a compact successor state. Use current refs from browser_snapshot or browser_find; snapshot again after navigation, a stale ref, or an unavailable successor.";
}

function relaxedBrowserActInput(input: Record<string, unknown>) {
  const {
    expect: _expect,
    poll_ms: _pollMs,
    timeout_ms: _timeoutMs,
    ...relaxed
  } = input;
  const steps = Array.isArray(relaxed.steps)
    ? relaxed.steps.map((step) => {
        if (!isRecord(step)) {
          throw new Error("A relaxed browser action step must be an object.");
        }
        const {
          expect: _stepExpect,
          timeout_ms: _stepTimeoutMs,
          ...action
        } = step;
        if (action.type === "click" || action.type === "key") {
          throw new Error(
            "Consequential browser clicks and keys require commit_browser_action."
          );
        }
        return action;
      })
    : relaxed.steps;
  const successor = isRecord(relaxed.successor)
    ? {
        ...relaxed.successor,
        depth: boundedTimeout(relaxed.successor.depth, 8),
      }
    : { depth: 6, filter: "interactive" };
  return {
    ...relaxed,
    steps,
    successor,
    timeout_ms: relaxedBrowserActTimeoutMs,
  };
}

function relaxedBrowserActSchema(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const schema = structuredClone(value);
  const properties = isRecord(schema.properties) ? schema.properties : {};
  delete properties.expect;
  delete properties.poll_ms;
  delete properties.timeout_ms;

  const steps = isRecord(properties.steps) ? properties.steps : undefined;
  if (steps) {
    steps.maxItems = 8;
    const items = isRecord(steps.items) ? steps.items : undefined;
    const variants = items && Array.isArray(items.anyOf) ? items.anyOf : [];
    for (const variant of variants) {
      if (!isRecord(variant)) continue;
      const stepProperties = isRecord(variant.properties)
        ? variant.properties
        : undefined;
      if (!stepProperties) continue;
      delete stepProperties.expect;
      delete stepProperties.timeout_ms;
    }
  }
  return schema;
}

function relaxedBrowserActModelText(output: LoopToolExecutionResult) {
  const result = browserActResult(output);
  if (!result) {
    return truncate(modelText(output), relaxedBrowserActOutputCharacters);
  }

  const dispatched = result.steps.filter((step) =>
    step.diagnostics.includes("action dispatched")
  ).length;
  const uncertain =
    result.stop_reason === "action_failed" ||
    result.stop_reason === "global_timeout" ||
    result.stop_reason === "step_timeout";
  const status =
    dispatched === 0
      ? "not_dispatched"
      : uncertain
        ? "uncertain"
        : "dispatched";
  const lines = [
    `browser_act: ${status}`,
    `dispatched_steps: ${String(dispatched)}`,
  ];
  if (result.stop_reason) lines.push(`boundary: ${result.stop_reason}`);
  for (const step of result.steps) {
    const diagnostics = step.diagnostics.filter(
      (diagnostic) => diagnostic !== "action dispatched"
    );
    if (diagnostics.length > 0) {
      lines.push(
        `step ${String(step.index)} ${step.type}: ${diagnostics.join("; ")}`
      );
    }
  }

  if (result.successor.status === "unavailable") {
    lines.push(`successor unavailable: ${result.successor.error}`);
  } else {
    lines.push(
      `state_changed: ${String(result.successor.diff.changed)}`,
      `successor: ${result.successor.title} (${result.successor.url})`,
      "current interactive state:",
      truncate(result.successor.text, relaxedBrowserActSnapshotCharacters)
    );
  }
  return truncate(lines.join("\n"), relaxedBrowserActOutputCharacters);
}

function browserActResult(output: LoopToolExecutionResult) {
  for (const read of output.details.readResults ?? []) {
    if (!isRecord(read) || read.type !== "browser_act") continue;
    if (isBrowserActResult(read.result)) return read.result;
  }
  return undefined;
}

function isBrowserActResult(value: unknown): value is BrowserActResult {
  return (
    isRecord(value) && Array.isArray(value.steps) && isRecord(value.successor)
  );
}

function truncate(value: string, limit: number) {
  value = redactBrowserValues(value);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[truncated ${String(value.length - limit)} characters]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
