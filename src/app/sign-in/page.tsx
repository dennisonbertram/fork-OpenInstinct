import Image from "next/image";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SignInBubbles, SignInHero } from "@/app/sign-in/_components/hero";
import { LocalPhoneAuthForm } from "@/app/sign-in/_components/local-form";
import { PhoneOtpAuthForm } from "@/app/sign-in/_components/otp-form";
import { env, localPhoneAuthBypassEnabled } from "@/env";
import { getAuthSession } from "@/auth/session";
import { readLinqOnboardingPhoneNumber } from "@/auth/linq";
import mascot from "../../../public/brand/jory-avatar-desk.webp";

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
  const subhead = localPhoneAuthBypassEnabled
    ? "Enter your phone number to sign in."
    : linqConfigured
      ? "Enter your phone number and we will text you a code."
      : undefined;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="grid w-full max-w-5xl items-end gap-10 md:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <section className="w-full max-w-md justify-self-center rounded-xl bg-card p-8 shadow-card md:justify-self-start">
          <SignInHero
            eyebrow="OpenInstinct"
            headline="Sign in."
            subhead={subhead}
          />
          {!localPhoneAuthBypassEnabled && !linqConfigured ? (
            <p className="type-supporting-body mt-6 text-muted-foreground">
              iMessage sign-in is not configured for this deployment. Attach a
              Linq connector through Vercel Connect.
            </p>
          ) : localPhoneAuthBypassEnabled ? (
            <LocalPhoneAuthForm callbackUrl={callbackUrl} />
          ) : (
            <PhoneOtpAuthForm
              callbackUrl={callbackUrl}
              linqPhoneNumber={linqPhoneNumber}
            />
          )}
        </section>
        <div className="order-first flex flex-col items-center gap-6 md:order-0 md:items-start">
          <div className="hidden md:block">
            <SignInBubbles />
          </div>
          <Image
            alt="Jory, the OpenInstinct assistant, at a desk"
            className="h-auto w-60 md:w-[26rem]"
            priority
            src={mascot}
          />
        </div>
      </div>
    </main>
  );
}
