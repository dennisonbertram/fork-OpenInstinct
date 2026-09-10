"use client";

import { useState } from "react";
import Image from "next/image";
import joryAvatar from "../../../../../../../../docs/design/assets/jory-avatar_clay.webp";
import { cn } from "@/lib/utils";

const fallbackThemes = [
  "bg-information-subtle text-information",
  "bg-success-subtle text-success",
  "bg-warning-subtle text-warning",
] as const;

export function MessageAvatar({
  imageUrl,
  kind,
  userId = "anonymous",
}: {
  readonly imageUrl?: string | null;
  readonly kind: "assistant" | "user";
  readonly userId?: string;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const safeImageUrl = kind === "user" ? toSafeImageUrl(imageUrl) : undefined;
  const showUserImage =
    Boolean(safeImageUrl) && safeImageUrl !== failedImageUrl;
  const localJoryAvatar: Parameters<typeof Image>[0]["src"] = joryAvatar;

  return (
    <span
      aria-label={kind === "assistant" ? "Jory" : "You"}
      className="relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70"
      data-slot="message-avatar"
      // The fallback is a CSS face, so the wrapper gives it an accessible name.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
    >
      {kind === "assistant" ? (
        <Image
          alt=""
          className="size-full object-cover"
          decoding="async"
          height={36}
          src={localJoryAvatar}
          width={36}
        />
      ) : (
        <FallbackAvatar userId={userId} />
      )}
      {kind === "user" && showUserImage ? (
        // oxlint-disable-next-line next/no-img-element
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          height={36}
          loading="lazy"
          onError={() => {
            setFailedImageUrl(safeImageUrl);
          }}
          referrerPolicy="no-referrer"
          src={safeImageUrl}
          width={36}
        />
      ) : null}
    </span>
  );
}

function FallbackAvatar({ userId }: { readonly userId: string }) {
  const theme = fallbackThemes[stableThemeIndex(userId)];

  return (
    <span aria-hidden="true" className={cn("relative size-full", theme)}>
      <span className="absolute top-[35%] left-[28%] size-1 rounded-full bg-current" />
      <span className="absolute top-[35%] right-[28%] size-1 rounded-full bg-current" />
      <span className="absolute bottom-[25%] left-1/2 h-1 w-2 -translate-x-1/2 rounded-b-full border-b border-current" />
    </span>
  );
}

function stableThemeIndex(userId: string) {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return (hash >>> 0) % fallbackThemes.length;
}

function toSafeImageUrl(imageUrl?: string | null) {
  if (!imageUrl) return undefined;
  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
