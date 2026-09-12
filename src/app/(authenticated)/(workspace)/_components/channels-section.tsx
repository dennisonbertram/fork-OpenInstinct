import { MailIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ChannelsSection({
  browserReady,
  linqConfigured,
  linqPhoneNumber,
  sendblueConversationsEnabled,
  sendblueFromNumber,
}: {
  readonly browserReady: boolean;
  readonly linqConfigured: boolean;
  readonly linqPhoneNumber?: string;
  readonly sendblueConversationsEnabled: boolean;
  readonly sendblueFromNumber?: string;
}) {
  const iMessageLine =
    linqConfigured && linqPhoneNumber
      ? { number: linqPhoneNumber, provider: "Linq" }
      : sendblueConversationsEnabled && sendblueFromNumber
        ? { number: sendblueFromNumber, provider: "SendBlue" }
        : undefined;

  return (
    <section aria-labelledby="channels-heading" className="space-y-3">
      <h2 className="type-section-title" id="channels-heading">
        Channels
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {browserReady ? (
          <Button
            nativeButton={false}
            render={<Link href="/chat" />}
            variant="surface"
          >
            <MessageSquareIcon />
            WebChat
          </Button>
        ) : (
          <Button disabled variant="surface">
            <MessageSquareIcon />
            WebChat
          </Button>
        )}
        {iMessageLine ? (
          <Button
            nativeButton={false}
            render={
              <a
                aria-label={`Open ${iMessageLine.provider} iMessage`}
                href={`sms:${iMessageLine.number}`}
              />
            }
            variant="surface"
          >
            <MailIcon />
            iMessage
          </Button>
        ) : (
          <Button disabled variant="surface">
            <MailIcon />
            iMessage
          </Button>
        )}
      </div>
      <p className="type-caption text-muted-foreground">
        {channelAvailabilityMessage({
          browserReady,
          linqConfigured,
          iMessageLine,
          sendblueConversationsEnabled,
          sendblueFromNumber,
        })}
      </p>
    </section>
  );
}

function channelAvailabilityMessage({
  browserReady,
  linqConfigured,
  iMessageLine,
  sendblueConversationsEnabled,
  sendblueFromNumber,
}: {
  readonly browserReady: boolean;
  readonly linqConfigured: boolean;
  readonly iMessageLine?: {
    readonly number: string;
    readonly provider: string;
  };
  readonly sendblueConversationsEnabled: boolean;
  readonly sendblueFromNumber?: string;
}) {
  return [
    browserReady
      ? "WebChat is ready."
      : "KERNEL_API_KEY is required to enable WebChat.",
    iMessageLine
      ? `iMessage opens the ${iMessageLine.provider} line ${iMessageLine.number}.`
      : sendblueConversationsEnabled
        ? "SendBlue conversations are enabled, but the sending line is unavailable."
        : linqConfigured
          ? "Linq is connected. Use its assigned line to start an iMessage."
          : sendblueFromNumber
            ? "The SendBlue line is configured, but SendBlue conversations are disabled."
            : "Set up Linq or enable SendBlue conversations to enable iMessage.",
  ].join(" ");
}
