import Image from "next/image";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignInHero, signInSubhead } from "@/app/sign-in/_components/hero";
import { Card } from "@/components/ui/card";
import { PhoneOtpAuthForm } from "@/app/sign-in/_components/otp-form";
import { env, localPhoneAuthBypassEnabled } from "@/env";
import { getAuthSession } from "@/auth/session";
import { readLinqOnboardingPhoneNumber } from "@/auth/linq";
import mascot from "./_assets/jory-avatar-desk.webp";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  if (await getAuthSession(await headers())) redirect("/");

  const callbackValue = (await searchParams).callbackUrl;
  const requestedCallback = Array.isArray(callbackValue)
    ? callbackValue[0]
    : callbackValue;
  const callbackUrl =
    requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : "/";
  const linqConfigured = env.LINQ_CONNECTOR !== undefined;
  const linqPhoneNumber =
    localPhoneAuthBypassEnabled || !env.LINQ_CONNECTOR
      ? undefined
      : (env.LINQ_PHONE_NUMBER ??
        (await readLinqOnboardingPhoneNumber(env.LINQ_CONNECTOR)));
  const subhead = signInSubhead({
    localBypass: localPhoneAuthBypassEnabled,
    linqConfigured,
  });

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="grid w-full max-w-5xl items-end gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <Card className="w-full max-w-md gap-6 justify-self-center p-8 lg:justify-self-start">
          <SignInHero headline="Hey, Jory" subhead={subhead} />
          {!localPhoneAuthBypassEnabled && !linqConfigured ? (
            <p className="type-supporting-body mt-6 text-muted-foreground">
              iMessage sign-in is not configured for this deployment. Attach a
              Linq connector through Vercel Connect.
            </p>
          ) : (
            <PhoneOtpAuthForm
              callbackUrl={callbackUrl}
              localBypass={localPhoneAuthBypassEnabled}
              linqPhoneNumber={linqPhoneNumber}
            />
          )}
        </Card>
        <div className="order-first flex justify-center lg:order-0 lg:justify-start">
          <Image
            alt="Jory, the OpenInstinct assistant, at a desk"
            className="h-auto w-60 lg:w-[26rem]"
            preload
            src={mascot}
          />
        </div>
      </div>
    </main>
  );
}
