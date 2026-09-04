import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/square-evals.yml", import.meta.url),
  "utf8"
);

describe("Square eval artifact workflow", () => {
  it("uploads run provenance manifests as hidden artifacts", () => {
    expect(workflow).toContain("uses: actions/upload-artifact@v7");
    expect(workflow).toContain(".eve/eval-runs");
    expect(workflow).toContain("include-hidden-files: true");
  });

  it("dispatches exactly one explicitly budgeted paid eval target", () => {
    expect(workflow).toMatch(
      /workflow_dispatch:\n\s+inputs:\n\s+run:\n[\s\S]*?default: square[\s\S]*?type: choice[\s\S]*?- square[\s\S]*?- agent-smoke/
    );
    expect(workflow).toMatch(
      /if: \$\{\{ inputs\.run == 'square' \}\}[\s\S]*?run: pnpm eval:square --max-cost-usd 4 --estimated-cost-usd 4 --with-database --junit \.eve\/junit\.xml/
    );
    expect(workflow).toMatch(
      /if: \$\{\{ inputs\.run == 'agent-smoke' \}\}[\s\S]*?run: pnpm eval:agent --max-cost-usd 1 --estimated-cost-usd 1 --repetitions 1 --model openai\/gpt-5\.6-sol-fast --tag smoke --junit \.eve\/junit\.xml/
    );
    expect(workflow.match(/run: pnpm eval:(?:square|agent)/g)).toHaveLength(2);
  });
});
