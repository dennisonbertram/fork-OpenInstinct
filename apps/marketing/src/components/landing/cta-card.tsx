import React from "react";
import { SignupButton } from "./signup-button";

export function CtaCard() {
  return (
    <section
      className="landing-section landing-cta"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "0 48px",
      }}
    >
      <div
        className="landing-cta-panel"
        style={{
          background: "#EBE5F6",
          borderRadius: 22,
          height: 265,
          display: "grid",
          gridTemplateColumns: "391px 1fr 334px",
          alignItems: "center",
          padding: "0 40px",
          gap: 40,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* LEFT */}
        <div>
          <h2
            className="landing-cta-heading"
            style={{
              fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
              fontSize: 50,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: "56px",
              margin: 0,
            }}
          >
            <span style={{ color: "#0D1A2F" }}>No app.</span>
            <br />
            <span style={{ color: "#3E2EC0" }}>Just text.</span>
          </h2>
          <p
            className="landing-cta-copy"
            style={{
              fontSize: 21,
              color: "#0D1A2F",
              letterSpacing: "-0.03em",
              lineHeight: 1.31,
              margin: "16px 0 0",
            }}
          >
            Meet your team where they already are. <br />
            Right now, that means iMessage.
          </p>
        </div>

        {/* MIDDLE — phone mockup */}
        <div
          className="landing-cta-phone-wrap"
          style={{
            display: "flex",
            justifyContent: "center",
            alignSelf: "flex-end",
            height: "100%",
          }}
        >
          <div
            className="landing-cta-phone"
            style={{
              width: 369,
              background: "#fff",
              border: "9px solid #000",
              borderRadius: "40px 40px 0 0",
              padding: "22px 31px 0",
              marginTop: 12,
              height: 253,
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            {/* Phone header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#F5EFE9",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/jory-avatar_clay.webp"
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: "#0D1A2F",
                    lineHeight: 1.31,
                  }}
                >
                  Jory
                </div>
                <div
                  style={{
                    fontSize: 13,
                    letterSpacing: "-0.03em",
                    color: "#0D1A2F",
                    opacity: 0.5,
                    lineHeight: 1.31,
                  }}
                >
                  Online
                </div>
              </div>
            </div>

            {/* Chat bubbles */}
            <div
              style={{
                marginTop: 11,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  background: "#F3F1F0",
                  borderRadius: 16,
                  padding: "12px 14px",
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.22,
                  color: "#0D1A2F",
                  alignSelf: "flex-start",
                  maxWidth: 205,
                }}
              >
                Did Maya sign the phone policy?
              </div>
              <div
                style={{
                  background: "#DBD7FD",
                  borderRadius: 16,
                  padding: "14px",
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.22,
                  alignSelf: "flex-end",
                  maxWidth: 226,
                  marginRight: 0,
                }}
              >
                <span style={{ color: "#3D2AB6" }}>
                  Signed yesterday. Barista basics is 4/5 done.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div>
          <h3
            style={{
              fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1,
              color: "#0D1A2F",
              margin: 0,
            }}
          >
            Try it with your team
          </h3>
          <p
            className="landing-cta-side-copy"
            style={{
              fontSize: 21,
              color: "#0D1A2F",
              letterSpacing: "-0.03em",
              lineHeight: 1.31,
              margin: "16px 0 16px",
            }}
          >
            Leave your email and we'll let you know when it's your turn.
          </p>
          <SignupButton
            style={{
              background: "#01102B",
              color: "#fff",
              border: 0,
              borderRadius: 16,
              padding: "20px",
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
      </div>
    </section>
  );
}
