import { completeLaneIds } from "./verification/lanes.ts";
import { runVerification, type RunnerOptions } from "./verification/runner.ts";

const usage = [
  "Usage:",
  "  pnpm verify",
  "  pnpm verify --quick --base <full-commit-sha>",
  "  pnpm verify --lane <checks|build|real-postgres|contract-evals|e2e>",
].join("\n");

const parsed = parseArguments(process.argv.slice(2));
if (parsed.kind === "help") {
  console.log(usage);
} else if (parsed.kind === "error") {
  console.error(parsed.error);
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await runVerification(parsed.options);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Verification failed unexpectedly."
    );
    process.exitCode = 1;
  }
}

type ParsedArguments =
  | { kind: "help" }
  | { kind: "error"; error: string }
  | { kind: "run"; options: RunnerOptions };

function parseArguments(args: string[]): ParsedArguments {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return { kind: "help" };
  }
  if (args.length === 0) return { kind: "run", options: { mode: "full" } };
  if (args.includes("--quick")) {
    if (args.length !== 3 || args[0] !== "--quick" || args[1] !== "--base") {
      return {
        kind: "error",
        error: "Quick mode requires exactly --quick --base <full-commit-sha>.",
      };
    }
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(args[2] ?? "")) {
      return { kind: "error", error: "--base must be a full commit SHA." };
    }
    return { kind: "run", options: { mode: "quick", base: args[2] ?? "" } };
  }
  if (args[0] === "--lane") {
    if (args.length !== 2)
      return {
        kind: "error",
        error: "Lane mode requires exactly one lane name.",
      };
    const lane = completeLaneIds.find((candidate) => candidate === args[1]);
    if (lane === undefined) {
      return { kind: "error", error: `Unknown lane: ${args[1] ?? ""}.` };
    }
    return { kind: "run", options: { mode: "lane", lane } };
  }
  return {
    kind: "error",
    error: "Unknown or conflicting verification options.",
  };
}
