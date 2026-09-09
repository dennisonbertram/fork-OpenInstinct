import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { SignupButton } from "@/components/landing/signup-button";

export const metadata: Metadata = {
  title: "How it works — Jory",
  description:
    "Three loops: Teach Jory the standard, train and get signed proof, then run explicit shift checks with manager rollups.",
};

const STEPS = [
  {
    number: "1",
    tint: "#F1EBF8",
    stroke: "#3D2AB6",
    title: "Teach — capture the standard",
    body: "Owner or manager records a 30-second video, voice note, or photo and sends it to Jory. Jory extracts the steps, adds a source, suggests a check or acknowledgment, and asks for approval.",
    example: "This is the right cortado ratio.",
    reply:
      'Drafted: "Cortado standard" with source video and a 2-question check. Publish?',
    icon: (
      <>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </>
    ),
  },
  {
    number: "2",
    tint: "#FDEBD2",
    stroke: "#D4A72C",
    title: "Train — employees complete and sign",
    body: "Employee gets the assigned pre-shift training, answers short checks when needed, and acknowledges the policy or standard. Jory records what management can see and explains that visibility to the employee.",
    example: "I watched the milk-on-ice video.",
    reply:
      "Great. Answer this check and I will mark the training complete for your manager.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  {
    number: "3",
    tint: "#E7F1E5",
    stroke: "#0A972F",
    title: "Run — checks, proof, and follow-up",
    body: "Manager asks Jory to run a shift standard check. Jory pings assigned employees, collects confirmations or photo proof, escalates exceptions, and sends one rollup. The owner sees the pattern across locations.",
    example: "Who has not signed the phone policy?",
    reply: "Maya signed yesterday. Two people are pending. Send a nudge?",
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
] as const;

export default function HowItWorksPage() {
  return (
    <main className="landing-page">
      <Nav />

      {/* Hero */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "64px 48px 48px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "#0D1A2F",
            margin: 0,
          }}
        >
          Teach. Train. Prove.
        </h1>
        <p
          style={{
            fontSize: 20,
            color: "rgba(13,26,47,0.7)",
            letterSpacing: "-0.03em",
            lineHeight: 1.4,
            margin: "16px auto 0",
            maxWidth: 520,
          }}
        >
          Three loops that turn cafe standards into training, signatures, and
          manager follow-up.
        </p>
      </section>

      {/* Steps */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="how-step-card"
            style={{
              background: "#fff",
              borderRadius: 22,
              border: "1px solid #F5F4F3",
              boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
              padding: "40px 48px",
              display: "grid",
              gridTemplateColumns: "80px 1fr 320px",
              gap: 40,
              alignItems: "center",
            }}
          >
            {/* Step number */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                background: step.tint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  color: step.stroke,
                  lineHeight: 1,
                }}
              >
                {step.number}
              </span>
            </div>

            {/* Content */}
            <div>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#0D1A2F",
                  margin: "0 0 12px",
                }}
              >
                {step.title}
              </h2>
              <p
                style={{
                  fontSize: 17,
                  color: "rgba(13,26,47,0.7)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.55,
                  margin: 0,
                  maxWidth: 520,
                }}
              >
                {step.body}
              </p>
            </div>

            {/* Chat preview */}
            <div
              className="how-step-chat"
              style={{
                background: "#F8F7F5",
                borderRadius: 16,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {step.example && (
                <div
                  style={{
                    background: "#F3F1F0",
                    borderRadius: 14,
                    padding: "12px 14px",
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.3,
                    color: "#0D1A2F",
                    alignSelf: "flex-start",
                  }}
                >
                  {step.example}
                </div>
              )}
              {step.reply && (
                <div
                  style={{
                    background: "#DBD7FD",
                    borderRadius: 14,
                    padding: "12px 14px",
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.3,
                    color: "#3D2AB6",
                    alignSelf: "flex-end",
                  }}
                >
                  {step.reply}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* CTA strip */}
      <section
        className="landing-section landing-cta"
        style={{ maxWidth: 1440, margin: "0 auto", padding: "0 48px 64px" }}
      >
        <div
          className="marketing-split-cta"
          style={{
            background: "#EBE5F6",
            borderRadius: 22,
            padding: "48px 56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 40,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                color: "#0D1A2F",
                margin: 0,
              }}
            >
              Try the training loop now.
            </h2>
            <p
              style={{
                fontSize: 18,
                color: "#0D1A2F",
                letterSpacing: "-0.03em",
                lineHeight: 1.4,
                margin: "12px 0 0",
              }}
            >
              Send one cafe standard. Watch Jory turn it into training your
              staff can complete.
            </p>
          </div>
          <SignupButton
            style={{
              background: "#01102B",
              color: "#fff",
              border: 0,
              borderRadius: 16,
              padding: "20px 28px",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              display: "inline-flex",
              gap: 10,
              alignItems: "center",
              cursor: "pointer",
              fontFamily: "inherit",
              height: 68,
              boxSizing: "border-box",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Get early access
          </SignupButton>
        </div>
      </section>

      <Footer />
    </main>
  );
}
