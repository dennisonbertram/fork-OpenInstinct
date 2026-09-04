import { describe, expect, it } from "vitest";
import { contractFixtureResponse } from "./fixture-model";

describe("contract fixture model", () => {
  it("turns one or two say clauses into exact delivery calls", () => {
    expect(contractFixtureResponse(request("say hi there"))).toEqual({
      toolCalls: [
        { input: { kind: "message", text: "hi there" }, name: "send_message" },
      ],
    });
    expect(contractFixtureResponse(request("say first | second"))).toEqual({
      toolCalls: [
        { input: { kind: "message", text: "first" }, name: "send_message" },
        { input: { kind: "message", text: "second" }, name: "send_message" },
      ],
    });
  });

  it("loads skills and calls named tools with parsed JSON", () => {
    expect(contractFixtureResponse(request("load square"))).toEqual({
      toolCalls: [{ input: { skill: "square" }, name: "load_skill" }],
    });
    expect(
      contractFixtureResponse(
        request('call connection_search {"keywords":"square"}')
      )
    ).toEqual({
      toolCalls: [{ input: { keywords: "square" }, name: "connection_search" }],
    });
  });

  it("discovers a connection before calling one of its tools", () => {
    expect(
      contractFixtureResponse(request("call square__ListCustomers {}"))
    ).toEqual({
      toolCalls: [
        { input: { keywords: "ListCustomers" }, name: "connection_search" },
      ],
    });
    expect(
      contractFixtureResponse(
        request(
          "call square__ListCustomers {}",
          [
            {
              id: "tool-1",
              isError: false,
              name: "connection_search",
              output: { connections: ["square"] },
            },
          ],
          ["square__ListCustomers"]
        )
      )
    ).toEqual({
      toolCalls: [{ input: {}, name: "square__ListCustomers" }],
    });
  });

  it("uses a reaction as the complete reply when say is empty", () => {
    expect(contractFixtureResponse(request("say ; react heart"))).toEqual({
      toolCalls: [
        {
          input: { operation: "add", type: "heart" },
          name: "react_to_message",
        },
      ],
    });
  });

  it("emits HTTPS image attachments without base64 text", () => {
    expect(
      contractFixtureResponse(request("attach https://example.test/a.png"))
    ).toEqual({
      toolCalls: [
        {
          input: {
            attachments: [{ kind: "image", url: "https://example.test/a.png" }],
            kind: "message",
          },
          name: "send_message",
        },
      ],
    });
  });

  it("can assert that a tool is absent from the model surface", () => {
    const unavailable = request("inspect square__CreateCustomer");
    expect(contractFixtureResponse(unavailable)).toEqual({
      toolCalls: [
        {
          input: {
            kind: "message",
            text: "absent:square__CreateCustomer",
          },
          name: "send_message",
        },
      ],
    });
  });

  it("delivers a tool result once, then emits only the marker", () => {
    expect(
      contractFixtureResponse(
        request("call square__ListCustomers {}", [
          {
            id: "tool-1",
            isError: false,
            name: "square__ListCustomers",
            output: { customers: [{ given_name: "Ada" }] },
          },
        ])
      )
    ).toEqual({
      toolCalls: [
        {
          input: {
            kind: "message",
            text: '{"customers":[{"given_name":"Ada"}]}',
          },
          name: "send_message",
        },
      ],
    });
    expect(
      contractFixtureResponse(
        request("call square__ListCustomers {}", [
          {
            id: "tool-1",
            isError: false,
            name: "square__ListCustomers",
            output: { customers: [] },
          },
          {
            id: "tool-2",
            isError: false,
            name: "send_message",
            output: { kind: "message", text: "done" },
          },
        ])
      )
    ).toBe("DELIVERY_COMPLETE");
  });
});

function request(
  lastUserMessage: string,
  toolResults: {
    id: string;
    isError: boolean;
    name: string;
    output: unknown;
  }[] = [],
  toolNames: string[] = []
) {
  return {
    lastUserMessage,
    messages: [],
    toolResults,
    tools: toolNames.map((name) => ({ name })),
    userMessageCount: 1,
    userMessages: [lastUserMessage],
  };
}
