import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestSession = { readonly user: { readonly id: string } } | null;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  },
  useRouter: () => ({
    replace: vi.fn<() => void>(),
    refresh: vi.fn<() => void>(),
  }),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { readonly alt: string }) => createElement("img", { alt }),
}));

let authSession: TestSession = null;
let configuredLinq = false;
let localBypass = true;

vi.mock("@/auth/session", () => ({
  getAuthSession: async () => authSession,
}));

vi.mock("@/lib/request-scope", () => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  requireRequestScope: vi.fn<() => Promise<undefined>>(async () => undefined),
}));

vi.mock("@/auth/linq", () => ({
  readLinqOnboardingPhoneNumber: vi.fn<() => Promise<undefined>>(
    async () => undefined
  ),
}));

vi.mock("@/app/_lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn<
      () => Promise<{ readonly data: object; readonly error: null }>
    >(async () => ({ data: {}, error: null })),
  },
}));

vi.mock("@/env", () => ({
  env: {
    get LINQ_CONNECTOR() {
      return configuredLinq ? "configured" : undefined;
    },
  },
  get localPhoneAuthBypassEnabled() {
    return localBypass;
  },
}));

vi.mock("@/app/sign-in/_components/otp-form", () => ({
  PhoneOtpAuthForm: ({
    linqPhoneNumber,
    localBypass: formLocalBypass,
  }: {
    readonly linqPhoneNumber?: string;
    readonly localBypass?: boolean;
  }) =>
    createElement(
      "form",
      null,
      formLocalBypass ? "two-step-local" : `live-otp:${linqPhoneNumber ?? ""}`
    ),
}));

vi.mock("@/lib/admin", () => ({ isAdmin: async () => false }));

import SignInPage from "@/app/sign-in/page";
import AuthenticatedLayout from "@/app/(authenticated)/layout";
import { readLinqOnboardingPhoneNumber } from "@/auth/linq";
import { requireRequestScope, UnauthenticatedError } from "@/lib/request-scope";

describe("sign-in page", () => {
  beforeEach(() => {
    authSession = null;
    configuredLinq = false;
    localBypass = true;
    vi.mocked(readLinqOnboardingPhoneNumber).mockReset();
    vi.mocked(readLinqOnboardingPhoneNumber).mockResolvedValue(undefined);
    vi.mocked(requireRequestScope).mockReset();
    vi.mocked(requireRequestScope).mockResolvedValue({
      userId: "test-user",
      workspaceId: "personal:test",
    });
  });

  it("redirects an active session after scope admission", async () => {
    authSession = { user: { id: "active-user" } };

    await expect(
      SignInPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(requireRequestScope).toHaveBeenCalledOnce();
  });

  it("stabilizes the protected-layout redirect for a session without scope", async () => {
    authSession = { user: { id: "suspended-user" } };
    vi.mocked(requireRequestScope).mockRejectedValue(
      new UnauthenticatedError()
    );

    await expect(
      AuthenticatedLayout({
        children: createElement("main", null, "Protected content"),
        params: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/sign-in");

    const page = await SignInPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });

    const html = renderToStaticMarkup(page);
    expect(html).toContain("account is unavailable");
    expect(html).not.toContain("Enter your phone number");
  });

  it("skips Linq onboarding lookup for an unavailable account", async () => {
    authSession = { user: { id: "suspended-user" } };
    configuredLinq = true;
    localBypass = false;
    vi.mocked(requireRequestScope).mockRejectedValue(
      new UnauthenticatedError()
    );
    vi.mocked(readLinqOnboardingPhoneNumber).mockRejectedValue(
      new Error("lookup must be skipped")
    );

    const page = await SignInPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });

    const html = renderToStaticMarkup(page);
    expect(html).toContain("account is unavailable");
    expect(html).not.toContain("Enter your phone number");
    expect(readLinqOnboardingPhoneNumber).not.toHaveBeenCalled();
  });

  it("uses Linq onboarding for an anonymous configured deployment", async () => {
    configuredLinq = true;
    localBypass = false;
    vi.mocked(readLinqOnboardingPhoneNumber).mockResolvedValue("+12025550199");

    const page = await SignInPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page);

    expect(readLinqOnboardingPhoneNumber).toHaveBeenCalledExactlyOnceWith(
      "configured"
    );
    expect(html).toContain("live-otp:+12025550199");
  });

  it("propagates unexpected scope errors", async () => {
    authSession = { user: { id: "database-error-user" } };
    vi.mocked(requireRequestScope).mockRejectedValue(
      new Error("scope database unavailable")
    );

    await expect(
      SignInPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("scope database unavailable");
  });

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
