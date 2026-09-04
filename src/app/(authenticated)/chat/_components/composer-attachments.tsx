import { PaperclipIcon, XIcon } from "lucide-react";
import {
  PromptInputButton,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";

export function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputTools className="min-w-0 flex-wrap">
      <PromptInputButton
        aria-label="Attach files"
        className="size-10 rounded-full"
        onClick={attachments.openFileDialog}
        title="Attach files"
      >
        <PaperclipIcon aria-hidden="true" className="size-4" />
      </PromptInputButton>
      {attachments.files.map((file) => (
        <PromptInputButton
          aria-label={`Remove ${file.filename ?? "attachment"}`}
          className="max-w-full rounded-full bg-muted/50 px-3"
          key={file.id}
          onClick={() => {
            attachments.remove(file.id);
          }}
          size="sm"
        >
          <span className="truncate type-caption">
            {file.filename ?? "Attachment"}
          </span>
          <XIcon aria-hidden="true" className="size-3 shrink-0" />
        </PromptInputButton>
      ))}
    </PromptInputTools>
  );
}
