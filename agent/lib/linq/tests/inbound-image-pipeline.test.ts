import type { Attachment } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareModelImageAttachments } from "@/agent/lib/linq/inbound-media";

vi.mock("@/agent/lib/linq/heic-to-jpeg", () => ({
  convertHeicToJpeg: vi.fn<() => Promise<Uint8Array>>(
    async () => new Uint8Array([0xff, 0xd8, 0xff])
  ),
}));

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function heicBytes(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
  ]);
}

function imageAttachment(overrides: {
  readonly fetchData?: () => Promise<Buffer>;
  readonly mimeType?: string;
  readonly name?: string;
  readonly type?: Attachment["type"];
  readonly url?: string;
}): Attachment {
  return {
    fetchData: overrides.fetchData ?? (async () => jpegBytes()),
    mimeType: overrides.mimeType ?? "image/jpeg",
    name: overrides.name ?? "photo.jpg",
    type: overrides.type ?? "image",
    url: overrides.url ?? "https://cdn.linqapp.com/photo.jpg",
  };
}

describe("prepareModelImageAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps verified images and corrects mislabeled formats", async () => {
    const mislabeled = imageAttachment({
      fetchData: async () =>
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: "image/jpeg",
      name: "photo.png",
    });

    const resolved = await prepareModelImageAttachments([
      imageAttachment({}),
      mislabeled,
    ]);

    expect(resolved.withheldCount).toBe(0);
    expect(resolved.kept).toHaveLength(2);
    expect(resolved.kept[0]?.mimeType).toBe("image/jpeg");
    expect(resolved.kept[1]?.mimeType).toBe("image/png");
  });

  it("converts HEIC bytes to a JPEG data URL", async () => {
    const resolved = await prepareModelImageAttachments([
      imageAttachment({
        fetchData: async () => heicBytes(),
        mimeType: "image/jpeg",
        name: "IMG_0001.HEIC",
      }),
    ]);

    expect(resolved.withheldCount).toBe(0);
    expect(resolved.kept).toHaveLength(1);
    expect(resolved.kept[0]?.mimeType).toBe("image/jpeg");
    expect(resolved.kept[0]?.name).toBe("IMG_0001.jpg");
    expect(resolved.kept[0]?.url?.startsWith("data:image/jpeg;base64,")).toBe(
      true
    );
  });

  it("withholds undecodable bytes and failed fetches without throwing", async () => {
    const resolved = await prepareModelImageAttachments([
      imageAttachment({
        fetchData: async () => Buffer.from([0x00, 0x01, 0x02, 0x03]),
      }),
      imageAttachment({
        fetchData: async () => {
          throw new Error("network down");
        },
      }),
    ]);

    expect(resolved.kept).toEqual([]);
    expect(resolved.withheldCount).toBe(2);
  });

  it("passes non-image attachments through without fetching", async () => {
    const fetchData = vi.fn<() => Promise<Buffer>>(async () => jpegBytes());
    const pdf = imageAttachment({
      fetchData,
      mimeType: "application/pdf",
      name: "receipt.pdf",
      type: "file",
    });

    const resolved = await prepareModelImageAttachments([pdf]);

    expect(resolved.kept).toEqual([pdf]);
    expect(resolved.withheldCount).toBe(0);
    expect(fetchData).not.toHaveBeenCalled();
  });

  it("preserves attachment order across mixed outcomes", async () => {
    const resolved = await prepareModelImageAttachments([
      imageAttachment({ name: "a.jpg" }),
      imageAttachment({
        fetchData: async () => Buffer.from([0x00]),
        name: "b.jpg",
      }),
      imageAttachment({ name: "c.jpg" }),
    ]);

    expect(resolved.kept.map((part) => part.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(resolved.withheldCount).toBe(1);
  });
});
