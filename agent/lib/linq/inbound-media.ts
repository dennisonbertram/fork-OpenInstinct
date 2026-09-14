/**
 * Image formats the model gateway rejects as vision input.
 *
 * iPhones send still photos as HEIC/HEIF (and Live Photo sequence variants).
 * The AI Gateway answers those model calls with "The image data you provided
 * does not represent a valid image", which fails the whole turn. Parts in one
 * of these formats are withheld from model-bound content; every other part
 * passes through untouched.
 */
const modelUnsupportedImageMediaTypes = [
  "image/heic",
  "image/heic-sequence",
  "image/heif",
  "image/heif-sequence",
] as const;

/** Lowercases a MIME type and strips any `;` parameters. */
function mediaTypeRoot(mimeType: string | undefined): string | undefined {
  if (mimeType === undefined) return undefined;
  const root = mimeType.split(";")[0]?.trim().toLowerCase();
  return root && root.length > 0 ? root : undefined;
}

function isUnsupportedImageMediaType(mimeType: string | undefined): boolean {
  const root = mediaTypeRoot(mimeType);
  if (root === undefined) return false;
  return modelUnsupportedImageMediaTypes.some(
    (unsupported) => unsupported === root
  );
}

/** The structural shape Eve's `messageToUserContent` file parts carry. */
export interface ModelContentPart {
  readonly mediaType?: string;
  readonly type: string;
}

export interface StrippedModelContent<Part extends ModelContentPart> {
  readonly droppedCount: number;
  readonly kept: Part[];
}

/**
 * Removes file parts in a model-rejected image format from model-bound
 * content.
 *
 * Narrow by design: only HEIC/HEIF stills are withheld. Live Photo
 * `video/quicktime` companions, PDFs, text parts, and every other part keep
 * their existing behavior.
 */
export function stripModelUnsupportedFileParts<Part extends ModelContentPart>(
  parts: readonly Part[]
): StrippedModelContent<Part> {
  const kept: Part[] = [];
  let droppedCount = 0;
  for (const part of parts) {
    if (part.type === "file" && isUnsupportedImageMediaType(part.mediaType)) {
      droppedCount += 1;
      continue;
    }
    kept.push(part);
  }
  return { droppedCount, kept };
}
