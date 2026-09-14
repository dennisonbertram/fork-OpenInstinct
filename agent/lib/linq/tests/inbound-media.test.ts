import { describe, expect, it } from "vitest";
import { stripModelUnsupportedFileParts } from "@/agent/lib/linq/inbound-media";

describe("stripModelUnsupportedFileParts", () => {
  it("withholds iPhone HEIC and HEIF stills from model-bound content", () => {
    const stripped = stripModelUnsupportedFileParts([
      { text: "What is this?", type: "text" },
      {
        data: new URL("https://cdn.linqapp.com/IMG_0001.HEIC"),
        filename: "IMG_0001.HEIC",
        mediaType: "image/heic",
        type: "file",
      },
      {
        data: new URL("https://cdn.linqapp.com/IMG_0002.HEIF"),
        filename: "IMG_0002.HEIF",
        mediaType: "image/heif",
        type: "file",
      },
    ]);

    expect(stripped.droppedCount).toBe(2);
    expect(stripped.kept).toEqual([{ text: "What is this?", type: "text" }]);
  });

  it("matches sequence variants case-insensitively and ignores parameters", () => {
    const stripped = stripModelUnsupportedFileParts([
      {
        data: new URL("https://cdn.linqapp.com/photo.HEIC"),
        mediaType: "IMAGE/HEIC-SEQUENCE",
        type: "file",
      },
      {
        data: new URL("https://cdn.linqapp.com/photo2.heif"),
        mediaType: "image/heif-sequence; codecs=hevc",
        type: "file",
      },
    ]);

    expect(stripped.droppedCount).toBe(2);
    expect(stripped.kept).toEqual([]);
  });

  it("keeps model-supported images and non-image attachments untouched", () => {
    const parts = [
      {
        data: new URL("https://cdn.linqapp.com/photo.jpg"),
        mediaType: "image/jpeg",
        type: "file",
      },
      {
        data: new URL("https://cdn.linqapp.com/photo.png"),
        mediaType: "image/png",
        type: "file",
      },
      {
        data: new URL("https://cdn.linqapp.com/IMG_0001.MOV"),
        filename: "IMG_0001.MOV",
        mediaType: "video/quicktime",
        type: "file",
      },
      {
        data: new URL("https://cdn.linqapp.com/receipt.pdf"),
        filename: "receipt.pdf",
        mediaType: "application/pdf",
        type: "file",
      },
      { text: "Here is the receipt", type: "text" },
    ];

    const stripped = stripModelUnsupportedFileParts(parts);

    expect(stripped.droppedCount).toBe(0);
    expect(stripped.kept).toEqual(parts);
  });

  it("withholds file parts with no declared media type", () => {
    const stripped = stripModelUnsupportedFileParts([
      {
        data: new URL("https://cdn.linqapp.com/blob"),
        type: "file",
      },
      {
        data: new URL("https://cdn.linqapp.com/photo"),
        mediaType: "application/octet-stream",
        type: "file",
      },
    ]);

    expect(stripped.droppedCount).toBe(2);
    expect(stripped.kept).toEqual([]);
  });
});
