import React from "react";
import Link from "next/link";

export function WhyTeaser() {
  return (
    <section
      className="landing-section why-teaser"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "0 48px 48px",
      }}
    >
      <div
        style={{
          background: "#F1EBF8",
          border: "1px solid #F0EDEA",
          borderRadius: 22,
          padding: "40px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
        }}
      >
        <div>
          <p
            style={{
              color: "#3E2EC0",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              margin: "0 0 12px",
            }}
          >
            An inside look
          </p>
          <h2
            style={{
              fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#0D1A2F",
              margin: "0 0 12px",
              lineHeight: 1.1,
            }}
          >
            Why we&rsquo;re building Jory
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "rgba(13,26,47,0.7)",
              letterSpacing: "-0.01em",
              lineHeight: 1.5,
              margin: 0,
              maxWidth: 560,
            }}
          >
            Jory helps small and medium businesses document their training — and
            prove it happened.
          </p>
        </div>
        <Link
          href="/why"
          style={{
            flexShrink: 0,
            display: "inline-block",
            background: "#01102B",
            color: "#fff",
            borderRadius: 999,
            padding: "14px 24px",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Read the inside look
        </Link>
      </div>
    </section>
  );
}
