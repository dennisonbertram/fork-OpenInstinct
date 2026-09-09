import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("llms.txt", () => {
  it("describes Jory and links only real pages", async () => {
    const text = await readFile(
      join(process.cwd(), "public", "llms.txt"),
      "utf8"
    );
    expect(text).toMatch(/^# Jory/);
    expect(text).toMatch(/AI manager for deskless businesses/);
    expect(text).toMatch(/free to use/i);
    // It must not advertise developer surfaces that do not exist.
    expect(text).toMatch(/no public developer API/i);
    // Texting is down -- the SMS number must not come back.
    expect(text).not.toMatch(/sms:/);
    expect(text).not.toMatch(/\+1 \(615\)/);
    // Every linked path must be a real public route.
    const paths = [
      ...text.matchAll(/https:\/\/heyjory\.com(\/[a-z-]*)?\)/g),
    ].map((m) => m[1] ?? "/");
    const real = [
      "/",
      "/features",
      "/how-it-works",
      "/pricing",
      "/security",
      "/about",
      "/why",
      "/terms",
    ];
    for (const p of paths) {
      expect(real).toContain(p);
    }
  });
});
