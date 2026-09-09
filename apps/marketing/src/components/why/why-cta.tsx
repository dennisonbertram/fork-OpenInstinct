import Link from "next/link";
import { SignupButton } from "@/components/landing/signup-button";

const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

export function WhyCta() {
  return (
    <section
      className="landing-section why-section"
      style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 48px" }}
    >
      <div
        style={{
          background: "#3E2EC0",
          borderRadius: 28,
          padding: "56px 40px",
          textAlign: "center",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <h2
          style={{
            fontFamily: HEADING_FONT,
            fontWeight: 700,
            fontSize: "clamp(28px, 4vw, 38px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#fff",
            margin: 0,
          }}
        >
          See how Jory works
        </h2>
        <p style={{ color: "rgba(255,255,255,0.8)", maxWidth: 480, margin: 0 }}>
          Explain one standard to Jory and watch it become training your whole
          team can finish by text.
        </p>
        <div
          className="why-cta-actions"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            href="/how-it-works"
            style={{
              display: "inline-block",
              borderRadius: 999,
              padding: "14px 28px",
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "-0.01em",
              background: "#fff",
              color: "#3E2EC0",
              textDecoration: "none",
            }}
          >
            How it works
          </Link>
          <SignupButton
            style={{
              display: "inline-block",
              borderRadius: 999,
              padding: "14px 28px",
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "-0.01em",
              border: "1px solid rgba(255,255,255,0.4)",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Get early access
          </SignupButton>
        </div>
      </div>
    </section>
  );
}
