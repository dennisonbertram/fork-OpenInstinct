const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

export function WhyProof() {
  return (
    <section
      className="landing-section"
      style={{
        background: "#FAF9F7",
        borderTop: "1px solid #F0EDEA",
        borderBottom: "1px solid #F0EDEA",
      }}
    >
      <div
        className="why-section"
        style={{ maxWidth: 720, margin: "0 auto", padding: "56px 48px" }}
      >
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
          The part nobody else treats as the product
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
          Proof, not paperwork
        </h2>
        <div style={{ color: "rgba(13,26,47,0.7)" }}>
          <p style={{ margin: "0 0 1.2em" }}>
            Most training tools stop when the lesson is delivered. For a small
            business, that is exactly where the hard part starts: showing that
            the training happened.
          </p>
          <p style={{ margin: "0 0 1.2em" }}>
            In Jory, the sign-off is built into the training itself. When an
            employee finishes a lesson, they acknowledge it — and that
            acknowledgment, with what they were trained on and when, goes into
            your record automatically.
          </p>
          <p style={{ margin: 0 }}>
            So when you need to answer &ldquo;was this person trained on
            that?&rdquo; — for an inspection, an insurer, a dispute, or your own
            peace of mind — you have an answer you can show, not a story you
            have to tell.
          </p>
        </div>
      </div>
    </section>
  );
}
