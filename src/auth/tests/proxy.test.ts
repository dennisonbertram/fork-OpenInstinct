import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "../../proxy";

describe("auth proxy matcher", () => {
  it("does not match public fonts", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/fonts/vault-variable.woff2",
      })
    ).toBe(false);
  });

  it("does not match public brand assets", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/brand/jory-avatar-desk.webp",
      })
    ).toBe(false);
  });

  it("continues to match protected application routes", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/vault",
      })
    ).toBe(true);
  });
});
