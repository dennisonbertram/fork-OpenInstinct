import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import joryWordmark from "../../docs/design/assets/jory-wordmark-color.svg";
import joryAvatar from "../../docs/design/assets/jory-avatar_clay.webp";

vi.mock("next/navigation", () => ({
  redirect: () => undefined,
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    className,
  }: {
    readonly alt: string;
    readonly src: unknown;
    readonly className?: string;
  }) => createElement("img", { alt, src: String(src), className }),
}));

vi.mock("@/lib/request-scope", () => ({
  requireRequestScope: async () => undefined,
  UnauthenticatedError: class extends Error {},
}));

vi.mock("@/lib/admin", () => ({
  isAdmin: async () => false,
}));

vi.mock("@/trpc/client", () => ({
  TRPCProvider: ({ children }: { readonly children: ReactNode }) =>
    createElement(Fragment, null, children),
}));

vi.mock("@/app/(authenticated)/_components/account-control", () => ({
  AuthenticatedAccountControl: () => createElement("div"),
}));

vi.mock("@/app/(authenticated)/_components/authenticated-navigation", () => ({
  AuthenticatedMobileHeader: () => createElement("div"),
  AuthenticatedNavigation: () => createElement("nav"),
}));

import AuthenticatedLayout from "@/app/(authenticated)/layout";

describe("authenticated layout", () => {
  it("uses the Jory wordmark for the sidebar home link", async () => {
    const layout = await AuthenticatedLayout({
      children: createElement("main", null, "Workspace"),
      params: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(layout);
    const expectedWordmark = renderToStaticMarkup(
      createElement("img", {
        alt: "",
        src: String(joryWordmark),
        className: "h-6 w-auto",
      })
    );
    const expectedAvatar = renderToStaticMarkup(
      // SAFETY: Vite resolves image imports to URLs; Next declares StaticImageData.
      createElement("img", {
        alt: "",
        src: String(joryAvatar as unknown),
        className: "size-9 shrink-0 rounded-full bg-muted object-contain p-0.5",
      })
    ).replace(/<link[^>]*\/>/g, "");

    expect(html).toMatch(/<a[^>]*aria-label="Jory"[^>]*href="\/"/);
    expect(html).toContain(`${expectedAvatar}${expectedWordmark}</a>`);
    expect(html).toMatch(/<a[^>]*class="[^"]*items-center[^"]*"[^>]*href="\/"/);
    expect(html).not.toContain("OpenInstinct");
  });
});
