const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

export function WhyHero() {
  return (
    <>
      {/* Hero */}
      <section
        className="landing-section"
        style={{ maxWidth: 1040, margin: "0 auto", padding: "64px 48px 0" }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#3E2EC0",
            background: "#F1EBF8",
            borderRadius: 999,
            padding: "6px 14px",
            marginBottom: 26,
          }}
        >
          An inside look
        </span>
        <h1
          style={{
            fontFamily: HEADING_FONT,
            fontWeight: 800,
            fontSize: "clamp(40px, 6.5vw, 62px)",
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: "#0D1A2F",
            margin: 0,
          }}
        >
          Why we&rsquo;re building{" "}
          <span style={{ color: "#3E2EC0" }}>Jory</span>
        </h1>
        <p
          style={{
            marginTop: 24,
            fontSize: 21,
            lineHeight: 1.5,
            color: "rgba(13,26,47,0.7)",
            maxWidth: 620,
          }}
        >
          Jory helps small and medium businesses document their training — and
          prove it happened. This page is the plain version of what we&rsquo;re
          building, why it matters, and where it goes.
        </p>
        <p style={{ marginTop: 18, fontSize: 14, color: "rgba(13,26,47,0.5)" }}>
          From the Jory team · August 2026
        </p>
      </section>

      <div
        className="landing-section"
        style={{ maxWidth: 1040, margin: "36px auto 0", padding: "0 48px" }}
      >
        <div
          className="why-hero-panel"
          style={{
            background: "#F1EBF8",
            border: "1px solid #F0EDEA",
            borderRadius: 24,
            padding: "36px 36px 0",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            className="why-hero-bubbles"
            style={{
              paddingBottom: 36,
              maxWidth: 420,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div
              style={{
                borderRadius: 16,
                padding: "12px 16px",
                fontSize: 15,
                lineHeight: 1.4,
                marginBottom: 10,
                maxWidth: 340,
                boxShadow: "0 5px 10px rgba(3,17,40,0.06)",
                background: "#0D1A2F",
                color: "#fff",
                borderBottomLeftRadius: 4,
              }}
            >
              New rule: restock pastries before the 8am rush.
            </div>
            <div
              style={{
                borderRadius: 16,
                padding: "12px 16px",
                fontSize: 15,
                lineHeight: 1.4,
                marginBottom: 0,
                maxWidth: 340,
                boxShadow: "0 5px 10px rgba(3,17,40,0.06)",
                background: "#fff",
                color: "#0D1A2F",
                borderBottomLeftRadius: 4,
              }}
            >
              Saved — training draft ready. Want me to add it to opening
              checklist onboarding?
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/jory-avatar_desk_clay.webp"
            alt="Jory, the AI manager character, at a desk"
            className="why-hero-character"
            style={{
              width: "min(38vw, 360px)",
              display: "block",
              position: "relative",
              zIndex: 1,
            }}
          />
          <div
            className="why-hero-desk"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              background: "#FAF7EF",
              height: "calc(min(38vw, 360px) * 0.1856)",
              zIndex: 0,
            }}
          />
        </div>
      </div>
    </>
  );
}
