const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

export function WhyProblem() {
  return (
    <>
      {/* The problem */}
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
            The problem
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
            You already have training. It just isn&rsquo;t written down.
          </h2>
          <div style={{ color: "rgba(13,26,47,0.7)" }}>
            <p style={{ margin: "0 0 1.2em" }}>
              If you run a small business, the way it should run lives mostly in
              your head — and in the heads of your best people. New hires learn
              by shadowing whoever happens to be on shift. You explain the same
              things again and again. Standards drift a little with every
              retelling.
            </p>
            <p style={{ margin: "0 0 1.2em" }}>
              Maybe there is a handbook. It was written once, under pressure,
              and it has been out of date ever since. Nobody reads it, because
              reading it was never how anyone actually learned the job.
            </p>
            <p style={{ margin: "0 0 1.2em" }}>
              And when something goes wrong — a safety issue, a dispute, a
              customer complaint —{" "}
              <strong style={{ color: "#0D1A2F", fontWeight: 600 }}>
                &ldquo;we told them&rdquo; is not a record.
              </strong>{" "}
              You can&rsquo;t show who was trained on what.
            </p>
            <p style={{ margin: 0 }}>
              Large companies solve this with training departments and
              enterprise software. None of that was built for a twelve-person
              team. Jory is.
            </p>
          </div>
        </div>
      </section>

      {/* Pull quote */}
      <section
        className="landing-section"
        style={{ background: "#0D1A2F", padding: "72px 0" }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 48px" }}>
          <blockquote
            style={{
              margin: 0,
              fontFamily: HEADING_FONT,
              fontWeight: 700,
              fontSize: "clamp(28px, 4.5vw, 42px)",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "#fff",
            }}
          >
            The way your business runs shouldn&rsquo;t live in{" "}
            <span style={{ color: "#B3A6FF" }}>one person&rsquo;s head.</span>
          </blockquote>
        </div>
      </section>
    </>
  );
}
