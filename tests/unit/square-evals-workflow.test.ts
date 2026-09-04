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
});
