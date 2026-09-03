import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Message, MessageContent } from "@/components/ai-elements/message";

function bubble(from: "user" | "assistant") {
  return renderToStaticMarkup(
    createElement(Message, { from }, createElement(MessageContent, null, "Hi"))
  );
}

describe("message bubbles", () => {
  it("gives the user side the user bubble color and the bubble radius", () => {
    const html = bubble("user");
    expect(html).toContain("group-[.is-user]:bg-bubble-user");
    expect(html).toContain("group-[.is-user]:rounded-bubble");
  });

  it("gives the assistant side the assistant bubble color", () => {
    const html = bubble("assistant");
    expect(html).toContain("group-[.is-assistant]:bg-bubble-assistant");
    expect(html).toContain("group-[.is-assistant]:rounded-bubble");
  });
});
