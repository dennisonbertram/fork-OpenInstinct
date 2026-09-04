import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../.github/workflows/checks.yml", import.meta.url),
  "utf8"
);

describe("deterministic CI contract", () => {
  it("runs explicit Build and Real Postgres jobs alongside existing gates", () => {
    for (const name of [
      "Checks",
      "Build",
      "Real Postgres",
      "Contract evals",
      "E2E",
    ]) {
      expect(workflow).toContain(`    name: ${name}\n`);
    }
    expect(workflow).toContain("run: pnpm build");
    expect(workflow).toContain("run: node scripts/test-real-postgres.ts");
    expect(workflow).not.toContain("continue-on-error:");
    expect(workflow).not.toContain("secrets.");
  });

  it("retains nested mount artifacts and reports on failure or cancellation", () => {
    expect(workflow).toContain("evals/contract/mount-harness/.eve/");
    expect(workflow).toContain("include-hidden-files: true");
    expect(workflow).not.toContain("if: failure()");
    expect(workflow).toContain("if: always()");
  });
});
