import type { EvalReporter } from "eve/evals/reporters";
import { recordManifestCase, recordManifestRun } from "@/evals/run-manifest";

// oxlint-disable eslint/no-restricted-properties -- Eve reporter configuration receives only local supervisor paths from its child environment.
// oxlint-disable turbo/no-undeclared-env-vars -- these local paths select an artifact, not a build input.

/**
 * Persists only when a paid-run supervisor has created an allowlisted local
 * manifest. Ordinary developer evals remain artifact-free.
 */
export const evalRunManifestReporter: EvalReporter = {
  async onEvalComplete(result) {
    const path = process.env.EVAL_RUN_MANIFEST_PATH;
    const attemptId = process.env.EVAL_RUN_MANIFEST_ATTEMPT_ID;
    if (!path || !attemptId) return;
    await recordManifestCase(path, attemptId, result);
  },
  async onRunComplete(summary) {
    const path = process.env.EVAL_RUN_MANIFEST_PATH;
    const attemptId = process.env.EVAL_RUN_MANIFEST_ATTEMPT_ID;
    if (!path || !attemptId) return;
    await recordManifestRun(path, attemptId, summary);
  },
  onRunStart() {
    // The supervisor creates the manifest before Eve starts.
  },
};
