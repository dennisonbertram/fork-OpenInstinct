import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { SignupButton } from "@/components/landing/signup-button";

export const metadata: Metadata = {
  title: "Pricing — Jory",
  description: "Jory is free to use for your whole team.",
};

const INCLUDED = [
  "Unlimited employees",
  "Text-based training over iMessage",
  "Cited procedure Q&A",
  "Signed proof of training",
  "Manager follow-up loops",
  "Full audit trail",
] as const;

export default function PricingPage() {
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
          Free to use
        </h1>
        <p
          style={{
            fontSize: 20,
            color: "rgba(13,26,47,0.7)",
            letterSpacing: "-0.03em",
            lineHeight: 1.4,
            margin: "16px auto 0",
            maxWidth: 480,
          }}
        >
          Jory is free for your business — however many people you onboard this
          year.
        </p>
      </section>

      {/* Single free card */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 80px",
        }}
      >
        {/* Single card — deliberately not .pricing-tier-grid, whose responsive
            overrides assume multiple tiers and would pin one card left. */}
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div
            className="pricing-tier-card"
            style={{
              background: "#EBE5F6",
              borderRadius: 22,
              boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
              padding: "36px 32px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "rgba(13,26,47,0.5)",
                marginBottom: 12,
              }}
            >
              Everything
            </div>

            <div
              className="pricing-price-row"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#3E2EC0",
                  lineHeight: 1,
                }}
              >
                $0
              </span>
              <span
                style={{
                  fontSize: 16,
                  color: "rgba(13,26,47,0.5)",
                  letterSpacing: "-0.02em",
                }}
              >
                free to use
              </span>
            </div>

            <p
              style={{
                fontSize: 16,
                color: "rgba(13,26,47,0.6)",
                letterSpacing: "-0.03em",
                lineHeight: 1.4,
                margin: "8px 0 28px",
              }}
            >
              Teach Jory your standards, train your team by text, and see signed
              proof — at no cost.
            </p>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0 0 32px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                flex: 1,
              }}
            >
              {INCLUDED.map((f) => (
                <li
                  key={f}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 16,
                    color: "#0D1A2F",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3E2EC0"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <SignupButton
              style={{
                background: "#3E2EC0",
                color: "#fff",
                border: 0,
                borderRadius: 14,
                padding: "16px 20px",
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontFamily: "inherit",
                width: "100%",
                height: 56,
                boxSizing: "border-box",
              }}
            >
              <svg
                width="18"
                height="18"
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
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 15,
            color: "rgba(13,26,47,0.5)",
            letterSpacing: "-0.02em",
            marginTop: 24,
          }}
        >
          Free to use under our{" "}
          <Link href="/terms" style={{ textDecoration: "underline" }}>
            Terms of Service
          </Link>
          .
        </p>
      </section>

      <Footer />
    </main>
  );
}
