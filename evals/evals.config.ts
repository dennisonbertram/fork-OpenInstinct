import { defineEvalConfig } from "eve/evals";
import { browserBenchmarkReporter } from "@/evals/browser/benchmark-reporter";
import { squareEvalReporter } from "@/evals/square/square-reporter";

export default defineEvalConfig({
  judge: { model: "openai/gpt-5.4-mini" },
  maxConcurrency: 8,
  reporters: [browserBenchmarkReporter, squareEvalReporter],
  timeoutMs: 180_000,
});
