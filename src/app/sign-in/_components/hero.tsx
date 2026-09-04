import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

export function signInSubhead({
  localBypass,
  linqConfigured,
}: {
  readonly localBypass: boolean;
  readonly linqConfigured: boolean;
}) {
  if (localBypass) return "Enter your phone number to sign in.";
  if (linqConfigured)
    return "Enter your phone number and we will text you a code.";
  return undefined;
}

export function SignInHero({
  eyebrow,
  headline,
  subhead,
}: {
  readonly eyebrow: string;
  readonly headline: string;
  readonly subhead?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 type-eyebrow text-muted-foreground">
        <Logo />
        <span>{eyebrow}</span>
      </div>
      <h1 className="type-hero">{headline}</h1>
      {subhead ? (
        <p className="type-supporting-body text-muted-foreground">{subhead}</p>
      ) : null}
    </div>
  );
}

export function SignInBubbles() {
  return (
    <Card aria-hidden="true" className="w-full max-w-sm gap-2 p-4">
      <p className="type-supporting-body ml-auto max-w-[85%] rounded-bubble bg-bubble-user px-4 py-3">
        Can you check the Square inventory for low-stock items?
      </p>
      <p className="type-supporting-body mr-auto max-w-[85%] rounded-bubble bg-bubble-assistant px-4 py-3">
        On it. I will pull the catalog and flag anything under threshold.
      </p>
    </Card>
  );
}
