import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { SignupButton } from "@/components/landing/signup-button";

export const metadata: Metadata = {
  title: "Features — Jory",
  description:
    "Cafe staff training, signed policy proof, manager nudges, explicit shift checks, and multi-location accountability over the messaging apps your team already uses.",
};

const FEATURES = [
  {
    tint: "#F1EBF8",
    stroke: "#3D2AB6",
    title: "Pre-shift training",
    body: "New hires learn the opening routine, closing routine, drinks, prep, and house rules before they step on shift. No app install, no manager repeating the same lecture.",
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
    stroke: "#D4A72C",
    title: "Multimodal standard capture",
    body: "Record a 30-second video of the right cortado, milk station, or closing clean. Jory drafts training, attaches the source, and asks you to approve.",
    icon: (
      <>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </>
    ),
  },
  {
    tint: "#E7F1E5",
    stroke: "#0A972F",
    title: "Signed policy proof",
    body: "Employees acknowledge handbook rules, lateness, no-shows, phone use, and safety policies from chat. Jory records who signed which version and when.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  {
    tint: "#FFE4D7",
    stroke: "#FD4612",
    title: "Shift standard checks",
    body: '"Ask the opener for a milk-station photo by 8:30." Jory collects proof, exceptions, and missing replies, then gives the manager one clean rollup.',
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    tint: "#EDE8FF",
    stroke: "#4434E8",
    title: "Multi-location accountability",
    body: "Two cafes, three sites, five franchises: see training gaps, unsigned policies, failed checks, and recurring standards without reading every group chat.",
    icon: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
  {
    tint: "#FFF1CF",
    stroke: "#D4A72C",
    title: "Grounded staff Q&A",
    body: "Employees still ask in their language. Answers come from approved standards and training sources, not generic advice and not private manager notes.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </>
    ),
  },
] as const;

export default function FeaturesPage() {
  return (
    <main className="landing-page">
      <Nav />

      {/* Hero section */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "64px 48px 48px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "#0D1A2F",
            margin: 0,
          }}
        >
          Built for high-turnover teams
        </h1>
        <p
          style={{
            fontSize: 20,
            color: "rgba(13,26,47,0.7)",
            letterSpacing: "-0.03em",
            lineHeight: 1.4,
            margin: "16px auto 0",
            maxWidth: 560,
          }}
        >
          Owners teach the standard. Employees train and sign. Managers see what
          slipped. All over WhatsApp, SMS, or iMessage.
        </p>
      </section>

      {/* Feature grid */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 80px",
        }}
      >
        <div
          className="marketing-card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="marketing-card"
              style={{
                background: "#fff",
                borderRadius: 22,
                border: "1px solid #F5F4F3",
                boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
                padding: "32px",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: f.tint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <svg
                  width="26"
                  height="26"
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
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "#0D1A2F",
                  margin: "0 0 10px",
                }}
              >
                {f.title}
              </h2>
              <p
                style={{
                  fontSize: 16,
                  color: "rgba(13,26,47,0.7)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section
        className="landing-section landing-cta"
        style={{ maxWidth: 1440, margin: "0 auto", padding: "0 48px 64px" }}
      >
        <div
          className="marketing-split-cta"
          style={{
            background: "#EBE5F6",
            borderRadius: 22,
            padding: "48px 56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 40,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                color: "#0D1A2F",
                margin: 0,
              }}
            >
              Teach Jory your first procedure.
            </h2>
            <p
              style={{
                fontSize: 18,
                color: "#0D1A2F",
                letterSpacing: "-0.03em",
                lineHeight: 1.4,
                margin: "12px 0 0",
              }}
            >
              Send a 30-second video. See it published as a procedure your team
              can pull up.
            </p>
          </div>
          <SignupButton
            style={{
              background: "#01102B",
              color: "#fff",
              border: 0,
              borderRadius: 16,
              padding: "20px 28px",
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
              whiteSpace: "nowrap",
              flexShrink: 0,
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
      </section>

      <Footer />
    </main>
  );
}
