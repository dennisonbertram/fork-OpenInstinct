import type { Attachment } from "chat";

/**
 * MIME types Eve may forward to the model as direct prompt content.
 *
 * The AI Gateway only accepts images and documents here; raw HEIC/HEIF,
 * video, audio, or unlabeled attachments make it reject the turn with a 400
 * error ("does not represent a valid image"). This mirrors the proven
 * Partyline-v2 inbound filter: allowlist, fail closed on anything else.
 */
const directPromptSupportedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
] as const;

/** Lowercases a MIME type and strips any `;` parameters. */
function mediaTypeRoot(mimeType: string | undefined): string | undefined {
  if (mimeType === undefined) return undefined;
  const root = mimeType.split(";")[0]?.trim().toLowerCase();
  return root && root.length > 0 ? root : undefined;
}

/** Whether a declared MIME type may reach the model as prompt content. */
export function isDirectPromptSupportedMime(
  mimeType: string | undefined
): boolean {
  const root = mediaTypeRoot(mimeType);
  if (root === undefined) return false;
  return directPromptSupportedMimeTypes.some((supported) => supported === root);
}

export interface PartitionedDirectPromptAttachments {
  readonly dropped: readonly Attachment[];
  readonly droppedCount: number;
  readonly kept: Attachment[];
}

/**
 * Splits attachments into model-safe and withheld sets.
 *
 * Withhold everything outside the allowlist: HEIC/HEIF stills, Live Photo
 * video companions, audio, octet-stream, and unlabeled parts. Eve
 * re-resolves the true media type when it fetches attachment bytes, so an
 * unlabeled part carrying HEIC bytes would still be rejected — failing
 * closed here is what keeps the turn alive.
 */
export function partitionDirectPromptAttachments(
  attachments: readonly Attachment[] | undefined
): PartitionedDirectPromptAttachments {
  const kept: Attachment[] = [];
  const dropped: Attachment[] = [];
  for (const attachment of attachments ?? []) {
    if (isDirectPromptSupportedMime(attachment.mimeType)) {
      kept.push(attachment);
    } else {
      dropped.push(attachment);
    }
  }
  return { dropped, droppedCount: dropped.length, kept };
}
