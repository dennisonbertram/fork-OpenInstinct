import type { useEveAgent } from "eve/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

type AgentOptions = Parameters<typeof useEveAgent>[0];

interface MockAgent {
  send: Mock<() => Promise<void>>;
}

interface Mocks {
  setInput: Mock<(value: string) => void>;
  starterClicks: (() => void)[];
  agent: MockAgent;
  options: AgentOptions | undefined;
  promptSubmit:
    | ((message: PromptInputMessage) => void | Promise<void>)
    | undefined;
  saveChat: Mock<
    (input: { sessionId: string; title: string | undefined }) => Promise<void>
  >;
  routerReplace: Mock<(href: string) => void>;
}

const mocks = vi.hoisted<Mocks>(() => ({
  setInput: vi.fn<(value: string) => void>(),
  starterClicks: [],
  agent: {
    send: vi.fn<() => Promise<void>>(),
  },
  options: undefined,
  promptSubmit: undefined,
  saveChat:
    vi.fn<
      (input: { sessionId: string; title: string | undefined }) => Promise<void>
    >(),
  routerReplace: vi.fn<(href: string) => void>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));

vi.mock("eve/react", () => ({
  useEveAgent: (options: AgentOptions) => {
    mocks.options = options;
    return mocks.agent;
  },
}));

vi.mock("@/trpc/client", () => ({
  api: {
    chats: { save: { useMutation: () => ({ mutateAsync: mocks.saveChat }) } },
  },
}));

vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInputProvider: ({ children }: { children: ReactNode }) => children,
  usePromptInputController: () => ({ textInput: { setInput: mocks.setInput } }),
  usePromptInputAttachments: () => ({
    files: [],
    openFileDialog: vi.fn<() => void>(),
  }),
  PromptInput: ({
    children,
    onSubmit,
  }: {
    children: ReactNode;
    onSubmit: (message: PromptInputMessage) => void | Promise<void>;
  }) => {
    mocks.promptSubmit = onSubmit;
    return <form>{children}</form>;
  },
  PromptInputBody: ({ children }: { children: ReactNode }) => children,
  PromptInputButton: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  PromptInputFooter: ({ children }: { children: ReactNode }) => children,
  PromptInputSubmit: () => <button type="submit">Send</button>,
  PromptInputTextarea: () => <textarea />,
  PromptInputTools: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => {
    mocks.starterClicks.push(onClick);
    return <button type="button">{children}</button>;
  },
}));

import { NewChat } from "./new-chat";

describe("new chat", () => {
  beforeEach(() => {
    mocks.setInput.mockReset();
    mocks.starterClicks = [];
    mocks.agent.send.mockReset().mockResolvedValue(undefined);
    mocks.options = undefined;
    mocks.promptSubmit = undefined;
    mocks.saveChat.mockReset().mockResolvedValue(undefined);
    mocks.routerReplace.mockReset();
  });

  it("puts starter prompts in the editable draft without sending a message", () => {
    renderToStaticMarkup(<NewChat />);
    expect(mocks.starterClicks).toHaveLength(3);
    for (const click of mocks.starterClicks) click();
    expect(mocks.setInput.mock.calls.map(([value]) => value)).toEqual([
      "Help me research a topic and compare the best options.",
      "Help me plan my day and decide what to tackle first.",
      "Help me turn an idea into a clear, actionable plan.",
    ]);
    expect(mocks.agent.send).not.toHaveBeenCalled();
    expect(mocks.saveChat).not.toHaveBeenCalled();
  });

  it("navigates the first prompt into its session route once", async () => {
    const emptyMarkup = renderToStaticMarkup(<NewChat />);
    expect(emptyMarkup).toContain("<form");

    await mocks.promptSubmit?.({ files: [], text: "Inspect my workspace" });
    expect(mocks.agent.send).toHaveBeenCalledWith("Inspect my workspace");

    mocks.options?.onSessionChange?.({
      sessionId: "session/one",
      streamIndex: 0,
    });
    expect(mocks.saveChat).toHaveBeenCalledWith({
      sessionId: "session/one",
      title: "Inspect my workspace",
    });
    await vi.waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/session%2Fone");
    });

    mocks.options?.onSessionChange?.({
      sessionId: "session/one",
      streamIndex: 1,
    });
    expect(mocks.saveChat).toHaveBeenCalledTimes(1);
    expect(mocks.routerReplace).toHaveBeenCalledTimes(1);
  });
});
