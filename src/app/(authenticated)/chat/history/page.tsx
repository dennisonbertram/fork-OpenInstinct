import { MessageSquareIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import {
  combineChatUsage,
  formatChatUsage,
} from "@/app/(authenticated)/chat/_lib/chat-usage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listChats } from "@/db/services/chats";
import { requireRequestScope } from "@/lib/request-scope";

export const dynamic = "force-dynamic";

export default async function AllChatsPage() {
  const scope = await requireRequestScope();
  const chats = await listChats(scope);
  const totalUsage = combineChatUsage(chats.map((chat) => chat.usage));
  const imessageSessionId = chats.find(
    (chat) => chat.channel === "channel:linq"
  )?.sessionId;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="type-page-title">All chats</h1>
          <p className="type-supporting-body mt-1 text-muted-foreground">
            Every conversation in this workspace · Usage{" "}
            {formatChatUsage(totalUsage)}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/chat" />} size="sm">
          <PlusIcon />
          New chat
        </Button>
      </header>

      <section aria-label="Chat history" className="grid min-w-0 gap-2">
        {chats.length === 0 ? (
          <Alert>
            <MessageSquareIcon />
            <AlertDescription>No chats yet.</AlertDescription>
          </Alert>
        ) : (
          chats.map((chat) => (
            <Button
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] sm:flex"
              key={chat.sessionId}
              nativeButton={false}
              render={
                <Link href={`/chat/${encodeURIComponent(chat.sessionId)}`} />
              }
              variant="surface"
            >
              <MessageSquareIcon
                className={
                  chat.sessionId === imessageSessionId
                    ? "size-4 shrink-0 text-information"
                    : "size-4 shrink-0 text-muted-foreground"
                }
              />
              <span className="min-w-0 flex-1 truncate">
                {chat.sessionId === imessageSessionId ? "iMessage" : chat.title}
              </span>
              <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground sm:shrink-0">
                {chat.sessionId === imessageSessionId ? (
                  <Badge variant="information">Main thread</Badge>
                ) : null}
                <span className="type-label">
                  {formatChatUsage(chat.usage)}
                </span>
                <time className="type-label" dateTime={chat.updatedAt}>
                  {formatChatDate(chat.updatedAt)}
                </time>
              </span>
            </Button>
          ))
        )}
      </section>
    </div>
  );
}

function formatChatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
