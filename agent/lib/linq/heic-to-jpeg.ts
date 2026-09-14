/**
 * HEIC-to-JPEG conversion for inbound iPhone photos.
 *
 * The decoder is lazily imported so text-only turns never pay for it. Pure
 * JavaScript (no native modules), safe for serverless runtimes.
 */
const MAX_HEIC_INPUT_BYTES = 10 * 1024 * 1024;
const HEIC_JPEG_QUALITY = 0.8;

/**
 * Converts HEIC bytes to JPEG bytes. Returns null when the input is empty,
 * over the size cap, or undecodable — the caller withholds the part.
 */
export async function convertHeicToJpeg(
  bytes: Uint8Array
): Promise<Uint8Array | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_HEIC_INPUT_BYTES) {
    return null;
  }
  try {
    const convert = (await import("heic-convert")).default;
    const output = await convert({
      buffer: bytes,
      format: "JPEG",
      quality: HEIC_JPEG_QUALITY,
    });
    if (output.byteLength === 0) return null;
    return output;
  } catch {
    return null;
  }
}
