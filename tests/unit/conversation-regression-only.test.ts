/* oxlint-disable eslint/no-restricted-properties -- subprocess preflight deliberately removes credentials. */
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});
async function isolatedSupervisor() {
  const root = await mkdtemp(join(tmpdir(), "jory-gate-only-test-"));
  directories.push(root);
  await mkdir(join(root, "evals"));
  await cp(
    join(sourceRoot, "evals/conversation"),
    join(root, "evals/conversation"),
    { recursive: true }
  );
  await symlink(
    join(sourceRoot, "evals/square"),
    join(root, "evals/square"),
    "dir"
  );
  await symlink(
    join(sourceRoot, "node_modules"),
    join(root, "node_modules"),
    "dir"
  );
  await mkdir(join(root, "scripts"));
  await cp(
    join(sourceRoot, "scripts/run-agent-evals.ts"),
    join(root, "scripts/run-agent-evals.ts")
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ type: "module" })
  );
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        paths: {
          "@/evals/conversation/*": [join(root, "evals/conversation/*")],
          "@/*": [join(sourceRoot, "src/*"), join(sourceRoot, "*")],
        },
      },
    })
  );
  const environment = { ...process.env };
  delete environment.CONVERSATION_GATEWAY_KEY_FILE;
  delete environment.NODE_OPTIONS;
  return { root, environment };
}
describe("Square-only supervisor routing", () => {
  it("forwards through the existing runner, creates no conversation trials, and retains key verification", async () => {
    const { root, environment } = await isolatedSupervisor();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(root, "scripts/run-agent-evals.ts"),
        "--conversation-baseline",
        "--budget-usd",
        "20",
        "--square-regression-only",
      ],
      { cwd: root, env: environment, encoding: "utf8", timeout: 20_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Set CONVERSATION_GATEWAY_KEY_FILE");
    const runs = await readdir(join(root, ".eve/conversation-baseline"));
    expect(runs).toHaveLength(1);
    const run = runs[0];
    if (!run) throw new Error("No run directory");
    const output = join(root, ".eve/conversation-baseline", run);
    expect(await readFile(join(output, "manifest.json"), "utf8")).toBe("[]");
    const provenance = await readFile(join(output, "provenance.json"), "utf8");
    expect(provenance).toContain('"runKind": "square-regression-only"');
    expect(provenance).toContain('"plannedTrials": 0');
    expect(provenance).toContain('"status": "blocked"');
    expect(provenance).not.toContain('"squareRegressionGate"');
  }, 30_000);
  it("rejects mixing resume with gate-only mode before opening evidence", async () => {
    const { root, environment } = await isolatedSupervisor();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(root, "evals/conversation/run.ts"),
        "--budget-usd",
        "20",
        "--square-regression-only",
        "--resume",
        "2026-01-01T00-00-00-000Z",
      ],
      { cwd: root, env: environment, encoding: "utf8", timeout: 20_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Use --conversation-baseline");
    await expect(readdir(join(root, ".eve"))).rejects.toThrow("ENOENT");
  }, 30_000);
  it("selects only three never-connected repair trials in a separately labelled run", async () => {
    const { root, environment } = await isolatedSupervisor();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(root, "scripts/run-agent-evals.ts"),
        "--conversation-baseline",
        "--budget-usd",
        "20",
        "--case-id",
        "SQ-07",
        "--variant",
        "never-connected",
      ],
      { cwd: root, env: environment, encoding: "utf8", timeout: 20_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Set CONVERSATION_GATEWAY_KEY_FILE");
    const runs = await readdir(join(root, ".eve/conversation-baseline"));
    expect(runs).toHaveLength(1);
    const run = runs[0];
    if (!run) throw new Error("No run directory");
    const output = join(root, ".eve/conversation-baseline", run);
    const manifest = z
      .array(z.object({ key: z.string() }))
      .parse(JSON.parse(await readFile(join(output, "manifest.json"), "utf8")));
    expect(manifest.map((record) => record.key)).toEqual([
      "SQ-07-never-connected-1",
      "SQ-07-never-connected-2",
      "SQ-07-never-connected-3",
    ]);
    const provenance: unknown = JSON.parse(
      await readFile(join(output, "provenance.json"), "utf8")
    );
    expect(provenance).toMatchObject({
      runKind: "conversation-subset",
      plannedTrials: 3,
      scenarioCount: 1,
      variantCount: 1,
      selection: { caseId: "SQ-07", variant: "never-connected" },
    });
    expect(provenance).not.toHaveProperty("squareRegressionGate");
  }, 30_000);
  it.each([
    ["--case-id", "SQ-07", "--variant", "unknown"],
    ["--case-id", "unknown"],
    ["--variant", "never-connected"],
    ["--case-id", "SQ-07", "--square-regression-only"],
    ["--case-id", "SQ-07", "--resume", "2026-01-01T00-00-00-000Z"],
  ])(
    "rejects invalid or mixed subset selection %j",
    async (...selection) => {
      const { root, environment } = await isolatedSupervisor();
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          join(root, "evals/conversation/run.ts"),
          "--budget-usd",
          "20",
          ...selection,
        ],
        { cwd: root, env: environment, encoding: "utf8", timeout: 20_000 }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Use --conversation-baseline");
      await expect(readdir(join(root, ".eve"))).rejects.toThrow("ENOENT");
    },
    30_000
  );
});
