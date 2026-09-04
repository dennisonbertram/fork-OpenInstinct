import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SignInBubbles,
  SignInHero,
  signInSubhead,
} from "@/app/sign-in/_components/hero";

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
