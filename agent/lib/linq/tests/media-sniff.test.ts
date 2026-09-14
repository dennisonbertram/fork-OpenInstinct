import { describe, expect, it } from "vitest";
import { sniffImageMediaType } from "@/agent/lib/linq/media-sniff";

function bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("sniffImageMediaType", () => {
  it("detects JPEG, PNG, GIF, and WebP magic bytes", () => {
    expect(sniffImageMediaType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg"
    );
    expect(
      sniffImageMediaType(
        bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).toBe("image/png");
    expect(
      sniffImageMediaType(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
    ).toBe("image/gif");
    expect(
      sniffImageMediaType(
        bytes([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ])
      )
    ).toBe("image/webp");
  });

  it("detects HEIC stills from the ftyp brand box", () => {
    // 00 00 00 24 66 74 79 70 68 65 69 63 — the exact header of the failing
    // production photo
    expect(
      sniffImageMediaType(
        bytes([
          0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69,
          0x63,
        ])
      )
    ).toBe("image/heic");
  });

  it("returns null for truncated, random, and non-image data", () => {
    expect(sniffImageMediaType(bytes([]))).toBeNull();
    expect(sniffImageMediaType(bytes([0xff, 0xd8]))).toBeNull();
    expect(
      sniffImageMediaType(bytes([0x25, 0x50, 0x44, 0x46, 0x2d]))
    ).toBeNull();
    expect(
      sniffImageMediaType(bytes([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]))
    ).toBeNull();
  });
});
