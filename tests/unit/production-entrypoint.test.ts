import {
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("production entrypoint", () => {
  it("keeps pnpm dependency checks from contaminating JSON status output", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "open-instinct-production-entrypoint-")
    );
    directories.push(directory);
    const binDirectory = join(directory, "bin");
    const wrapper = join(directory, "prod.sh");
    const fakePnpm = join(binDirectory, "pnpm");
    const invocationPath = join(directory, "invocation.json");
    const nestedPath = join(directory, "nested.json");
    const markerPath = join(directory, "implicit-install.marker");
    await mkdir(binDirectory);
    await copyFile(join(process.cwd(), "prod.sh"), wrapper);
    await chmod(wrapper, 0o755);
    await writeFile(
      fakePnpm,
      `#!${process.execPath}
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const directory = process.env.OPENINSTINCT_TEST_CAPTURE_DIR;
const markerPath = process.env.OPENINSTINCT_TEST_MARKER_PATH;
const setting = process.env.pnpm_config_verify_deps_before_run;
if (setting !== "false") {
  writeFileSync(markerPath, "implicit install requested");
  process.stdout.write("pnpm: dependencies are out of date; installing\\n");
}

if (args[0] === "exec" && args[1] === "tsx") {
  writeFileSync(
    directory + "/invocation.json",
    JSON.stringify({ args, setting })
  );
  const nested = spawnSync(
    process.execPath,
    [process.argv[1], "exec", "vercel", "api", "/v9/projects/example"],
    { env: process.env, encoding: "utf8" }
  );
  if (nested.error) throw nested.error;
  if (nested.status !== 0) process.exit(nested.status ?? 1);
  process.stdout.write(
    JSON.stringify({ state: "partial", nestedExitCode: nested.status }) + "\\n"
  );
} else if (args[0] === "exec" && args[1] === "vercel") {
  writeFileSync(
    directory + "/nested.json",
    JSON.stringify({ args, setting })
  );
} else {
  process.exit(2);
}
`
    );
    await chmod(fakePnpm, 0o755);

    const args = [
      "status",
      "--target",
      "preview",
      "--deployment",
      "dpl_preview123",
    ];
    const result = spawnSync(wrapper, args, {
      cwd: process.cwd(),
      env: {
        NODE_ENV: "test",
        PATH: `${binDirectory}${delimiter}/usr/bin:/bin`,
        OPENINSTINCT_TEST_CAPTURE_DIR: directory,
        OPENINSTINCT_TEST_MARKER_PATH: markerPath,
        pnpm_config_verify_deps_before_run: "install",
      },
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect({
      status: result.status,
      stdout: result.stdout,
      invocation: await readFile(invocationPath, "utf8"),
      nested: await readFile(nestedPath, "utf8"),
      implicitInstall: (await readdir(directory)).includes(
        "implicit-install.marker"
      ),
    }).toEqual({
      status: 0,
      stdout: '{"state":"partial","nestedExitCode":0}\n',
      invocation: JSON.stringify({
        args: ["exec", "tsx", "scripts/production/cli.ts", ...args],
        setting: "false",
      }),
      nested: JSON.stringify({
        args: ["exec", "vercel", "api", "/v9/projects/example"],
        setting: "false",
      }),
      implicitInstall: false,
    });
  });
});
