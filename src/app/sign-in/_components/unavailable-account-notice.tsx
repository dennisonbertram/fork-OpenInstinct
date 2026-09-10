"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/app/_lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function UnavailableAccountNotice() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("We could not sign you out. Please try again.");
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("We could not sign you out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Alert className="mt-6" variant="warning">
      <AlertTitle>Your account is unavailable</AlertTitle>
      <AlertDescription>
        This account cannot access a workspace right now. Sign out and try a
        different account.
        <Button
          className="mt-4"
          disabled={pending}
          onClick={() => {
            void signOut();
          }}
          type="button"
          variant="outline"
        >
          {pending ? "Signing out…" : "Sign out"}
        </Button>
        {error ? (
          <p className="type-supporting-body mt-3 text-destructive">{error}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
