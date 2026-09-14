import type { Attachment } from "chat";
import { convertHeicToJpeg } from "@/agent/lib/linq/heic-to-jpeg";
import { sniffImageMediaType } from "@/agent/lib/linq/media-sniff";

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

/** Caps inbound image verification: bounds memory, latency, and model payload. */
const MAX_INBOUND_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_MODEL_INLINE_IMAGE_BYTES = 3 * 1024 * 1024;
const INBOUND_IMAGE_FETCH_TIMEOUT_MS = 15_000;

export interface ResolvedModelImageAttachments {
  readonly kept: Attachment[];
  readonly withheldCount: number;
}

async function readCappedBytes(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_INBOUND_IMAGE_BYTES) {
    return null;
  }
  const body = response.body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    /* oxlint-disable eslint/no-await-in-loop -- Sequential bounded reads keep memory capped; parallel reads would unbound it. */
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INBOUND_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    /* oxlint-enable eslint/no-await-in-loop */
  } catch {
    return null;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function fetchDataWithTimeout(
  fetchData: () => Promise<Buffer>
): Promise<Buffer> {
  const pending = fetchData();
  void pending.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Inbound image fetch timed out."));
    }, INBOUND_IMAGE_FETCH_TIMEOUT_MS);
  });
  return Promise.race([pending, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function readAttachmentBytes(
  attachment: Attachment
): Promise<Uint8Array | null> {
  if (attachment.url) {
    let parsed: URL;
    try {
      parsed = new URL(attachment.url);
    } catch {
      return null;
    }
    if (parsed.protocol === "data:") {
      const comma = attachment.url.indexOf(",");
      const metadata = attachment.url.slice(5, comma).toLowerCase();
      const encoded = attachment.url.slice(comma + 1);
      const maximumBase64Length =
        Math.ceil((MAX_INBOUND_IMAGE_BYTES * 4) / 3) + 4;
      if (
        comma === -1 ||
        !metadata.split(";").includes("base64") ||
        encoded.length > maximumBase64Length
      )
        return null;
      const bytes = Buffer.from(encoded, "base64");
      return bytes.byteLength > MAX_INBOUND_IMAGE_BYTES ? null : bytes;
    }
    if (parsed.protocol !== "https:") return null;
    try {
      const response = await fetch(parsed, {
        redirect: "error",
        signal: AbortSignal.timeout(INBOUND_IMAGE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      return await readCappedBytes(response);
    } catch {
      return null;
    }
  }
  const fetchData = attachment.fetchData;
  if (fetchData !== undefined) {
    try {
      const data = await fetchDataWithTimeout(fetchData);
      return data.byteLength > MAX_INBOUND_IMAGE_BYTES ? null : data;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Verifies one declared image against its actual bytes.
 * Returns a model-safe attachment, or null to withhold it.
 */
async function resolveImageAttachment(
  attachment: Attachment
): Promise<Attachment | null> {
  const bytes = await readAttachmentBytes(attachment);
  if (!bytes) return null;
  const sniffed = sniffImageMediaType(bytes);
  if (sniffed === null) return null;
  if (sniffed === "image/heic") {
    const jpeg = await convertHeicToJpeg(bytes);
    if (!jpeg || jpeg.byteLength > MAX_MODEL_INLINE_IMAGE_BYTES) return null;
    const base64 = Buffer.from(jpeg).toString("base64");
    const rawStem = attachment.name?.split(".").slice(0, -1).join(".");
    const stem = rawStem && rawStem.length > 0 ? rawStem : "photo";
    return {
      ...attachment,
      mimeType: "image/jpeg",
      name: `${stem}.jpg`,
      url: `data:image/jpeg;base64,${base64}`,
    };
  }
  if (bytes.byteLength > MAX_MODEL_INLINE_IMAGE_BYTES) return null;
  return {
    ...attachment,
    mimeType: sniffed,
    // Eve serializes attachment URLs. Inline the exact verified bytes rather
    // than allowing a later signed-URL fetch to observe a changed payload.
    url: `data:${sniffed};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

function isModelImageCandidate(attachment: Attachment): boolean {
  const root = mediaTypeRoot(attachment.mimeType);
  return (
    root === undefined ||
    root.startsWith("image/") ||
    root === "application/octet-stream" ||
    attachment.type === "image"
  );
}

/**
 * Verifies model image candidates against bytes: corrects mislabeled formats,
 * converts HEIC stills to JPEG, and withholds opaque or image candidates whose
 * bytes cannot be classified. Explicit documents and text pass through without
 * fetching. Order is preserved; failures never throw — they withhold.
 */
export async function prepareModelImageAttachments(
  attachments: readonly Attachment[]
): Promise<ResolvedModelImageAttachments> {
  const kept: Attachment[] = [];
  let withheldCount = 0;
  for (const attachment of attachments) {
    if (!isModelImageCandidate(attachment)) {
      kept.push(attachment);
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- Ordered, bounded image verification; photo messages carry few parts.
    const resolved = await resolveImageAttachment(attachment);
    if (resolved) {
      kept.push(resolved);
    } else {
      withheldCount += 1;
    }
  }
  return { kept, withheldCount };
}
