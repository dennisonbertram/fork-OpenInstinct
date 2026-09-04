import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const patchUrl = new URL("../../patches/eve@0.49.0.patch", import.meta.url);

describe("Eve patch boundary", () => {
  it("contains only the registered Linq redirects and route-auth hunk", async () => {
    const patch = await readFile(patchUrl, "utf8");
    const paths = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gmu)];

    expect(paths.map((match) => [match[1], match[2]])).toEqual([
      [
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.d.ts",
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.d.ts",
      ],
      [
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.js",
        "dist/src/compiled/@linqapp/chat-sdk-adapter/index.js",
      ],
      [
        "dist/src/compiled/chat/index.d.ts",
        "dist/src/compiled/chat/index.d.ts",
      ],
      ["dist/src/eve-channel/index.js", "dist/src/eve-channel/index.js"],
    ]);
    expect(patch).toContain(
      'export { createLinqAdapter } from "@linqapp/chat-sdk-adapter"'
    );
    expect(patch).toContain("withRouteAuth(handleConnectionCallbackRequest)");
    expect(patch).toContain(
      "withRouteAuth(handleLegacyConnectionCallbackRequest)"
    );
    expect(patch).toContain("withRouteAuth(handleSessionCallbackRequest)");
    expect(patch).toContain("withRouteAuth(handleTaskInputResponseRequest)");
    expect(patch).toContain('export * from "chat"');
    expect(patch).not.toContain("diff --git a/package.json");
  });
});
