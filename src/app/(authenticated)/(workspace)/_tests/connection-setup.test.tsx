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

  it("keeps operator setup details collapsed and model selection available", async () => {
    const { default: WorkspacePage } = await import("../page");
    const page = await WorkspacePage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(createElement(() => page));

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Setup details");
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain(
      "Deployment admins can attach the Google and Square OAuth connectors in Vercel Connect. Then connect your account here."
    );
    expect(html).toContain("Admin setup needed");
    expect(html).toContain("Gmail, Calendar, and Contacts.");
    expect(html).toContain("Locations, items, customers, and orders.");
    expect(html).not.toContain("Setup required");

    const detailsStart = html.indexOf("<details");
    const detailsEnd = html.indexOf("</details>");
    expect(detailsStart).toBeGreaterThanOrEqual(0);
    expect(detailsEnd).toBeGreaterThan(detailsStart);
    expect(html.slice(detailsStart, detailsEnd)).not.toContain(
      "openai/gpt-5.6-sol-fast"
    );
    expect(html).toContain("openai/gpt-5.6-sol-fast");
  });
});
