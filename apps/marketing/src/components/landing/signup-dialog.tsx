"use client";

import { useEffect, useRef } from "react";
import { useSignupRequest } from "./use-signup-request";

type Props = {
  open: boolean;
  onClose: () => void;
  postRequest?: (email: string) => Promise<void>;
};

export function SignupDialog({ open, onClose, postRequest }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const signup = useSignupRequest(postRequest);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7, 27, 54, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-title"
        aria-describedby="signup-desc"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 20,
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          padding: 28,
          boxShadow: "0 24px 60px rgba(7, 27, 54, 0.25)",
          fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
          color: "#0D1A2F",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 0,
            background: "transparent",
            cursor: "pointer",
            color: "#5A6A82",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2
          id="signup-title"
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Get early access
        </h2>

        {signup.state === "sent" ? (
          <p
            id="signup-desc"
            style={{
              fontSize: 16,
              lineHeight: 1.45,
              color: "rgba(13,26,47,0.7)",
              margin: "8px 0 0",
            }}
          >
            You're on the list. We'll email you when Jory is ready.
          </p>
        ) : (
          <>
            <p
              id="signup-desc"
              style={{
                fontSize: 16,
                lineHeight: 1.45,
                color: "rgba(13,26,47,0.7)",
                margin: "8px 0 20px",
              }}
            >
              Jory is getting ready. Leave your email and we'll let you know
              when it's your turn.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void signup.submit();
              }}
            >
              <label htmlFor="signup-email" style={{ display: "none" }}>
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={signup.email}
                onChange={(e) => signup.setEmail(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid #E4E2E0",
                  fontSize: 16,
                  color: "#0D1A2F",
                  fontFamily: "inherit",
                }}
              />

              {signup.error ? (
                <p
                  style={{
                    color: "#B3261E",
                    fontSize: 14,
                    margin: "10px 0 0",
                  }}
                >
                  {signup.error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={signup.state === "submitting"}
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#01102B",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "14px 18px",
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  border: 0,
                  width: "100%",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {signup.state === "submitting"
                  ? "Sending…"
                  : "Get early access"}
              </button>
            </form>

            <p
              style={{
                fontSize: 13,
                color: "rgba(13,26,47,0.55)",
                margin: "16px 0 0",
                lineHeight: 1.45,
              }}
            >
              We'll only use your email for this — nothing else.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
