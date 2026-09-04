export function signInSubhead({
  localBypass,
  linqConfigured,
}: {
  readonly localBypass: boolean;
  readonly linqConfigured: boolean;
}) {
  if (localBypass) return "Enter your phone number to request a sign-in code.";
  if (linqConfigured)
    return "Enter your phone number and we will text you a code.";
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
