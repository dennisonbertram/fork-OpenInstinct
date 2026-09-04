import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agents = readFileSync("AGENTS.md", "utf8");
const guide = readFileSync("docs/AGENT_GUIDE.md", "utf8");
const squareWorkflow = readFileSync(
  ".github/workflows/square-evals.yml",
  "utf8"
);

describe("repository contract", () => {
  it("keeps the fork, validation, architecture, and Square eval guardrails", () => {
    for (const contract of [
      "-R dennisonbertram/fork-OpenInstinct",
      "linked worktree",
      "git diff --staged",
      "pnpm check",
      "pnpm build",
      "agent/subagents/browser-agent/tools",
      "docs/AGENT_GUIDE.md#verification-gates",
      "pnpm eval:square",
      "Results:",
    ]) {
      expect(agents).toContain(contract);
    }

    for (const contract of [
      "## Verification gates",
      "tests/unit/",
      "tests/integration/",
      "tests/e2e/",
      "pnpm test:e2e",
      "WORKSPACE_SCOPE_ENFORCEMENT=enforce",
      "./init.sh --check",
    ]) {
      expect(guide).toContain(contract);
    }

    for (const trigger of [
      "agent/instructions.md",
      "agent/instructions/",
      "agent/agent.ts",
      "agent/skills/",
      "agent/channels/linq.ts",
      "agent/connections/square.ts",
      "agent/lib/square/",
      "agent/lib/linq/reply.ts",
      "evals/square/",
      "scripts/eval-square.ts",
    ]) {
      expect(agents).toContain(trigger);
    }
  });

  it("keeps the local repository references available", () => {
    for (const path of [
      "docs/README.md",
      "docs/AGENT_GUIDE.md",
      "docs/MULTITENANCY.md",
      "docs/PRODUCT_DIRECTION.md",
      "docs/agent-conversation-feedback.md",
      "docs/agent-loop.html",
      "docs/operations/VERCEL.md",
    ]) {
      expect(existsSync(path), `${path} must exist`).toBe(true);
    }
  });

  it("passes the Square credential to shell through the step environment", () => {
    const credentialStep = squareWorkflow
      .split("- name: Require the AI Gateway credential")[1]
      ?.split("- name: Run square evals")[0];

    expect(credentialStep).toBeDefined();
    expect(credentialStep).toContain("env:");
    expect(credentialStep).toContain(
      "AI_GATEWAY_API_KEY: ${{ secrets.AI_GATEWAY_API_KEY }}"
    );
    expect(credentialStep).toContain('if [ -z "$AI_GATEWAY_API_KEY" ]; then');
    expect(credentialStep).not.toContain(
      'if [ -z "${{ secrets.AI_GATEWAY_API_KEY }}" ]; then'
    );
  });

  it("runs Square evals with production-shaped scope enforcement", () => {
    const evalStep = squareWorkflow.split("- name: Run square evals")[1];

    expect(evalStep).toBeDefined();
    expect(evalStep).not.toContain("NODE_ENV:");
    expect(evalStep).not.toContain("WORKSPACE_SCOPE_ENFORCEMENT:");
  });
});
