import React from "react";
import Link from "next/link";
import { SignupButton } from "./signup-button";

const FEATURES = [
  {
    tint: "#F1EBF8",
    stroke: "#3D2AB6",
    title: "Onboard without bottlenecks",
    body: "One explanation becomes training every hire finishes by text.",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 11h-6M19 8v6" />
      </>
    ),
  },
  {
    tint: "#FDEBD2",
    stroke: "#FDAD0E",
    title: "Know who is ready",
    body: "See signed proof of training before anyone is put on shift.",
    icon: (
      <>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </>
    ),
  },
  {
    tint: "#FFE4D7",
    stroke: "#FD4612",
    title: "Fix repeat mistakes",
    body: "Catch standards that are slipping before they cost you again.",
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    tint: "#E7F1E5",
    stroke: "#0A972F",
    title: "Keep every location aligned",
    body: "Give managers the same checklist, proof, and follow-up loop.",
    icon: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
] as const;

export function Hero() {
  return (
    <section
      className="landing-section"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "0 48px",
        position: "relative",
      }}
    >
      {/* Wordmark stage */}
      <div
        className="landing-wordmark-stage"
        style={{
          position: "relative",
          width: "100%",
          height: "auto",
          zIndex: 1,
        }}
      >
        <img
          src="/assets/jory-wordmark.svg"
          alt="JORY"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            position: "relative",
            zIndex: 1,
          }}
        />
        <img
          className="landing-hero-character"
          src="/assets/jory-avatar_desk_clay.webp"
          alt="Jory, the AI manager character"
          style={{
            position: "absolute",
            right: "0%",
            bottom: "-86%",
            width: "min(42vw, 680px)",
            height: "auto",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 3,
          }}
        />
      </div>

      {/* Below wordmark: headline and CTA */}
      <div
        className="landing-hero-grid"
        style={{
          position: "relative",
          zIndex: 2,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          marginTop: 20,
          alignItems: "start",
        }}
      >
        {/* Headline + CTAs */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            maxWidth: 760,
          }}
        >
          <h1
            className="landing-hero-title"
            style={{
              fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 58,
              lineHeight: "56px",
              letterSpacing: "-0.02em",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <span style={{ color: "#0D1A2F", whiteSpace: "nowrap" }}>
              Train your staff once.
            </span>
            <span style={{ color: "#3E2EC0", whiteSpace: "nowrap" }}>
              Prove it every shift.
            </span>
          </h1>

          <p
            className="landing-hero-copy"
            style={{
              fontSize: 18,
              lineHeight: 1.31,
              letterSpacing: "-0.03em",
              color: "rgba(13,26,47,0.7)",
              margin: 0,
              maxWidth: 418,
            }}
          >
            Teach Jory how your business should run. It turns your standards
            into text-based training, quick checks, signed proof, and manager
            follow-up.
          </p>

          <div
            className="landing-hero-actions"
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              marginTop: 0,
            }}
          >
            <SignupButton
              style={{
                background: "#01102B",
                color: "#fff",
                border: 0,
                borderRadius: 16,
                padding: "16px 20px",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.31,
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                height: 56,
                boxSizing: "border-box",
              }}
            >
              <svg
                width="20"
                height="20"
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

            <Link
              href="/how-it-works"
              style={{
                background: "#fff",
                color: "#0D1A2F",
                border: "1px solid #E4E2E0",
                boxShadow: "0px 4px 15px 0px rgba(3,17,40,0.06)",
                borderRadius: 16,
                padding: "16px 20px",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.31,
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                height: 56,
                boxSizing: "border-box",
                textDecoration: "none",
              }}
            >
              <svg
                width="16"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              See how it works
            </Link>
          </div>
        </div>
      </div>

      <section
        className="landing-hero-benefits-section"
        style={{
          marginTop: 56,
          paddingBottom: 72,
        }}
      >
        <div
          className="landing-hero-feature-list"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 16,
            width: "100%",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="landing-hero-feature-item"
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                background: "rgba(255,255,255,0.58)",
                border: "1px solid rgba(13,26,47,0.08)",
                borderRadius: 20,
                padding: 16,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: f.tint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={f.stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {f.icon}
                </svg>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: "#0D1A2F",
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: "rgba(13,26,47,0.7)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.31,
                    marginTop: 3,
                  }}
                >
                  {f.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
