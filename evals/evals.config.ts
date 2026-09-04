import { defineEvalConfig } from "eve/evals";
import { browserBenchmarkReporter } from "@/evals/browser/benchmark-reporter";
import { evalRunManifestReporter } from "@/evals/run-manifest-reporter";
import { squareEvalReporter } from "@/evals/square/square-reporter";
import { evalRunDefaults } from "./eval-run-defaults";

export { evalRunDefaults } from "./eval-run-defaults";

export default defineEvalConfig({
  judge: { model: evalRunDefaults.judgeModel },
  maxConcurrency: evalRunDefaults.maxConcurrency,
  reporters: [
    browserBenchmarkReporter,
    squareEvalReporter,
    evalRunManifestReporter,
  ],
  timeoutMs: evalRunDefaults.timeoutMs,
});
