import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: () => undefined,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { readonly alt: string }) => createElement("img", { alt }),
}));

vi.mock("@/auth/session", () => ({
  getAuthSession: async () => null,
}));

vi.mock("@/auth/linq", () => ({
  readLinqOnboardingPhoneNumber: async () => undefined,
}));

vi.mock("@/env", () => ({
  env: { LINQ_CONNECTOR: undefined },
  localPhoneAuthBypassEnabled: true,
}));

vi.mock("@/app/sign-in/_components/otp-form", () => ({
  PhoneOtpAuthForm: ({ localBypass }: { readonly localBypass?: boolean }) =>
    createElement("form", null, localBypass ? "two-step-local" : "live-otp"),
}));

import SignInPage from "@/app/sign-in/page";

describe("sign-in page", () => {
  it("greets Jory in the hero without a separate product eyebrow", async () => {
    const page = await SignInPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toMatch(/<h1 class="type-hero">Hey, Jory<\/h1>/);
    expect(html).not.toContain(">OpenInstinct<");
    expect(html).not.toContain("type-eyebrow");
    expect(html).not.toContain(
      "Can you check the Square inventory for low-stock items?"
    );
    expect(html).not.toContain(
      "On it. I will pull the catalog and flag anything under threshold."
    );
    expect(html).toContain("two-step-local");
    expect(html).toContain("lg:grid-cols");
    expect(html).not.toContain("md:grid-cols");
  });
});
