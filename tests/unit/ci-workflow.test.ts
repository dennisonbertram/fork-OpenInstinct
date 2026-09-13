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
    expect(jobBlock("Build")).toContain("pnpm verify --lane build");
    expect(jobBlock("Real Postgres")).toContain(
      "pnpm verify --lane real-postgres"
    );
    expect(workflow).not.toContain("continue-on-error:");
    expect(workflow).not.toContain("secrets.");
  });

  it("dispatches each stable check through the shared verification lane", () => {
    const lanes = {
      Checks: "checks",
      Build: "build",
      "Real Postgres": "real-postgres",
      "Contract evals": "contract-evals",
      E2E: "e2e",
    } satisfies Record<string, string>;

    for (const [job, lane] of Object.entries(lanes)) {
      expect(jobBlock(job), `${job} job exists`).toContain(
        `pnpm verify --lane ${lane}`
      );
    }
  });

  it("retains a verification receipt for every stable check", () => {
    for (const job of [
      "Checks",
      "Contract evals",
      "E2E",
      "Build",
      "Real Postgres",
    ]) {
      const paths = jobBlock(job)
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("path: .eve/verify/"));
      expect(paths, `${job} retains verification evidence`).not.toHaveLength(0);
    }
  });

  it("uploads the full Checks and Build run directories so receipt log hashes remain verifiable", () => {
    for (const job of ["Checks", "Build"]) {
      const uploadStep = namedStep(
        jobBlock(job),
        "Upload verification run evidence"
      );
      if (uploadStep === undefined) {
        throw new Error(`${job} uploads verification evidence.`);
      }
      const paths = uploadStep.split(/\r?\n/u).map((line) => line.trim());
      expect(paths).toContain("path: .eve/verify/");
      expect(uploadStep).toContain("include-hidden-files: true");
      expect(uploadStep).toContain("if-no-files-found: error");
    }
  });

  it("keeps every pull request and main/master push on all checks", () => {
    expect(workflow).toContain("on:\n  pull_request:");
    expect(workflow).toContain("      - main\n      - master");
    expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/mu);
  });

  it("retains nested mount artifacts and reports on failure or cancellation", () => {
    expect(workflow).toContain("evals/contract/mount-harness/.eve/");
    expect(workflow).toContain("include-hidden-files: true");
    expect(workflow).not.toContain("if: failure()");
    expect(workflow).toContain("if: always()");
  });
});

function jobBlock(name: string) {
  const jobsStart = workflow.indexOf("jobs:\n");
  const blocks = workflow.slice(jobsStart).split(/(?=^ {2}[a-z-]+:\s*$)/mu);
  return blocks.find((block) => block.includes(`    name: ${name}\n`)) ?? "";
}

function namedStep(job: string, name: string) {
  const marker = `      - name: ${name}\n`;
  const start = job.indexOf(marker);
  if (start === -1) return undefined;
  const nextStep = job.indexOf("\n      - name:", start + marker.length);
  return job.slice(start, nextStep === -1 ? undefined : nextStep);
}
