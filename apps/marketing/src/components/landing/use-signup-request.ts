"use client";

import { useCallback, useState } from "react";

export type SignupRequestState = "form" | "submitting" | "sent";

export type UseSignupRequest = {
  state: SignupRequestState;
  email: string;
  setEmail: (value: string) => void;
  error: string | undefined;
  submit: () => Promise<void>;
};

export function useSignupRequest(
  postRequest: (email: string) => Promise<void> = defaultPostRequest
): UseSignupRequest {
  const [state, setState] = useState<SignupRequestState>("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = useCallback(async () => {
    setError(undefined);
    setState("submitting");
    try {
      await postRequest(email.trim());
      setState("sent");
    } catch {
      setError("We couldn't save that email. Please try again.");
      setState("form");
    }
  }, [email, postRequest]);

  return { state, email, setEmail, error, submit };
}

async function defaultPostRequest(email: string): Promise<void> {
  const res = await fetch("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error("signup_failed");
  }
}
