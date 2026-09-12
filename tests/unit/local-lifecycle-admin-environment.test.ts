import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

const temporaryDirectories: string[] = [];
const sourceRoot = resolve(new URL("../..", import.meta.url).pathname);
const fixtureAdministratorPhone = "+12025550123";
const inheritedAdministratorPhone = "+12025550999";
const unrelatedValue = "synthetic-unrelated-environment-value";
const childEnvironmentSchema = z.object({
  admin: z.string().nullable(),
  unrelatedPresent: z.boolean(),
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("fixture child environment", () => {
  it("uses the fixed synthetic administrator without inheriting caller environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-instinct-admin-env-"));
    temporaryDirectories.push(directory);
    const repositoryRoot = join(directory, "repository");
    await mkdir(join(repositoryRoot, "scripts", "local"), {
      recursive: true,
    });
    await Promise.all(
      [
        "scripts/dev.ts",
        "scripts/local/run-record.ts",
        "scripts/local/worktree-lease.ts",
        "scripts/local/service-supervisor.mjs",
        "scripts/local/fixture-network-guard.mjs",
      ].map((path) =>
        copyFile(join(sourceRoot, path), join(repositoryRoot, path))
      )
    );
    const gitDirectory = join(repositoryRoot, ".git");
    await mkdir(gitDirectory, { recursive: true });
    await mkdir(join(gitDirectory, "refs", "heads"), { recursive: true });
    await Promise.all([
      mkdir(join(gitDirectory, "objects"), { recursive: true }),
      symlink(
        join(sourceRoot, "node_modules"),
        join(repositoryRoot, "node_modules"),
        "dir"
      ),
      writeFile(join(gitDirectory, "HEAD"), "ref: refs/heads/main\n"),
      writeFile(
        join(gitDirectory, "config"),
        "[core]\nrepositoryformatversion = 0\nbare = false\n"
      ),
      writeFile(
        join(gitDirectory, "refs", "heads", "main"),
        "7875a08348adf2d567120e7e7f3d803b101aa45a\n"
      ),
    ]);

    const bin = join(directory, "bin");
    const capture = join(directory, "migration-environment.json");
    await mkdir(bin);
    const dockerPath = join(bin, "docker");
    const pnpmPath = join(bin, "pnpm");
    await Promise.all([
      writeFile(
        dockerPath,
        `#!${process.execPath}
if (process.argv.includes("port")) process.stdout.write("127.0.0.1:49200\\n");
process.exit(0);
`
      ),
      writeFile(
        pnpmPath,
        `#!${process.execPath}
const { writeFileSync } = require("node:fs");
if (process.argv[2] === "db:migrate") {
  writeFileSync(${JSON.stringify(capture)}, JSON.stringify({
    admin: process.env.ADMIN_PHONE_NUMBERS ?? null,
    unrelatedPresent: Object.hasOwn(process.env, "DEV_TEST_UNRELATED_ENV"),
  }));
  process.exit(7);
}
process.exit(0);
`
      ),
    ]);
    await Promise.all([chmod(dockerPath, 0o755), chmod(pnpmPath, 0o755)]);

    const supervisor = spawn(
      process.execPath,
      [join(repositoryRoot, "scripts", "dev.ts")],
      {
        cwd: repositoryRoot,
        env: {
          PATH: bin,
          NODE_ENV: "test",
          DEV_PROFILE: "fixture",
          ADMIN_PHONE_NUMBERS: inheritedAdministratorPhone,
          DEV_TEST_UNRELATED_ENV: unrelatedValue,
        },
        stdio: ["ignore", "ignore", "pipe"],
      }
    );
    let stderr = "";
    supervisor.stderr.setEncoding("utf8");
    supervisor.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      supervisor.once("error", reject);
      supervisor.once("exit", resolveExit);
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("migrations");
    const childEnvironment = childEnvironmentSchema.parse(
      JSON.parse(await readFile(capture, "utf8"))
    );
    expect(childEnvironment.unrelatedPresent).toBe(false);
    expect(childEnvironment.admin).toBe(fixtureAdministratorPhone);
  });
});
