import { describe, expect, it, vi } from "vitest";
import { boundedDiagnosticFetch } from "../../scripts/diagnostics/operations-query";

describe("bounded authenticated diagnostics transport", () => {
  it("rejects a redirect before a cookie-bearing reader can follow it", async () => {
    const fetchImplementation = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => Response.redirect("https://other.example.test", 302));

    await expect(
      boundedDiagnosticFetch("https://app.example.test/api/trpc", undefined, {
        fetchImplementation,
      })
    ).rejects.toThrow(/redirected/u);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://app.example.test/api/trpc",
      expect.objectContaining({ redirect: "error" })
    );
  });

  it("aborts a stalled reader request within its explicit bound", async () => {
    const fetchImplementation = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(
      (_input, init) =>
        new Promise((_resolve, reject: (reason: Error) => void) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        })
    );

    await expect(
      boundedDiagnosticFetch("https://app.example.test/api/trpc", undefined, {
        fetchImplementation,
        timeoutMs: 10,
      })
    ).rejects.toThrow(/aborted/u);
  });
});
