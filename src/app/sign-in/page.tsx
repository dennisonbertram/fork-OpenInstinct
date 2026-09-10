import Image from "next/image";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignInHero, signInSubhead } from "@/app/sign-in/_components/hero";
import { Card } from "@/components/ui/card";
import { PhoneOtpAuthForm } from "@/app/sign-in/_components/otp-form";
import { env, localPhoneAuthBypassEnabled } from "@/env";
import { getAuthSession } from "@/auth/session";
import { readLinqOnboardingPhoneNumber } from "@/auth/linq";
import {
  isPhoneOtpProviderConfigured,
  phoneOtpProvider,
} from "@/auth/phone-otp-config";
import { requireRequestScope, UnauthenticatedError } from "@/lib/request-scope";
import mascot from "./_assets/jory-avatar-desk.webp";
import { UnavailableAccountNotice } from "./_components/unavailable-account-notice";

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const session = await getAuthSession(await headers());
  if (session) {
    let accountUnavailable = false;
    try {
      await requireRequestScope();
    } catch (error) {
      if (!(error instanceof UnauthenticatedError)) throw error;
      accountUnavailable = true;
    }
    if (!accountUnavailable) redirect("/");
  }

  const callbackValue = (await searchParams).callbackUrl;
  const requestedCallback = Array.isArray(callbackValue)
    ? callbackValue[0]
    : callbackValue;
  const callbackUrl =
    requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : "/";
  const provider = phoneOtpProvider();
  const otpConfigured =
    !session && (localPhoneAuthBypassEnabled || isPhoneOtpProviderConfigured());
  const linqPhoneNumber =
    session ||
    localPhoneAuthBypassEnabled ||
    provider !== "linq" ||
    !env.LINQ_CONNECTOR
      ? undefined
      : (env.LINQ_PHONE_NUMBER ??
        (await readLinqOnboardingPhoneNumber(env.LINQ_CONNECTOR)));
  const subhead = session
    ? undefined
    : signInSubhead({
        localBypass: localPhoneAuthBypassEnabled,
        provider,
        configured: otpConfigured,
      });

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="grid w-full max-w-5xl items-end gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <Card className="w-full max-w-md gap-6 justify-self-center p-8 lg:justify-self-start">
          <SignInHero headline="Hey, Jory" subhead={subhead} />
          {session ? <UnavailableAccountNotice /> : null}
          {!session && !otpConfigured ? (
            <p className="type-supporting-body mt-6 text-muted-foreground">
              {provider === "sendblue"
                ? "Phone sign-in is not configured for this deployment. Set the SendBlue API credentials and from number."
                : "iMessage sign-in is not configured for this deployment. Attach a Linq connector through Vercel Connect."}
            </p>
          ) : !session ? (
            <PhoneOtpAuthForm
              callbackUrl={callbackUrl}
              localBypass={localPhoneAuthBypassEnabled}
              linqPhoneNumber={linqPhoneNumber}
              provider={provider}
            />
          ) : null}
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
