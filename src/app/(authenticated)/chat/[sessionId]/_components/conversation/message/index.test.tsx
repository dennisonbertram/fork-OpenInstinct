import type { EveDynamicToolPart, EveMessage } from "eve/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMessage } from ".";
import { InputRequestActions } from "./input-request";

describe("agent messages", () => {
  it("renders ordinary assistant text without a delivery tool result", () => {
    const message = {
      id: "assistant-message",
      metadata: { status: "complete" },
      parts: [
        {
          state: "done",
          text: "Hello from ordinary assistant output.",
          type: "text",
        },
      ],
      role: "assistant",
    } satisfies EveMessage;

    const markup = renderToStaticMarkup(
      <AgentMessage
        canRespond
        isStreaming={false}
        message={message}
        onInputResponses={() => undefined}
      />
    );

    expect(markup).toContain("Hello from ordinary assistant output.");
  });

  it("renders only Linq-delivered content in the iMessage view", () => {
    const message = {
      id: "turn-1:assistant",
      metadata: { status: "complete", turnId: "turn-1" },
      parts: [
        {
          state: "done",
          stepIndex: 1,
          text: "I’ll check that now.",
          type: "text",
        },
        {
          state: "done",
          stepIndex: 0,
          text: "Private reasoning",
          type: "reasoning",
        },
        {
          input: { query: "example" },
          output: { result: "internal" },
          state: "output-available",
          stepIndex: 0,
          toolCallId: "call-1",
          toolName: "web_search",
          type: "dynamic-tool",
        },
        {
          state: "done",
          stepIndex: 1,
          text: "Here’s what I found.",
          type: "text",
        },
      ],
      role: "assistant",
    } satisfies EveMessage;

    const markup = renderToStaticMarkup(
      <AgentMessage
        canRespond
        isStreaming={false}
        message={message}
        onInputResponses={() => undefined}
        sentMessageParts={[
          {
            state: "done",
            stepIndex: 1,
            text: "Here’s what I found.",
            type: "text",
          },
        ]}
        userVisibleOnly
      />
    );

    expect(markup).toContain("Here’s what I found.");
    expect(markup).not.toContain("I’ll check that now.");
    expect(markup).not.toContain("Private reasoning");
    expect(markup).not.toContain("web_search");
  });

  it("hides non-send_message controls in the iMessage projection", () => {
    const message = {
      id: "turn-2:assistant",
      metadata: { status: "streaming", turnId: "turn-2" },
      parts: [
        {
          approval: { id: "approval-1" },
          input: { amount: 50, recipient: "Hidden recipient" },
          state: "approval-requested",
          stepIndex: 0,
          toolCallId: "call-2",
          toolMetadata: {
            eve: {
              inputRequest: {
                kind: "tool-approval",
                options: [
                  { id: "approve", label: "Approve", style: "primary" },
                  { id: "cancel", label: "Cancel", style: "danger" },
                ],
                prompt: "Approve this action?",
                requestId: "approval-1",
              },
              kind: "tool-call",
              name: "send_payment",
            },
          },
          toolName: "send_payment",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    } satisfies EveMessage;

    const markup = renderToStaticMarkup(
      <AgentMessage
        canRespond
        isStreaming={false}
        message={message}
        onInputResponses={() => undefined}
        userVisibleOnly
      />
    );

    expect(markup).not.toContain("Approve this action?");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Cancel");
    expect(markup).not.toContain("send_payment");
    expect(markup).not.toContain("Hidden recipient");
  });

  it("shows browser commit terms without exposing internal browser or vault identifiers", () => {
    const part = {
      approval: { id: "approval-2" },
      input: {
        action: "place_order",
        browser_session_id: "browser-secret-id",
        frame_id: "order-frame-secret-id",
        origin: "https://merchant.example",
        payment: {
          candidate_id: "vault-card-secret-id",
          frame_id: "payment-frame-secret-id",
          origin: "https://payments.example",
        },
        target_label: "button: Place order",
        target_ref: "e12",
        terms: {
          item: "Wool travel blanket",
          kind: "place_order",
          merchant: "Example Outfitters",
          option: "Forest green",
          quantity: 2,
          total: "USD 84.00",
        },
      },
      state: "approval-requested",
      stepIndex: 0,
      toolCallId: "call-3",
      toolMetadata: {
        eve: {
          inputRequest: {
            kind: "tool-approval",
            options: [
              { id: "approve", label: "Approve", style: "primary" },
              { id: "cancel", label: "Cancel", style: "danger" },
            ],
            prompt: "Approve this action?",
            requestId: "approval-2",
          },
          kind: "tool-call",
          name: "commit_browser_action",
        },
      },
      toolName: "commit_browser_action",
      type: "dynamic-tool",
    } satisfies EveDynamicToolPart;

    const markup = renderToStaticMarkup(
      <InputRequestActions
        canRespond
        onInputResponses={() => undefined}
        part={part}
      />
    );

    for (const term of [
      "Example Outfitters",
      "Wool travel blanket",
      "Forest green",
      "2",
      "USD 84.00",
      "https://payments.example",
    ]) {
      expect(markup).toContain(term);
    }
    for (const internal of [
      "commit_browser_action",
      "browser-secret-id",
      "order-frame-secret-id",
      "payment-frame-secret-id",
      "vault-card-secret-id",
      "e12",
    ]) {
      expect(markup).not.toContain(internal);
    }
  });
});
