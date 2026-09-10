import type { PhoneOtpProvider } from "@/auth/phone-otp-config";

export function signInSubhead({
  localBypass,
  provider: _provider,
  configured,
}: {
  readonly localBypass: boolean;
  readonly provider: PhoneOtpProvider;
  readonly configured: boolean;
}) {
  if (localBypass) return "Enter your phone number to request a sign-in code.";
  if (configured) return "Enter your phone number and we will text you a code.";
  return undefined;
}

export function SignInHero({
  headline,
  subhead,
}: {
  readonly headline: string;
  readonly subhead?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="type-hero">{headline}</h1>
      {subhead ? (
        <p className="type-supporting-body text-muted-foreground">{subhead}</p>
      ) : null}
    </div>
  );
}
