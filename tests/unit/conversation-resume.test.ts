/* oxlint-disable eslint/no-restricted-properties, eslint/no-await-in-loop -- isolated preflight removes credentials; sequential file mutations verify each source hash independently. */
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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  measurementSourceHash,
  trialFilesHash,
  mayRestoreResumeCheckpoint,
} from "@/evals/conversation/resume";
import { makeTrialManifest, writeTrial } from "@/evals/conversation/report";

const directories: string[] = [];
async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "jory-resume-test-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("conversation resume evidence", () => {
  it("hashes every stable measurement file while allowing supervisor changes", async () => {
    const root = await temporaryDirectory();
    const directory = join(root, "evals/conversation");
    await mkdir(directory, { recursive: true });
    const files = [
      "evals/conversation/execute.ts",
      "evals/conversation/fixtures.ts",
      "evals/conversation/preload.mjs",
      "evals/conversation/setup.ts",
      "evals/conversation/input-request.ts",
      "evals/square/fake/server.ts",
      "evals/square/fake/fixture.json",
      "evals/square/cases.ts",
      "evals/square/shape.ts",
    ];
    await Promise.all(
      files.map(async (file) => {
        await mkdir(dirname(join(root, file)), { recursive: true });
        await writeFile(join(root, file), "original");
      })
    );
    const baseline = await measurementSourceHash(root);
    await writeFile(join(directory, "run.ts"), "authorized supervisor change");
    await writeFile(join(directory, "budget.ts"), "authorized ceiling change");
    expect(await measurementSourceHash(root)).toBe(baseline);
    for (const file of files) {
      await writeFile(join(root, file), "changed");
      expect(await measurementSourceHash(root)).not.toBe(baseline);
      await writeFile(join(root, file), "original");
    }
  });
  it("detects changes to any trial file, including separate HTTP evidence", async () => {
    const output = await temporaryDirectory();
    await mkdir(join(output, "trials"));
    await writeFile(join(output, "trials", "case.json"), "record");
    const baseline = await trialFilesHash(output);
    await writeFile(join(output, "trials", "case.requests.json"), "[]");
    expect(await trialFilesHash(output)).not.toBe(baseline);
    await rm(join(output, "trials", "case.requests.json"));
    expect(await trialFilesHash(output)).toBe(baseline);
    await writeFile(join(output, "trials", "case.json"), "changed");
    expect(await trialFilesHash(output)).not.toBe(baseline);
  });
  it("restores failed setup after budget initialization only with unchanged paid and trial evidence", () => {
    const previous = { trialHash: "same", paidRequests: 7 };
    const current = {
      trialHash: "same",
      paidRequests: 7,
      status: "blocked",
      cleanup: "completed",
    };
    expect(mayRestoreResumeCheckpoint(previous, current)).toBe(true);
    expect(
      mayRestoreResumeCheckpoint(previous, { ...current, paidRequests: 8 })
    ).toBe(false);
    expect(
      mayRestoreResumeCheckpoint(previous, { ...current, trialHash: "changed" })
    ).toBe(false);
    expect(
      mayRestoreResumeCheckpoint(previous, { ...current, trialHash: undefined })
    ).toBe(false);
    expect(
      mayRestoreResumeCheckpoint(previous, { ...current, cleanup: "failed" })
    ).toBe(false);
    expect(
      mayRestoreResumeCheckpoint(previous, { ...current, status: "finished" })
    ).toBe(false);
  });
  it("preserves the prior checkpoint byte-for-byte when the actual supervisor lacks its key", async () => {
    const root = await temporaryDirectory();
    const code = join(root, "evals/conversation");
    await mkdir(code, { recursive: true });
    await cp(join(sourceRoot, "evals/conversation"), code, { recursive: true });
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
    const runId = "2026-01-01T00-00-00-000Z";
    const output = join(root, ".eve/conversation-baseline", runId);
    const records = makeTrialManifest();
    for (const record of records) {
      record.status = "blocked";
      record.reason = "Interrupted before attempt";
      await writeTrial(output, record);
    }
    await writeFile(join(output, "manifest.json"), JSON.stringify(records));
    const provenance = {
      status: "interrupted",
      cleanup: "completed",
      commitSha: "0".repeat(40),
      agentSourceHash: "a".repeat(64),
      rubricHash: "b".repeat(64),
      scenarioHash: "c".repeat(64),
      measurementSourceHash: "d".repeat(64),
      agentModel: "test",
      judgeModel: "test",
    };
    const prior = {
      "provenance.json": JSON.stringify(provenance),
      "summary.json": JSON.stringify({ records }),
      "report.md": "Previous report\n",
      "budget.json": JSON.stringify({
        budgetUsd: 20,
        poisoned: false,
        requests: [],
      }),
      "native-budget-verification.json": JSON.stringify({ synthetic: true }),
    };
    await Promise.all(
      Object.entries(prior).map(([file, text]) =>
        writeFile(join(output, file), text)
      )
    );
    const ledger = join(root, ".eve/conversation-baseline/budget-control");
    await mkdir(ledger);
    await writeFile(join(ledger, "budget.json"), prior["budget.json"]);
    const originalTrialHash = await trialFilesHash(output);
    const environment = { ...process.env };
    delete environment.CONVERSATION_GATEWAY_KEY_FILE;
    delete environment.NODE_OPTIONS;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(code, "run.ts"),
        "--budget-usd",
        "20",
        "--resume",
        runId,
      ],
      { cwd: root, env: environment, encoding: "utf8", timeout: 20_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Set CONVERSATION_GATEWAY_KEY_FILE");
    for (const [file, text] of Object.entries(prior))
      expect(await readFile(join(output, file), "utf8")).toBe(text);
    expect(await trialFilesHash(output)).toBe(originalTrialHash);
    const checkpoints = await readdir(join(output, "checkpoints"));
    expect(checkpoints).toHaveLength(1);
    const checkpoint = checkpoints[0];
    if (!checkpoint) throw new Error("No checkpoint");
    expect(
      await readFile(
        join(output, "checkpoints", checkpoint, "resume-error.json"),
        "utf8"
      )
    ).toContain("Set CONVERSATION_GATEWAY_KEY_FILE");
    expect(await readdir(ledger)).toEqual(["budget.json"]);
    // The missing key is rejected before PostgreSQL or fixture startup; no owned services were created.
    const legacy = { ...provenance, measurementSourceHash: undefined };
    await writeFile(join(output, "provenance.json"), JSON.stringify(legacy));
    const refused = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(code, "run.ts"),
        "--budget-usd",
        "20",
        "--resume",
        runId,
      ],
      { cwd: root, env: environment, encoding: "utf8", timeout: 20_000 }
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("legacy runs cannot be verified");
  }, 30_000);
});
