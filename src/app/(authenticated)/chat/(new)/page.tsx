import { NewChat } from "./_components/new-chat";

export default function NewChatPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="flex w-full max-w-3xl flex-col items-center gap-4">
        <NewChat />
      </div>
    </div>
  );
}
