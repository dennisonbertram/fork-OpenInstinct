import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const realEveCliOptions = {
  cwd: process.cwd(),
  maxBuffer: 1_000_000,
  timeout: 45_000,
};

describe("eval-square wrapper", () => {
  it("uses a run-specific disposable Compose project for database-backed evals", async () => {
    const source = await readFile(
      new URL("../eval-square.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("open-instinct-square-");
    expect(source).toContain('randomBytes(6).toString("hex")');
    expect(source).toContain('composeArguments("down", "--volumes")');
    expect(source).not.toContain("open-instinct-${createHash");
  });

  it("keeps the full Square gate when --case is omitted", async () => {
    const { stdout } = await run(
      process.execPath,
      ["scripts/eval-square.ts", "--list"],
      realEveCliOptions
    );

    expect(stdout).toContain("square/square/0000 [square]");
    expect(stdout).toContain("square/square/0012 [square]");
  }, 60_000);

  it("selects one discovered Square eval without forwarding --case to Eve", async () => {
    const { stdout, stderr } = await run(
      process.execPath,
      ["scripts/eval-square.ts", "--case", "square/square/0002", "--list"],
      realEveCliOptions
    );

    expect(stdout).toContain("square/square/0002 [square]");
    expect(stdout).not.toContain("square/square/0001 [square]");
    expect(stderr).not.toContain("unknown option '--case'");
  }, 60_000);

  it("rejects a --case id that Eve does not discover", async () => {
    await expect(
      run(
        process.execPath,
        ["scripts/eval-square.ts", "--case", "square/square/9999", "--list"],
        realEveCliOptions
      )
    ).rejects.toThrow("Unknown Square eval case");
  }, 60_000);
});
