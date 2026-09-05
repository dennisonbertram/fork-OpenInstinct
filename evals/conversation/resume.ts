import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Deliberately excludes authorized supervisor/budget/report changes. */
export async function measurementSourceHash(root: string): Promise<string> {
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
  const entries = await Promise.all(
    files.map(async (file) => ({
      name: file,
      content: await readFile(join(root, file)),
    }))
  );
  const hash = createHash("sha256");
  for (const entry of entries)
    hash.update(entry.name).update("\0").update(entry.content).update("\0");
  return hash.digest("hex");
}
/** Include request evidence and filenames, not only the 63 record JSON files. */
export async function trialFilesHash(outputDir: string): Promise<string> {
  const directory = join(outputDir, "trials");
  const files = (await readdir(directory, { withFileTypes: true })).toSorted(
    (a, b) => a.name.localeCompare(b.name)
  );
  if (files.some((file) => !file.isFile()))
    throw new Error("Trial evidence must contain regular files only");
  const entries = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: await readFile(join(directory, file.name)),
    }))
  );
  const hash = createHash("sha256");
  for (const entry of entries)
    hash.update(entry.name).update("\0").update(entry.content).update("\0");
  return hash.digest("hex");
}
export function mayRestoreResumeCheckpoint(
  previous: { trialHash: string; paidRequests: number },
  current: {
    trialHash: string | undefined;
    paidRequests: number;
    status: string;
    cleanup?: string;
  }
): boolean {
  return (
    ["blocked", "interrupted"].includes(current.status) &&
    current.cleanup !== "failed" &&
    previous.paidRequests === current.paidRequests &&
    previous.trialHash === current.trialHash
  );
}
