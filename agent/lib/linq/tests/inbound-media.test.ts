import type { Attachment } from "chat";
import { describe, expect, it } from "vitest";
import {
  isDirectPromptSupportedMime,
  partitionDirectPromptAttachments,
} from "@/agent/lib/linq/inbound-media";

function attachment(
  overrides: Partial<Attachment> & { readonly type: Attachment["type"] }
): Attachment {
  return {
    mimeType: "image/jpeg",
    name: "photo.jpg",
    url: "https://cdn.linqapp.com/photo.jpg",
    ...overrides,
  };
}

describe("isDirectPromptSupportedMime", () => {
  it("accepts the model-supported image, pdf, and text formats", () => {
    for (const mimeType of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "text/markdown",
    ]) {
      expect(isDirectPromptSupportedMime(mimeType)).toBe(true);
    }
  });

  it("matches case-insensitively and ignores parameters", () => {
    expect(isDirectPromptSupportedMime("IMAGE/JPEG")).toBe(true);
    expect(isDirectPromptSupportedMime("text/plain; charset=utf-8")).toBe(true);
  });

  it("rejects HEIC/HEIF stills, video, audio, and unknown types", () => {
    for (const mimeType of [
      "image/heic",
      "image/heif",
      "image/heic-sequence",
      "image/heif-sequence",
      "video/quicktime",
      "video/mp4",
      "audio/mpeg",
      "application/octet-stream",
      "application/zip",
    ]) {
      expect(isDirectPromptSupportedMime(mimeType)).toBe(false);
    }
  });

  it("rejects missing, blank, and malformed MIME types", () => {
    expect(isDirectPromptSupportedMime(undefined)).toBe(false);
    expect(isDirectPromptSupportedMime("")).toBe(false);
    expect(isDirectPromptSupportedMime("   ")).toBe(false);
    expect(isDirectPromptSupportedMime("not-a-mime")).toBe(false);
  });
});

describe("partitionDirectPromptAttachments", () => {
  it("withholds an iPhone Live Photo pair while keeping a JPEG", () => {
    const jpeg = attachment({ mimeType: "image/jpeg", type: "image" });
    const heic = attachment({
      mimeType: "image/heic",
      name: "IMG_0001.HEIC",
      type: "image",
    });
    const mov = attachment({
      mimeType: "video/quicktime",
      name: "IMG_0001.MOV",
      type: "video",
    });

    const partitioned = partitionDirectPromptAttachments([jpeg, heic, mov]);

    expect(partitioned.kept).toEqual([jpeg]);
    expect(partitioned.dropped).toEqual([heic, mov]);
    expect(partitioned.droppedCount).toBe(2);
  });

  it("keeps every attachment when all formats are model-supported", () => {
    const jpeg = attachment({ mimeType: "image/jpeg", type: "image" });
    const pdf = attachment({
      mimeType: "application/pdf",
      name: "receipt.pdf",
      type: "file",
    });

    const partitioned = partitionDirectPromptAttachments([jpeg, pdf]);

    expect(partitioned.kept).toEqual([jpeg, pdf]);
    expect(partitioned.dropped).toEqual([]);
    expect(partitioned.droppedCount).toBe(0);
  });

  it("treats a missing attachment list as nothing to withhold", () => {
    const partitioned = partitionDirectPromptAttachments(undefined);

    expect(partitioned.kept).toEqual([]);
    expect(partitioned.dropped).toEqual([]);
    expect(partitioned.droppedCount).toBe(0);
  });
});
