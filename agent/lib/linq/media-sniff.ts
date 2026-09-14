/**
 * Byte-signature sniffing for inbound image formats.
 *
 * Declared MIME types cannot be trusted: an iPhone photo carrying HEIC bytes
 * can arrive labeled as a supported type, and the model gateway rejects the
 * turn when those bytes reach it. Sniffing the actual bytes is what decides.
 * Fail closed: anything unresolvable returns null.
 */
export type SniffedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/heic";

/** HEIF container brands that carry HEIC still images. */
const HEIC_FTYP_BRANDS = new Set(["heic", "heix", "mif1", "msf1"]);

function asciiBrand(bytes: Uint8Array, start: number): string {
  let brand = "";
  for (let index = start; index < start + 4; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) return "";
    brand += String.fromCharCode(byte);
  }
  return brand;
}

function isFtypBox(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

/**
 * Sniffs an image media type directly from bytes.
 * Returns null for anything unresolvable — including non-image data.
 */
export function sniffImageMediaType(
  bytes: Uint8Array
): SniffedImageMediaType | null {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: GIF87a or GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    asciiBrand(bytes, 8) === "WEBP"
  ) {
    return "image/webp";
  }

  // HEIC: ISO BMFF ftyp box with a HEIC still-image brand
  if (isFtypBox(bytes) && HEIC_FTYP_BRANDS.has(asciiBrand(bytes, 8))) {
    return "image/heic";
  }

  return null;
}
