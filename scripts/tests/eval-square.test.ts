import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("eval-square wrapper", () => {
  it("keeps the full Square gate when --case is omitted", async () => {
    const { stdout } = await run(
      process.execPath,
      ["scripts/eval-square.ts", "--list"],
      { cwd: process.cwd() }
    );

    expect(stdout).toContain("square/square/0000 [square]");
    expect(stdout).toContain("square/square/0012 [square]");
  });

  it("selects one discovered Square eval without forwarding --case to Eve", async () => {
    const { stdout, stderr } = await run(
      process.execPath,
      ["scripts/eval-square.ts", "--case", "square/square/0002", "--list"],
      { cwd: process.cwd() }
    );

    expect(stdout).toContain("square/square/0002 [square]");
    expect(stdout).not.toContain("square/square/0001 [square]");
    expect(stderr).not.toContain("unknown option '--case'");
  });

  it("rejects a --case id that Eve does not discover", async () => {
    await expect(
      run(
        process.execPath,
        ["scripts/eval-square.ts", "--case", "square/square/9999", "--list"],
        { cwd: process.cwd() }
      )
    ).rejects.toThrow("Unknown Square eval case");
  });
});
