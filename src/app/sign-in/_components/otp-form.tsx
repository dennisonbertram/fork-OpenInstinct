"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangleIcon, MessageSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SubmitEvent } from "react";
import { authClient } from "@/app/_lib/auth-client";
import { formValue, verifyPhoneNumber } from "@/app/sign-in/_lib/phone-auth";
import { normalizeAuthPhoneNumber } from "@/auth/phone-number";
import type { PhoneOtpProvider } from "@/auth/phone-otp-config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneNumberField } from "./phone-field";

class UnconfirmedSubmissionError extends Error {
  readonly phoneNumber: string;

  constructor(phoneNumber: string) {
    super(
      "The SendBlue submission could not be confirmed. The request may have reached SendBlue. Enter the code if it arrives, or use a different number."
    );
    this.name = "UnconfirmedSubmissionError";
    this.phoneNumber = phoneNumber;
  }
}

function isUnconfirmedSubmissionError(
  error: unknown
): error is UnconfirmedSubmissionError {
  return error instanceof UnconfirmedSubmissionError;
}

export function PhoneOtpAuthForm({
  callbackUrl,
  linqPhoneNumber,
  localBypass = false,
  provider = "linq",
  sendblueFromNumber,
}: {
  readonly callbackUrl: string;
  readonly linqPhoneNumber?: string;
  readonly localBypass?: boolean;
  readonly provider?: PhoneOtpProvider;
  readonly sendblueFromNumber?: string;
}) {
  const sendOtp = useMutation({
    mutationFn: async (phoneNumberValue: string) => {
      const phoneNumber = normalizeAuthPhoneNumber(phoneNumberValue);
      if (!phoneNumber) throw new Error("Enter a valid phone number.");

      const result = await authClient.phoneNumber
        .sendOtp({ phoneNumber })
        .catch(() => {
          if (provider === "sendblue") {
            throw new UnconfirmedSubmissionError(phoneNumber);
          }
          throw new Error("Unable to send a code. Please try again.");
        });
      if (result.error) {
        if (
          provider === "sendblue" &&
          result.error.code === "SENDBLUE_SUBMISSION_UNCONFIRMED"
        ) {
          throw new UnconfirmedSubmissionError(phoneNumber);
        }
        throw new Error(phoneOtpErrorMessage(result.error));
      }
      return phoneNumber;
    },
  });

  const unconfirmedError =
    sendOtp.error && isUnconfirmedSubmissionError(sendOtp.error)
      ? sendOtp.error
      : undefined;
  const submittedPhone = sendOtp.data ?? unconfirmedError?.phoneNumber;
  const showCodeForm = sendOtp.isSuccess || unconfirmedError !== undefined;

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    sendOtp.mutate(formValue(event.currentTarget, "phone-number"));
  }

  return (
    <>
      {localBypass ? (
        <p className="type-supporting-body mt-6 text-muted-foreground">
          Local development does not send a text. Use code{" "}
          <span className="type-mono">000000</span> on the next step.
        </p>
      ) : provider === "sendblue" ? (
        <SendBlueSetupInfo fromNumber={sendblueFromNumber} />
      ) : (
        <FirstTimeLinqSetup phoneNumber={linqPhoneNumber} />
      )}
      {showCodeForm && submittedPhone ? (
        <VerificationCodeForm
          callbackUrl={callbackUrl}
          onUseDifferentNumber={sendOtp.reset}
          phoneNumber={submittedPhone}
          unconfirmed={unconfirmedError !== undefined}
        />
      ) : (
        <form
          className="mt-4"
          onSubmit={(event) => {
            submit(event);
          }}
        >
          <FieldGroup>
            <PhoneNumberField />
            <FieldError
              errors={
                sendOtp.error && !unconfirmedError ? [sendOtp.error] : undefined
              }
            />
            <Button
              className="w-full rounded-full"
              disabled={sendOtp.isPending}
              type="submit"
            >
              {sendOtp.isPending ? "Sending…" : "Send code"}
            </Button>
          </FieldGroup>
        </form>
      )}
    </>
  );
}

function VerificationCodeForm({
  callbackUrl,
  onUseDifferentNumber,
  phoneNumber,
  unconfirmed,
}: {
  readonly callbackUrl: string;
  readonly onUseDifferentNumber: () => void;
  readonly phoneNumber: string;
  readonly unconfirmed: boolean;
}) {
  const router = useRouter();
  const verifyCode = useMutation({
    mutationFn: async (code: string) => {
      if (!/^\d{6}$/.test(code)) {
        throw new Error("Enter the six-digit code.");
      }

      await verifyPhoneNumber({
        code,
        errorMessage:
          "That code could not be verified. Request a new code and try again.",
        phoneNumber,
      });
    },
    onSuccess: () => {
      router.replace(callbackUrl);
      router.refresh();
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    verifyCode.mutate(formValue(event.currentTarget, "code").trim());
  }

  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        submit(event);
      }}
    >
      {unconfirmed ? <SendBlueUnconfirmedWarning /> : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="code">Verification Code</FieldLabel>
          <Input
            autoComplete="one-time-code"
            id="code"
            inputMode="numeric"
            maxLength={6}
            name="code"
            pattern="[0-9]{6}"
            required
          />
        </Field>
        <FieldError
          errors={verifyCode.error ? [verifyCode.error] : undefined}
        />
        <Button
          className="w-full rounded-full"
          disabled={verifyCode.isPending}
          type="submit"
        >
          {verifyCode.isPending ? "Verifying…" : "Verify code"}
        </Button>
        <Button
          className="w-full"
          disabled={verifyCode.isPending}
          onClick={onUseDifferentNumber}
          type="button"
          variant="ghost"
        >
          Use a different number
        </Button>
      </FieldGroup>
    </form>
  );
}

function SendBlueSetupInfo({ fromNumber }: { readonly fromNumber?: string }) {
  return (
    <Alert className="mt-6" variant="information">
      <MessageSquareIcon />
      <AlertTitle>SendBlue sends your code</AlertTitle>
      <AlertDescription>
        <p>
          This preview sends codes from the registered SendBlue sending line
          {fromNumber ? ` ${fromNumber}` : ""} to eligible verified test
          contacts.
        </p>
      </AlertDescription>
    </Alert>
  );
}

function SendBlueUnconfirmedWarning() {
  return (
    <Alert className="mb-6" variant="warning">
      <AlertTriangleIcon />
      <AlertTitle>Code submission could not be confirmed</AlertTitle>
      <AlertDescription>
        The request may have reached SendBlue. Enter the six-digit code if it
        arrives, or use a different number.
      </AlertDescription>
    </Alert>
  );
}

function FirstTimeLinqSetup({
  phoneNumber,
}: {
  readonly phoneNumber?: string;
}) {
  return (
    <Alert className="mt-6" variant="information">
      <MessageSquareIcon />
      <AlertTitle>First time signing in?</AlertTitle>
      <AlertDescription>
        <p>
          Linq requires one message from your phone before it can send a sign-in
          code.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Open Messages to the Linq number.</li>
          <li>Send any message from the phone number you will enter below.</li>
          <li>Return here and select Send code.</li>
        </ol>
        {phoneNumber ? (
          <Button
            className="mt-3 w-full"
            nativeButton={false}
            render={
              <a
                aria-label="Text Linq in Messages"
                href={`sms:${phoneNumber}`}
              />
            }
            variant="outline"
          >
            Text Linq in Messages
          </Button>
        ) : (
          <p className="mt-2">
            Find the Linq number in Vercel Connect or the Linq dashboard, text
            it once, then return here.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function phoneOtpErrorMessage(error: {
  readonly code?: string;
  readonly message?: string;
}) {
  if (
    (error.code?.startsWith("LINQ_") || error.code?.startsWith("SENDBLUE_")) &&
    error.message
  ) {
    return error.message;
  }
  return "Unable to send a code. Please try again.";
}
