import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignInHero, signInSubhead } from "@/app/sign-in/_components/hero";

describe("sign-in hero", () => {
  it("renders the greeting as the h1 without a product eyebrow", () => {
    const html = renderToStaticMarkup(
      createElement(SignInHero, {
        headline: "Hey, Jory",
        subhead: "Enter your phone number to sign in.",
      })
    );
    expect(html).toMatch(/<h1 class="type-hero">Hey, Jory<\/h1>/);
    expect(html).not.toContain("type-eyebrow");
    expect(html).toContain("Enter your phone number to sign in.");
  });

  it("renders no empty paragraph without a subhead", () => {
    const html = renderToStaticMarkup(
      createElement(SignInHero, {
        headline: "Hey, Jory",
      })
    );
    expect(html).not.toMatch(/<p[ >]/);
  });
});

describe("sign-in subhead", () => {
  it("explains the local bypass", () => {
    expect(signInSubhead({ localBypass: true, linqConfigured: true })).toBe(
      "Enter your phone number to request a sign-in code."
    );
  });

  it("explains the text code when Linq is configured", () => {
    expect(signInSubhead({ localBypass: false, linqConfigured: true })).toBe(
      "Enter your phone number and we will text you a code."
    );
  });

  it("has no subhead when nothing is configured", () => {
    expect(
      signInSubhead({ localBypass: false, linqConfigured: false })
    ).toBeUndefined();
  });
});
