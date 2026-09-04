import { ChatSession } from "./_components/chat-session";
import { readChat } from "@/db/services/chats";
import { requireRequestScope } from "@/lib/request-scope";
import { isFeatureEnabled } from "@/env";

export default async function ChatSessionPage({
  params,
}: PageProps<"/chat/[sessionId]">) {
  const { sessionId } = await params;
  const scope = await requireRequestScope();
  const chat = await readChat(scope, sessionId);
  return (
    <ChatSession
      developerActivityEnabled={isFeatureEnabled("developerActivity")}
      initialUsage={chat?.usage}
      key={sessionId}
      sessionId={sessionId}
    />
  );
}
