const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

const SYSTEM_CARDS = [
  {
    num: "1",
    tint: "#F1EBF8",
    color: "#3D2AB6",
    title: "Capture the standard",
    body: "Tell Jory how something should be done. Type it, say it, film a walkthrough, or hand over a document you already have.",
  },
  {
    num: "2",
    tint: "#FDEBD2",
    color: "#FDAD0E",
    title: "Get the manual",
    body: "Jory turns what you said into a training manual and onboarding materials, in your words. You review and approve before anyone sees it.",
  },
  {
    num: "3",
    tint: "#FFE4D7",
    color: "#FD4612",
    title: "Onboard by text",
    body: "New hires finish training on their phone, one lesson at a time, without pulling a manager away from the floor.",
  },
  {
    num: "4",
    tint: "#E7F1E5",
    color: "#0A972F",
    title: "Answer from your standards",
    body: "Any employee can ask Jory how the business is supposed to work, at any time. It answers from what you approved — nothing else.",
  },
] as const;

export function WhySystem() {
  return (
    <section
      className="landing-section why-section"
      style={{ maxWidth: 1040, margin: "0 auto", padding: "56px 48px" }}
    >
      <div style={{ maxWidth: 720 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(13,26,47,0.5)",
            margin: "0 0 14px",
          }}
        >
          How Jory works
        </p>
        <h2
          style={{
            fontFamily: HEADING_FONT,
            fontWeight: 700,
            fontSize: "clamp(28px, 4vw, 38px)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#0D1A2F",
            margin: "0 0 22px",
          }}
        >
          One system, five parts
        </h2>
        <p style={{ color: "rgba(13,26,47,0.7)", margin: 0 }}>
          Jory is not a folder of documents and a course builder bolted
          together. It is one loop: capture the standard, teach it, answer from
          it, and keep the record.
        </p>
      </div>

      <div
        className="why-system-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 18,
          marginTop: 34,
        }}
      >
        {SYSTEM_CARDS.map((card) => (
          <div
            key={card.num}
            style={{
              border: "1px solid #F0EDEA",
              borderRadius: 20,
              padding: 26,
              background: "#fff",
              boxShadow: "0 5px 10px rgba(3,17,40,0.06)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 10,
                fontFamily: HEADING_FONT,
                fontWeight: 700,
                fontSize: 16,
                marginBottom: 16,
                background: card.tint,
                color: card.color,
              }}
            >
              {card.num}
            </span>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 8,
                color: "#0D1A2F",
                letterSpacing: "-0.02em",
              }}
            >
              {card.title}
            </h3>
            <p style={{ margin: 0, fontSize: 16, color: "rgba(13,26,47,0.7)" }}>
              {card.body}
            </p>
          </div>
        ))}
        <div
          className="why-system-wide"
          style={{
            gridColumn: "1 / -1",
            border: "1px solid #F0EDEA",
            borderRadius: 20,
            background: "#fff",
            boxShadow: "0 5px 10px rgba(3,17,40,0.06)",
            display: "grid",
            gridTemplateColumns: "1fr 220px",
            gap: 24,
            alignItems: "end",
            overflow: "hidden",
            padding: "26px 0 0 26px",
          }}
        >
          <div style={{ paddingBottom: 26 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 10,
                fontFamily: HEADING_FONT,
                fontWeight: 700,
                fontSize: 16,
                marginBottom: 16,
                background: "#F1EBF8",
                color: "#3D2AB6",
              }}
            >
              5
            </span>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 8,
                color: "#0D1A2F",
                letterSpacing: "-0.02em",
              }}
            >
              Keep the record
            </h3>
            <p style={{ margin: 0, fontSize: 16, color: "rgba(13,26,47,0.7)" }}>
              Every completed lesson ends with a sign-off. Your dashboard shows
              who is trained, who isn&rsquo;t, and which standards need
              follow-up — a running audit trail you never have to maintain by
              hand.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/jory-character-gaps_clay.webp"
            alt="Jory character reviewing training gaps"
            style={{ display: "block", width: 220 }}
          />
        </div>
      </div>
    </section>
  );
}
