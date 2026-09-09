const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

const POINTS = [
  {
    num: "01",
    title: "Jory turns how you run your business into written training.",
    body: "You explain a standard once — by text, voice, video, or a document — and Jory turns it into your training manual and your onboarding materials. You approve what it writes.",
  },
  {
    num: "02",
    title: "It's agentic. You mostly just chat.",
    body: "There is a dashboard, but the work happens in conversation. You talk about how the business should run; Jory does the writing, the organizing, and the follow-up.",
  },
  {
    num: "03",
    title: "Your team joins by text or the app.",
    body: "No software rollout and no new logins to police. You add an employee, and Jory meets them where they already are: their phone.",
  },
  {
    num: "04",
    title: "Anyone can ask how the business is supposed to work. Any time.",
    body: "Jory answers from your approved standards, not from the internet. The handbook stops being a document in a drawer and becomes something your team actually uses on shift.",
  },
  {
    num: "05",
    title: "Training becomes provable.",
    body: "Employees sign off on each piece of training they complete. You get a record of who was trained, on what, and when — without keeping paperwork.",
  },
] as const;

export function WhyPoints() {
  return (
    <section
      className="landing-section why-section"
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
        The short version
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
        What you need to know about Jory
      </h2>
      <ol
        className="why-points"
        style={{ listStyle: "none", margin: "34px 0 0", padding: 0 }}
      >
        {POINTS.map((point) => (
          <li
            key={point.num}
            className="why-points-row"
            style={{
              display: "grid",
              gridTemplateColumns: "64px 1fr",
              gap: 20,
              padding: "26px 0",
              borderTop: "1px solid #F0EDEA",
            }}
          >
            <span
              style={{
                fontFamily: HEADING_FONT,
                fontWeight: 700,
                fontSize: 26,
                color: "#3E2EC0",
                lineHeight: 1.2,
              }}
            >
              {point.num}
            </span>
            <div>
              <h3
                style={{
                  fontSize: 21,
                  fontWeight: 700,
                  marginBottom: 6,
                  lineHeight: 1.25,
                  color: "#0D1A2F",
                  letterSpacing: "-0.02em",
                }}
              >
                {point.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "rgba(13,26,47,0.7)",
                  fontSize: 17,
                }}
              >
                {point.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
