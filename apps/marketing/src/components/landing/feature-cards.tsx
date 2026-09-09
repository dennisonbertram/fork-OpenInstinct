import React from "react";

const CARDS = [
  {
    msg: "New rule: restock pastries before the 8am rush.",
    reply: "Saved — training draft ready.",
    iconTint: "#F1EBF8",
    iconStroke: "#3D2AB6",
    icon: (
      <>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </>
    ),
    title: "Capture the standard",
    body: "Teach once by text, voice, or video. Jory saves the approved way.",
    image: "/assets/jory-character-capture_clay.webp",
  },
  {
    msg: "Just finished the opening checklist lesson.",
    reply: "Good job! You're confirmed to work!",
    iconTint: "#FDEBD2",
    iconStroke: "#D4A72C",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
    title: "Train the next hire",
    body: "New people learn the same standard without pulling a manager away.",
    image: "/assets/jory-character-pointing_clay.webp",
  },
  {
    msg: "Who still needs follow-up?",
    reply: "Maya and Sam — phone policy still unsigned.",
    iconTint: "#E7F1E5",
    iconStroke: "#0A972F",
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    title: "Spot the gaps",
    body: "See unsigned policies, missed checks, and standards that need coaching.",
    image: "/assets/jory-character-gaps_clay.webp",
  },
] as const;

export function FeatureCards() {
  return (
    <section
      className="landing-section landing-feature-cards"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "72px 48px 64px",
        textAlign: "center",
      }}
    >
      <h2
        className="landing-feature-heading"
        style={{
          fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
          fontSize: 47,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          lineHeight: 1,
          margin: 0,
          color: "#0D1A2F",
        }}
      >
        Train once.
        <br />
        Educate every shift.
      </h2>
      <p
        className="landing-feature-subcopy"
        style={{
          fontSize: 18,
          color: "rgba(13,26,47,0.7)",
          letterSpacing: "-0.03em",
          lineHeight: 1.31,
          margin: "7px 0 40px",
        }}
      >
        Give every shift the same playbook. Jory helps new hires learn faster,
        managers follow up sooner, and owners keep standards from slipping
        <br /> when the day gets busy.
      </p>

      <div
        className="landing-feature-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          textAlign: "left",
        }}
      >
        {CARDS.map((card) => (
          <div
            key={card.title}
            style={{
              background: "#fff",
              borderRadius: 22,
              border: "1px solid #F5F4F3",
              boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
              padding: "24px 0",
              overflow: "hidden",
            }}
          >
            {/* Preview area */}
            <div
              className="landing-feature-preview"
              style={{
                position: "relative",
                height: 270,
                border: "1px solid #E4E2E0",
                borderLeft: "none",
                borderRight: "none",
                overflow: "hidden",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr)",
                columnGap: 0,
                alignItems: "center",
                paddingLeft: 24,
                paddingRight: 0,
              }}
            >
              {/* Chat col: bubbles flow like a thread -- incoming left with a
                  tail, reply stepped toward Jory -- and keep a lane clear of
                  the character pinned at the right edge. */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  width: "100%",
                  paddingRight: 150,
                  boxSizing: "border-box",
                  flexShrink: 0,
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    background: "#F3F1F0",
                    borderRadius: 16,
                    borderBottomLeftRadius: 5,
                    padding: "10px 14px",
                    fontSize: 16,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.22,
                    color: "#0D1A2F",
                    alignSelf: "flex-start",
                    maxWidth: "min(100%, 280px)",
                  }}
                >
                  {card.msg}
                </div>
                <div
                  style={{
                    background: "#DBD7FD",
                    borderRadius: 16,
                    borderBottomRightRadius: 5,
                    padding: "10px 14px",
                    fontSize: 16,
                    fontWeight: 500,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.22,
                    color: "#3D2AB6",
                    alignSelf: "flex-end",
                    maxWidth: "min(85%, 280px)",
                    marginTop: -2,
                  }}
                >
                  {card.reply}
                </div>
                <div
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 17,
                    background: card.iconTint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 24,
                  }}
                >
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={card.iconStroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {card.icon}
                  </svg>
                </div>
              </div>

              {/* Character image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="landing-feature-character"
                src={card.image}
                alt=""
                aria-hidden="true"
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width: 260,
                  height: 270,
                  objectFit: "cover",
                  objectPosition: "top center",
                  pointerEvents: "none",
                  userSelect: "none",
                  zIndex: 0,
                }}
              />
            </div>

            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "#0D1A2F",
                margin: "24px 24px 6px",
              }}
            >
              {card.title}
            </h3>
            <p
              style={{
                fontSize: 16,
                color: "rgba(13,26,47,0.7)",
                letterSpacing: "-0.03em",
                lineHeight: 1.31,
                margin: "0 24px",
              }}
            >
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
