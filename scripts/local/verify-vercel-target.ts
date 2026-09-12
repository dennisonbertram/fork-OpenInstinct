import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";

const executeFile = promisify(execFile);
const identifier = z.string().regex(/^[A-Za-z0-9._-]+$/u);
const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  targets: z.array(
    z.object({
      surface: z.string(),
      target: z.string(),
      projectId: identifier,
      projectName: identifier.optional(),
      teamId: identifier.optional(),
    })
  ),
});
const canonicalTargetSchema = z.object({
  projectId: identifier,
  projectName: identifier,
  teamId: identifier,
});
const projectSchema = z.object({
  id: identifier,
  name: identifier,
  accountId: identifier,
});

function argumentsForVerification() {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const option = process.argv[index];
    const value = process.argv[index + 1];
    if (
      (option !== "--inventory" &&
        option !== "--project" &&
        option !== "--team") ||
      value === undefined ||
      value.startsWith("--") ||
      values.has(option)
    ) {
      throw new Error("Invalid Vercel target verification arguments.");
    }
    values.set(option, value);
    index += 1;
  }
  const inventory = values.get("--inventory");
  const project = values.get("--project");
  const team = values.get("--team");
  if (inventory === undefined)
    throw new Error("A Vercel target inventory is required.");
  if ((project === undefined) !== (team === undefined))
    throw new Error(
      "Set OPENINSTINCT_VERCEL_PROJECT and OPENINSTINCT_VERCEL_TEAM together."
    );
  if (project !== undefined) identifier.parse(project);
  if (team !== undefined) identifier.parse(team);
  return { inventory, project, team };
}

async function targetFromInventory(inventoryPath: string) {
  const inventory = inventorySchema.parse(
    JSON.parse(await readFile(inventoryPath, "utf8"))
  );
  const target = inventory.targets.find(
    (item) => item.surface === "app" && item.target === "production"
  );
  return canonicalTargetSchema.parse(target);
}

async function readExistingProject(project: string, team: string) {
  const { stdout } = await executeFile("pnpm", [
    "exec",
    "vercel",
    "api",
    `/v9/projects/${encodeURIComponent(project)}`,
    "--method",
    "GET",
    "--non-interactive",
    "--scope",
    team,
  ]);
  return projectSchema.parse(JSON.parse(stdout));
}

async function main() {
  const {
    inventory: inventoryPath,
    project,
    team,
  } = argumentsForVerification();
  const canonical = await targetFromInventory(inventoryPath);
  if (project === undefined || team === undefined) {
    const actual = await readExistingProject(
      canonical.projectId,
      canonical.teamId
    );
    if (
      actual.id !== canonical.projectId ||
      actual.name !== canonical.projectName ||
      actual.accountId !== canonical.teamId
    )
      throw new Error(
        "The live Vercel project does not match the canonical inventory."
      );
    process.stdout.write(`${actual.name}\t${actual.accountId}\n`);
    return;
  }
  const actual = await readExistingProject(project, team);
  if (actual.name !== project)
    throw new Error(
      "The requested Vercel project name did not match the live project."
    );
  process.stdout.write(`${actual.name}\t${actual.accountId}\n`);
}

void main().catch(() => {
  process.stderr.write(
    "Could not verify an existing Vercel target; no Eve link was run.\n"
  );
  process.exitCode = 1;
});
