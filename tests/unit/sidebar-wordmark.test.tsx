import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import joryWordmark from "../../docs/design/assets/jory-wordmark-color.svg";

vi.mock("next/navigation", () => ({
  redirect: () => undefined,
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { readonly alt: string; readonly src: unknown }) =>
    createElement("img", { alt, src: String(src) }),
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
      createElement("img", { alt: "", src: String(joryWordmark) })
    );

    expect(html).toMatch(/<a[^>]*aria-label="Jory"[^>]*href="\/"/);
    expect(html).toContain(expectedWordmark);
    expect(html).not.toContain("OpenInstinct");
  });
});
