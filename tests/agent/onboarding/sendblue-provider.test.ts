import { beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));

vi.mock("@/env", () => ({
  env: {
    SENDBLUE_API_KEY_ID: "test-key",
    SENDBLUE_API_SECRET_KEY: "test-secret",
  },
}));

import {
  getOnboardingSendblueStatus,
  maximumSendblueOnboardingTextCharacters,
  sendOnboardingSendbluePayload,
  sendOnboardingSendblueMessage,
} from "@/agent/lib/onboarding/sendblue-provider";

describe("onboarding SendBlue provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", capture.fetch);
  });

  it("records a provider handle only for an accepted SendBlue message", async () => {
    capture.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ message_handle: "sendblue-1", status: "ACCEPTED" }),
        { status: 200 }
      )
    );

    await expect(
      sendOnboardingSendblueMessage({
        from: "+12025550123",
        text: "You’re in!",
        to: "+12025550199",
      })
    ).resolves.toEqual({ kind: "accepted", providerHandle: "sendblue-1" });

    expect(capture.fetch).toHaveBeenCalledWith(
      "https://api.sendblue.co/api/send-message",
      expect.objectContaining({
        body: JSON.stringify({
          content: "You’re in!",
          from_number: "+12025550123",
          number: "+12025550199",
        }),
        headers: {
          "Content-Type": "application/json",
          "sb-api-key-id": "test-key",
          "sb-api-secret-key": "test-secret",
        },
        method: "POST",
      })
    );
  });

  it("does not retry a timeout as a proven rejection", async () => {
    capture.fetch.mockRejectedValue(new Error("network timeout"));

    await expect(
      sendOnboardingSendblueMessage({
        from: "+12025550123",
        text: "You’re in!",
        to: "+12025550199",
      })
    ).resolves.toEqual({ kind: "uncertain" });
  });

  it("uses the persisted carousel format for three HTTPS example cards", async () => {
    capture.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ message_handle: "carousel-1", status: "ACCEPTED" }),
        { status: 200 }
      )
    );

    await expect(
      sendOnboardingSendbluePayload({
        from: "+12025550123",
        media: [
          { contentType: "image/png", url: "https://assets.example/one.png" },
          { contentType: "image/png", url: "https://assets.example/two.png" },
          {
            contentType: "image/png",
            url: "https://assets.example/three.png",
          },
        ],
        presentation: { kind: "carousel" },
        text: "",
        to: "+12025550199",
        version: 1,
      })
    ).resolves.toEqual({ kind: "accepted", providerHandle: "carousel-1" });

    expect(capture.fetch).toHaveBeenCalledWith(
      "https://api.sendblue.co/api/send-carousel",
      expect.objectContaining({
        body: JSON.stringify({
          from_number: "+12025550123",
          media_urls: [
            "https://assets.example/one.png",
            "https://assets.example/two.png",
            "https://assets.example/three.png",
          ],
          number: "+12025550199",
        }),
      })
    );
  });

  it("rejects an invalid persisted media presentation before an attempted provider call", async () => {
    await expect(
      sendOnboardingSendblueMessage({
        from: "+12025550123",
        media: [
          { contentType: "image/png", url: "http://assets.example/one.png" },
        ],
        presentation: { kind: "single_media", sendStyle: "celebration" },
        text: "You’re in!",
        to: "+12025550199",
      })
    ).resolves.toEqual({ kind: "rejected" });

    expect(capture.fetch).not.toHaveBeenCalled();
  });

  it("does not attempt a text beyond SendBlue's documented message limit", async () => {
    await expect(
      sendOnboardingSendblueMessage({
        from: "+12025550123",
        text: "x".repeat(maximumSendblueOnboardingTextCharacters + 1),
        to: "+12025550199",
      })
    ).resolves.toEqual({ kind: "rejected" });

    expect(capture.fetch).not.toHaveBeenCalled();
  });

  it("leaves an undocumented non-success provider response uncertain", async () => {
    capture.fetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 408 })
    );

    await expect(
      sendOnboardingSendblueMessage({
        from: "+12025550123",
        text: "You’re in!",
        to: "+12025550199",
      })
    ).resolves.toEqual({ kind: "uncertain" });
  });

  it("returns a definite rejection for a client refusal", async () => {
    capture.fetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "DECLINED" }), { status: 400 })
    );

    await expect(
      sendOnboardingSendblueMessage({
        from: "+12025550123",
        text: "You’re in!",
        to: "+12025550199",
      })
    ).resolves.toEqual({ kind: "rejected" });
  });

  it("reconciles a known provider handle as delivered without conflating it with acceptance", async () => {
    capture.fetch.mockResolvedValue(
      new Response(JSON.stringify({ status: "DELIVERED" }), { status: 200 })
    );

    await expect(getOnboardingSendblueStatus("sendblue-1")).resolves.toEqual({
      kind: "delivered",
    });
    expect(capture.fetch).toHaveBeenCalledWith(
      "https://api.sendblue.co/api/status?handle=sendblue-1",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("leaves a known handle uncertain when SendBlue status cannot be read", async () => {
    capture.fetch.mockRejectedValue(new Error("status unavailable"));

    await expect(getOnboardingSendblueStatus("sendblue-1")).resolves.toEqual({
      kind: "uncertain",
    });
  });
});
