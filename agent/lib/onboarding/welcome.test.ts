import { describe, expect, it } from "vitest";

import { buildWelcomeOperations } from "@/agent/lib/onboarding/welcome";
import { ONBOARDING_CAPABILITY_EXAMPLES } from "@/agent/lib/onboarding/messages";
import { directChannelOnboardingPayloadSchema } from "@/lib/channel-onboarding-contract";

const addresses = { from: "+15550000001", to: "+15550000002" } as const;
const origin = "https://assistant.example";

describe("welcome operation builder", () => {
  it("orders four required text parts when cards are disabled", () => {
    const operations = buildWelcomeOperations({
      ...addresses,
      cardMode: "disabled",
    });
    expect(operations).toHaveLength(4);
    expect(operations.map(({ key }) => key)).toEqual([
      "onboarding:v1:text:welcome",
      "onboarding:v1:text:introduction",
      "onboarding:v1:text:examples",
      "onboarding:v1:text:beta",
    ]);
    expect(operations.every(({ required }) => required)).toBe(true);
  });

  it("places one three-image carousel before beta", () => {
    const operations = buildWelcomeOperations({
      ...addresses,
      assetOrigin: origin,
      cardMode: "carousel",
    });
    expect(operations).toHaveLength(5);
    const album = operations[3];
    const beta = operations[4];
    if (!album || !beta) throw new Error("Expected album and beta operations.");
    expect(album.key).toBe("onboarding:v1:card:album");
    expect(album.required).toBe(false);
    expect(album.payload.media).toHaveLength(3);
    expect(album.payload.text).toBe("");
    expect(album.payload.presentation?.kind).toBe("carousel");
    expect(beta.key).toBe("onboarding:v1:text:beta");
    expect(
      album.payload.media?.every(({ url }) => /^https:\/\/.*\.png$/.test(url))
    ).toBe(true);
  });

  it("builds three single-media cards before beta", () => {
    const operations = buildWelcomeOperations({
      ...addresses,
      assetOrigin: origin,
      cardMode: "single_media",
    });
    expect(operations).toHaveLength(7);
    expect(operations.slice(3, 6).every(({ required }) => !required)).toBe(
      true
    );
    expect(
      operations.slice(3, 6).every(({ payload }) => payload.media?.length === 1)
    ).toBe(true);
    expect(
      operations
        .slice(3, 6)
        .every(({ payload }) => payload.presentation?.kind === "single_media")
    ).toBe(true);
    expect(
      operations.slice(3, 6).every(({ payload }) => payload.text === "")
    ).toBe(true);
    const beta = operations[6];
    if (!beta) throw new Error("Expected beta operation.");
    expect(beta.key).toBe("onboarding:v1:text:beta");
  });

  it("uses the shared capability intro as the single_media text fallback", () => {
    const operations = buildWelcomeOperations({
      ...addresses,
      assetOrigin: origin,
      cardMode: "single_media",
    });
    const examples = operations[2];
    if (!examples) throw new Error("Expected examples operation.");
    expect(examples.key).toBe("onboarding:v1:text:examples");
    expect(examples.required).toBe(true);
    expect(examples.payload.text).toBe(ONBOARDING_CAPABILITY_EXAMPLES);
    expect(examples.payload.text.trim()).not.toBe("");
    expect(
      operations.slice(3, 6).every(({ payload }) => payload.text === "")
    ).toBe(true);
  });

  it("keeps from/to aligned and rejects non-HTTPS asset origins", () => {
    const operations = buildWelcomeOperations({
      ...addresses,
      assetOrigin: origin,
      cardMode: "carousel",
    });
    expect(
      operations.every(({ payload }) => payload.from === addresses.from)
    ).toBe(true);
    expect(operations.every(({ payload }) => payload.to === addresses.to)).toBe(
      true
    );
    expect(() =>
      buildWelcomeOperations({
        ...addresses,
        assetOrigin: "http://localhost:3000",
        cardMode: "single_media",
      })
    ).toThrow(/HTTPS/);
  });

  it("requires an explicit card mode", () => {
    expect(() =>
      // @ts-expect-error mode is intentionally required at the API boundary
      buildWelcomeOperations({
        ...addresses,
      })
    ).toThrow(/explicit onboarding card mode is required/i);
  });

  it("accepts only one-media blank-text single-media payloads", () => {
    const base = {
      from: addresses.from,
      presentation: { kind: "single_media" as const },
      to: addresses.to,
      version: 1 as const,
    };
    const media = [
      { contentType: "image/png", url: "https://assets.example/one.png" },
    ];

    expect(
      directChannelOnboardingPayloadSchema.parse({ ...base, media, text: "" })
    ).toMatchObject({ text: "" });

    for (const invalid of [
      { media, text: " " },
      { media: undefined, text: "" },
      { media: [], text: "" },
      { media: [...media, ...media], text: "" },
    ]) {
      expect(() =>
        directChannelOnboardingPayloadSchema.parse({ ...base, ...invalid })
      ).toThrow(/direct message requires text/i);
    }
  });
});
