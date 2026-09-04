import { useEffect, useMemo, useRef } from "react";
import { ArrowUpIcon } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { messageContent } from "../../../_lib/message-input";
import { hasPendingBackgroundWorker } from "../../_lib/trace-view";
import { api } from "@/trpc/client";
import type { ChatAgent } from "../chat-agent";

import { ComposerAttachments } from "../../../_components/composer-attachments";

export function ChatInput({
  agent,
  sessionId,
}: {
  readonly agent: Pick<
    ChatAgent,
    "cancel" | "data" | "events" | "resume" | "send" | "status"
  >;
  readonly sessionId?: string;
}) {
  const { mutate: saveChat } = api.chats.save.useMutation();
  const backgroundCatchUp = useRef<Promise<void> | undefined>(undefined);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isRestoring =
    agent.status === "resuming" && agent.data.messages.length === 0;
  const hasPendingWorker = useMemo(
    () => hasPendingBackgroundWorker(agent.events),
    [agent.events]
  );

  useEffect(() => {
    if (sessionId === undefined || !hasPendingWorker) return undefined;

    const interval = window.setInterval(() => {
      if (agent.status !== "ready" || backgroundCatchUp.current !== undefined) {
        return;
      }

      const catchUp = agent.resume().catch(() => undefined);
      backgroundCatchUp.current = catchUp;
      void catchUp.finally(() => {
        if (backgroundCatchUp.current === catchUp) {
          backgroundCatchUp.current = undefined;
        }
      });
    }, 750);

    return () => {
      window.clearInterval(interval);
    };
  }, [agent, hasPendingWorker, sessionId]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (
      (text.length === 0 && message.files.length === 0) ||
      agent.status === "submitted" ||
      isRestoring
    ) {
      return;
    }

    const catchUp = backgroundCatchUp.current;
    if (catchUp !== undefined) {
      await Promise.all([agent.cancel().catch(() => undefined), catchUp]);
    }

    if (sessionId !== undefined) saveChat({ sessionId });
    await agent.send(
      messageContent(message),
      isBusy || catchUp !== undefined ? { turnPolicy: "steer" } : undefined
    );
  };

  return (
    <div className="z-20 mx-auto w-full max-w-3xl shrink-0 bg-background px-4 pt-4 pb-6 sm:px-6">
      <PromptInput
        className="[&>[data-slot=input-group]]:rounded-3xl [&>[data-slot=input-group]]:bg-card [&>[data-slot=input-group]]:shadow-card"
        multiple
        onSubmit={handleSubmit}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message Jory"
            className="min-h-20 px-5 pt-5 pb-2"
            disabled={agent.status === "submitted"}
            placeholder="Send a message…"
          />
        </PromptInputBody>
        <PromptInputFooter className="items-end px-3 pb-3">
          <ComposerAttachments />
          <PromptInputSubmit
            className="size-10 shrink-0 rounded-full"
            disabled={isRestoring}
            onStop={() => void agent.cancel()}
            status={isBusy ? agent.status : undefined}
          >
            {isBusy ? undefined : (
              <ArrowUpIcon aria-hidden="true" className="size-4" />
            )}
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
