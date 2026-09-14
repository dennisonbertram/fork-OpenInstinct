import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ONBOARDING_EXAMPLE_CARDS } from "@/agent/lib/onboarding/messages";

const repositoryRoot = process.cwd();
const expectedWidth = 780;
const expectedHeight = 1000;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngDimensions(path: string) {
  const bytes = readFileSync(path);
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(pngSignature) ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error(`Expected a PNG with an IHDR header: ${path}`);
  }
  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

describe("onboarding example cards", () => {
  it("ships one labeled mobile PNG for every example", () => {
    expect(ONBOARDING_EXAMPLE_CARDS).toHaveLength(3);
    for (const [index, card] of ONBOARDING_EXAMPLE_CARDS.entries()) {
      expect(card.label).toBe("Example conversation • sample data");
      const path = join(
        repositoryRoot,
        "public",
        "onboarding",
        `example-${String(index + 1)}.png`
      );
      expect(existsSync(path)).toBe(true);
      expect(readPngDimensions(path)).toEqual({
        height: expectedHeight,
        width: expectedWidth,
      });
    }
  });
});
