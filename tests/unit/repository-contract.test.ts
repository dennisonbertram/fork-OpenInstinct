import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agents = readFileSync("AGENTS.md", "utf8");
const squareWorkflow = readFileSync(
  ".github/workflows/square-evals.yml",
  "utf8"
);

describe("repository contract", () => {
  it("keeps the fork, validation, architecture, and Square eval guardrails", () => {
    for (const heading of [
      "## Testing tiers",
      "## Square evals: on demand, not per pull request",
      "## Work in a worktree, merge back through a pull request",
      "## Repository is the fork, never upstream",
      "## Repository contract",
      "## Agent orientation",
    ]) {
      expect(agents).toContain(heading);
    }

    for (const trigger of [
      "agent/instructions.md",
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

  it("limits the Square scope-enforcement exception to the test environment", () => {
    const evalStep = squareWorkflow.split("- name: Run square evals")[1];

    expect(evalStep).toBeDefined();
    expect(evalStep).toContain('NODE_ENV: "test"');
    expect(evalStep).toContain('WORKSPACE_SCOPE_ENFORCEMENT: "off"');
  });
});
