import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChannelsSection } from "@/app/(authenticated)/(workspace)/_components/channels-section";

describe("workspace messaging channels", () => {
  it("opens the configured SendBlue conversation line when Linq is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: false,
        linqPhoneNumber: undefined,
        sendblueConversationsEnabled: true,
        sendblueFromNumber: "+12025550124",
      })
    );

    expect(html).toContain("sms:+12025550124");
    expect(html).toContain('aria-label="Open SendBlue iMessage"');
    expect(html).toContain("iMessage opens the SendBlue line +12025550124.");
    expect(html).not.toContain("Set up Linq to enable iMessage.");
  });

  it("keeps the Linq line as the preferred link when both channels are configured", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: true,
        linqPhoneNumber: "+12025550123",
        sendblueConversationsEnabled: true,
        sendblueFromNumber: "+12025550124",
      })
    );

    expect(html).toContain("sms:+12025550123");
    expect(html).toContain('aria-label="Open Linq iMessage"');
    expect(html).toContain("iMessage opens the Linq line +12025550123.");
    expect(html).not.toContain("+12025550124");
  });

  it("links the configured Linq line", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: true,
        linqPhoneNumber: "+12025550123",
        sendblueConversationsEnabled: false,
        sendblueFromNumber: undefined,
      })
    );

    expect(html).toContain("sms:+12025550123");
    expect(html).toContain('aria-label="Open Linq iMessage"');
    expect(html).toContain("iMessage opens the Linq line +12025550123");
  });

  it("disables iMessage without advertising another deployment's number", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: false,
        linqPhoneNumber: undefined,
        sendblueConversationsEnabled: false,
        sendblueFromNumber: undefined,
      })
    );

    expect(html).toContain("Set up Linq or enable SendBlue conversations");
    expect(html).not.toContain("+12052611117");
    expect(html).not.toContain("sms:");
  });

  it("does not enable an OTP-only SendBlue line when conversation support is off", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: false,
        linqPhoneNumber: undefined,
        sendblueConversationsEnabled: false,
        sendblueFromNumber: "+12025550124",
      })
    );

    expect(html).toContain(
      "The SendBlue line is configured, but SendBlue conversations are disabled."
    );
    expect(html).not.toContain("Open SendBlue iMessage");
    expect(html).not.toContain("sms:");
  });

  it("keeps SendBlue disabled if conversations are enabled without a line", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: false,
        linqPhoneNumber: undefined,
        sendblueConversationsEnabled: true,
        sendblueFromNumber: undefined,
      })
    );

    expect(html).toContain(
      "SendBlue conversations are enabled, but the sending line is unavailable."
    );
    expect(html).not.toContain("sms:");
  });

  it("reports the configured Linq connection when its line is not exposed", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: true,
        linqPhoneNumber: undefined,
        sendblueConversationsEnabled: false,
        sendblueFromNumber: undefined,
      })
    );

    expect(html).toContain(
      "Linq is connected. Use its assigned line to start an iMessage."
    );
    expect(html).not.toContain("sms:");
  });

  it("does not advertise a phone-number override without its connector", () => {
    const html = renderToStaticMarkup(
      createElement(ChannelsSection, {
        browserReady: true,
        linqConfigured: false,
        linqPhoneNumber: "+12025550123",
        sendblueConversationsEnabled: false,
        sendblueFromNumber: undefined,
      })
    );

    expect(html).toContain("Set up Linq or enable SendBlue conversations");
    expect(html).not.toContain("sms:");
  });
});
