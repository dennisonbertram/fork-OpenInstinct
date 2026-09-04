import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SignInBubbles,
  SignInHero,
  signInSubhead,
} from "@/app/sign-in/_components/hero";

describe("sign-in hero", () => {
  it("renders the eyebrow, the headline as the h1, and the subhead", () => {
    const html = renderToStaticMarkup(
      createElement(SignInHero, {
        eyebrow: "OpenInstinct",
        headline: "Sign in.",
        subhead: "Enter your phone number to sign in.",
      })
    );
    expect(html).toContain("OpenInstinct");
    expect(html).toMatch(/<h1 class="type-hero">Sign in\.<\/h1>/);
    expect(html).toContain("type-eyebrow");
    expect(html).toContain("Enter your phone number to sign in.");
  });

  it("renders no empty paragraph without a subhead", () => {
    const html = renderToStaticMarkup(
      createElement(SignInHero, {
        eyebrow: "OpenInstinct",
        headline: "Sign in.",
      })
    );
    expect(html).not.toMatch(/<p[ >]/);
  });
});

describe("sign-in bubbles", () => {
  it("renders the user and assistant bubbles on the bubble tokens", () => {
    const html = renderToStaticMarkup(createElement(SignInBubbles));
    expect(html).toContain(
      "Can you check the Square inventory for low-stock items?"
    );
    expect(html).toContain(
      "On it. I will pull the catalog and flag anything under threshold."
    );
    expect(html).toContain("bg-bubble-user");
    expect(html).toContain("bg-bubble-assistant");
    expect((html.match(/rounded-bubble/g) ?? []).length).toBe(2);
  });
});

describe("sign-in subhead", () => {
  it("explains the local bypass", () => {
    expect(signInSubhead({ localBypass: true, linqConfigured: true })).toBe(
      "Enter your phone number to sign in."
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
