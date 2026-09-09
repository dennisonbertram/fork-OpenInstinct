const HEADING_FONT = "'Inter Tight', Inter, system-ui, sans-serif";

const STANDARDS = [
  {
    label: "Food service",
    body: "Opening and closing routines, food safety rules, and the basics every new hire needs before the rush.",
  },
  {
    label: "Construction & trades",
    body: "Site safety, tool rules, and PPE checks that need a sign-off before work starts.",
  },
  {
    label: "Cleaning services",
    body: "Room-by-room standards, supply and lockup steps, kept the same at every location.",
  },
  {
    label: "Salons & front desks",
    body: "Client scripts, sanitation routines, and the small standards that are easy to skip.",
  },
] as const;

export function WhyStandards() {
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
        Who it&rsquo;s for
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
        Built for businesses that run on standards
      </h2>
      <p style={{ color: "rgba(13,26,47,0.7)", margin: 0 }}>
        If your business has an opening routine, a safety rule, a way the room
        has to look, or a script the front desk should follow — you have
        standards worth documenting. For example:
      </p>
      <div
        className="why-standards-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
          marginTop: 30,
        }}
      >
        {STANDARDS.map((standard) => (
          <div
            key={standard.label}
            style={{
              border: "1px solid #F0EDEA",
              borderRadius: 16,
              background: "#fff",
              padding: "18px 20px",
              fontSize: 16,
              color: "rgba(13,26,47,0.7)",
            }}
          >
            <strong
              style={{
                display: "block",
                color: "#0D1A2F",
                fontWeight: 600,
                marginBottom: 3,
              }}
            >
              {standard.label}
            </strong>
            {standard.body}
          </div>
        ))}
      </div>
    </section>
  );
}
