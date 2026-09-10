import { describe, expect, it } from "vitest";
import { validateSendblueInboundPayload } from "@/agent/lib/sendblue/admission";

// oxlint-disable anti-slop/no-unsafe-dictionary-type -- each case deliberately varies an untrusted webhook field.

const configured = {
  accountId: "account-expected",
  fromNumber: "+12025550123",
} as const;

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    accountEmail: configured.accountId,
    content: "hello",
    from_number: "+12025550199",
    group_id: "",
    is_outbound: false,
    message_handle: "message-a",
    message_type: "message",
    sendblue_number: configured.fromNumber,
    service: "iMessage",
    status: "RECEIVED",
    to_number: configured.fromNumber,
    ...overrides,
  };
}

describe("SendBlue inbound admission", () => {
  it("accepts only an exact 1:1 inbound message for the configured account and line", () => {
    expect(validateSendblueInboundPayload(inbound(), configured)).toEqual({
      accountId: configured.accountId,
      fromNumber: configured.fromNumber,
      messageHandle: "message-a",
      senderNumber: "+12025550199",
    });
  });

  it.each([
    ["wrong account", { accountEmail: "account-other" }],
    ["wrong receiving line", { sendblue_number: "+12025550999" }],
    ["missing receiving line", { sendblue_number: null }],
    ["conflicting destination", { to_number: "+12025550999" }],
    ["outbound event", { is_outbound: true }],
    ["group event", { group_id: "group-1", message_type: "group" }],
    ["missing provider message ID", { message_handle: "" }],
    ["missing service", { service: undefined }],
    ["malformed service", { service: 42 }],
    ["malformed content", { content: { text: "hello" } }],
    ["malformed media URL", { media_url: 42 }],
    ["invalid nonempty media URL", { media_url: "not-a-url" }],
    ["malformed sender", { from_number: "not-a-phone" }],
  ])("rejects %s before channel admission", (_reason, overrides) => {
    expect(
      validateSendblueInboundPayload(inbound(overrides), configured)
    ).toBeNull();
  });

  it("accepts the documented empty media URL on an otherwise valid text webhook", () => {
    expect(
      validateSendblueInboundPayload(inbound({ media_url: "" }), configured)
    ).not.toBeNull();
  });
});
