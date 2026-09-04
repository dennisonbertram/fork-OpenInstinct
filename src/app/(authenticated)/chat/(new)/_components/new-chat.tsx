"use client";

import { useEveAgent } from "eve/react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import {
  ArrowUpIcon,
  CompassIcon,
  LightbulbIcon,
  ListChecksIcon,
} from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { ComposerAttachments } from "../../_components/composer-attachments";
import { chatTitle, messageContent } from "../../_lib/message-input";
import { api } from "@/trpc/client";

const starters = [
  {
    label: "Explore",
    icon: CompassIcon,
    prompt: "Help me research a topic and compare the best options.",
  },
  {
    label: "Make a plan",
    icon: ListChecksIcon,
    prompt: "Help me plan my day and decide what to tackle first.",
  },
  {
    label: "Think it through",
    icon: LightbulbIcon,
    prompt: "Help me turn an idea into a clear, actionable plan.",
  },
];

function StarterPrompts({ focusInput }: { readonly focusInput: () => void }) {
  const { textInput } = usePromptInputController();
  return (
    <div
      aria-label="Conversation starters"
      className="flex w-full flex-wrap justify-center gap-2"
    >
      {starters.map(({ label, icon: Icon, prompt }) => (
        <Button
          className="h-10 gap-2 rounded-full px-4"
          key={label}
          onClick={() => {
            textInput.setInput(prompt);
            focusInput();
          }}
          type="button"
          variant="outline"
        >
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-information"
          />
          <span className="type-label">{label}</span>
        </Button>
      ))}
    </div>
  );
}

export function NewChat() {
  const router = useRouter();
  const { mutateAsync: saveChat } = api.chats.save.useMutation();
  const pendingTitle = useRef<string | undefined>(undefined);
  const isSubmitting = useRef(false);
  const navigationStarted = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const agent = useEveAgent({
    onSessionChange(session) {
      if (session === undefined || navigationStarted.current) return;
      navigationStarted.current = true;
      const path = `/chat/${encodeURIComponent(session.sessionId)}`;
      void saveChat({
        sessionId: session.sessionId,
        title: pendingTitle.current,
      })
        .catch(() => undefined)
        .then(() => {
          router.replace(path);
          return undefined;
        });
      pendingTitle.current = undefined;
    },
  });

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (
      (text.length === 0 && message.files.length === 0) ||
      isSubmitting.current
    ) {
      return;
    }
    isSubmitting.current = true;
    pendingTitle.current = chatTitle(message);
    try {
      await agent.send(messageContent(message));
    } finally {
      isSubmitting.current = false;
    }
  };

  return (
    <PromptInputProvider>
      <div className="mb-4 space-y-3 text-center">
        <p className="type-label text-information">Jory</p>
        <h1 className="type-page-title">What’s on your mind?</h1>
        <p className="type-supporting-body text-muted-foreground">
          Bring a question, a task, or the start of an idea. We’ll take it from
          there.
        </p>
      </div>
      <PromptInput
        className="[&>[data-slot=input-group]]:rounded-3xl [&>[data-slot=input-group]]:bg-card [&>[data-slot=input-group]]:shadow-card"
        multiple
        onSubmit={handleSubmit}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message Jory"
            className="min-h-24 px-5 pt-5 pb-2"
            placeholder="Send a message…"
            ref={textarea}
          />
        </PromptInputBody>
        <PromptInputFooter className="items-end px-3 pb-3">
          <ComposerAttachments />
          <PromptInputSubmit className="size-10 shrink-0 rounded-full">
            <ArrowUpIcon aria-hidden="true" className="size-4" />
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
      <StarterPrompts focusInput={() => textarea.current?.focus()} />
    </PromptInputProvider>
  );
}
