const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

const STATS = [
  {
    figure: "$14,700",
    caption:
      "what federal regulations cost firms with fewer than 50 employees, per employee, per year",
  },
  {
    figure: "$12,200",
    caption: "the same cost at firms with 100 or more employees",
  },
] as const;

export function WhyCosts() {
  return (
    <section className="landing-section" style={{ background: "#fff" }}>
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
          The bill
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
          Small teams pay the most for compliance
        </h2>
        <div
          style={{
            color: "rgba(13,26,47,0.7)",
            fontSize: 18,
            lineHeight: 1.55,
          }}
        >
          <p style={{ margin: "0 0 22px" }}>
            Regulation is a paperwork tax — and the smaller the team, the higher
            the rate.
          </p>
          <div
            className="why-costs-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 14,
              margin: "0 0 10px",
            }}
          >
            {STATS.map((s) => (
              <div
                key={s.figure}
                style={{
                  border: "1px solid #F0EDEA",
                  borderRadius: 16,
                  background: "#FAF9F7",
                  padding: "18px 20px",
                }}
              >
                <div
                  style={{
                    fontFamily: HEADING_FONT,
                    fontWeight: 700,
                    fontSize: 34,
                    letterSpacing: "-0.02em",
                    color: "#3E2EC0",
                    marginBottom: 4,
                  }}
                >
                  {s.figure}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.45 }}>
                  {s.caption}
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: 13,
              color: "rgba(13,26,47,0.5)",
              margin: "0 0 22px",
            }}
          >
            Crain &amp; Crain, The Cost of Federal Regulation to the U.S.
            Economy, Manufacturing and Small Business — for the National
            Association of Manufacturers, 2023.
          </p>
          <p style={{ margin: "0 0 18px" }}>
            The gap is not new. In 2005 the SBA&rsquo;s Office of Advocacy found
            that small firms paid about 45 percent more per employee to comply
            with federal regulation than their larger counterparts. Twenty years
            on, the smallest teams still carry the heaviest load.
          </p>
          <p style={{ margin: "0 0 18px" }}>
            Unemployment insurance shows how this lands on one desk — yours.
            When a former employee files a claim and you dispute it, the burden
            of proving misconduct is on the employer. Texas&rsquo;s workforce
            agency puts it plainly: an allegation &ldquo;must be proven with
            documentation and testimony from people with direct, personal
            knowledge of the circumstances&rdquo; — and without that proof,
            <strong style={{ color: "#0D1A2F" }}>
              {" "}
              &ldquo;the employer will lose.&rdquo;
            </strong>
          </p>
          <p style={{ margin: 0 }}>
            A signed, dated record of who was trained on which rule is exactly
            the kind of documentation those disputes turn on. Most small
            businesses don&rsquo;t have it — because keeping it was always extra
            work. With Jory, it is a side effect of training your team.
          </p>
        </div>
      </div>
    </section>
  );
}
