export function WhyNote() {
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
        <div
          style={{
            border: "1px solid #F0EDEA",
            borderRadius: 24,
            background: "#FDEBD2",
            padding: 40,
          }}
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
            A note from us
          </p>
          <p style={{ color: "#0D1A2F", fontSize: 18, margin: "0 0 1.2em" }}>
            Small business owners are some of the best trainers there are. They
            teach the job every day — they just never get a chance to write it
            down, and no tool ever made writing it down easier than saying it
            out loud.
          </p>
          <p style={{ color: "#0D1A2F", fontSize: 18, margin: 0 }}>
            So that&rsquo;s the whole idea behind Jory: documenting your
            training should be as easy as explaining it to one new hire — once.
            After that, it should teach itself, answer for itself, and prove
            itself.
          </p>
          <p style={{ fontWeight: 600, marginTop: 26, color: "#0D1A2F" }}>
            — The Jory team
          </p>
        </div>
      </div>
    </section>
  );
}
