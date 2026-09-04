import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/connect", () => ({
  getTokenResponse: () => Promise.reject(new Error("connector unavailable")),
  NoValidTokenError: class NoValidTokenError extends Error {},
  UserAuthorizationRequiredError: class UserAuthorizationRequiredError extends Error {},
}));

vi.mock("@/db/services/settings", () => ({
  getGatewayModel: () => Promise.resolve("openai/gpt-5.6-sol-fast"),
}));

vi.mock("@/env", () => ({
  env: {
    BLOB_STORE_ID: "store_123",
    GOOGLE_CONNECTOR_UID: "google/open-instinct",
    LINQ_CONNECTOR: undefined,
    LINQ_PHONE_NUMBER: undefined,
    SQUARE_CONNECTOR_UID: undefined,
  },
}));

vi.mock("@/lib/request-scope", () => ({
  requireRequestScope: () => Promise.resolve({ userId: "user_123" }),
}));

vi.mock("../_components/model-selector", () => ({
  ModelSelector: ({ modelId }: { readonly modelId: string }) =>
    createElement("span", null, modelId),
}));

vi.mock("@/trpc/client", () => ({
  api: {
    googleWorkspace: {
      update: {
        useMutation: () => ({ isPending: false, mutate: () => undefined }),
      },
    },
    square: {
      update: {
        useMutation: () => ({ isPending: false, mutate: () => undefined }),
      },
    },
  },
}));

describe("workspace connection setup", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("tells users who must configure unavailable connectors and what happens next", async () => {
    const { default: WorkspacePage } = await import("../page");
    const page = await WorkspacePage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement(() => page));

    expect(html).toContain(
      "A deployment admin must attach the Google OAuth connector in Vercel Connect; then you can connect your account here."
    );
    expect(html).toContain(
      "A deployment admin must attach the Square OAuth connector in Vercel Connect; then you can connect your account here."
    );
    expect(html).toContain("Admin setup needed");
    expect(html).not.toContain("Setup required");
  });
});
