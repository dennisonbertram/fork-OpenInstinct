import type { EvalReporter } from "eve/evals/reporters";
import { recordManifestRun } from "@/evals/run-manifest";

/**
 * Persists only when a paid-run supervisor has created an allowlisted local
 * manifest. Ordinary developer evals remain artifact-free.
 */
export const evalRunManifestReporter: EvalReporter = {
  onEvalComplete() {},
  async onRunComplete(summary) {
    const path = process.env.EVAL_RUN_MANIFEST_PATH;
    const attemptId = process.env.EVAL_RUN_MANIFEST_ATTEMPT_ID;
    if (!path || !attemptId) return;
    await recordManifestRun(path, attemptId, summary);
  },
  onRunStart() {},
};
