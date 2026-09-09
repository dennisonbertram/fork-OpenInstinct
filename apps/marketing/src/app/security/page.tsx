import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { SignupButton } from "@/components/landing/signup-button";

export const metadata: Metadata = {
  title: "Security — Jory",
  description:
    "Cross-tenant isolation, a capability gateway the agent can't bypass, append-only audit, and an employee-privacy posture that isn't surveillance.",
};

const CARDS = [
  {
    tint: "#EDE8FF",
    stroke: "#3E2EC0",
    title: "Cross-tenant isolation by design",
    body: "Every request is scoped by Membership — the actor, not the phone number. The same number can be an Owner at Cafe A and an Employee at Site B; they resolve to two different memberships, two different scopes. An employee at Business B cannot retrieve Business A's procedure even if they know exactly what to ask for.",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
  {
    tint: "#E7F1E5",
    stroke: "#0A972F",
    title: "The agent can't bypass the gateway",
    body: 'Jory\'s reasoning runtime never touches the database. It can only call a finite, hardened catalog of capabilities — each one tenant-checked, role-checked, scope-checked, and audited. There is no "run any SQL" tool. The gateway is the universe the agent operates in.',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
  {
    tint: "#F1EBF8",
    stroke: "#3D2AB6",
    title: "Append-only audit, every state change",
    body: '"Did Maria acknowledge the food-safety policy?" That\'s answered by an immutable audit event, not by the model. Every capability invocation, every approval, every status update gets a timestamped, tenant-scoped record. Nothing is rewritten — only added.',
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </>
    ),
  },
  {
    tint: "#FDEBD2",
    stroke: "#D4A72C",
    title: "Employee privacy isn't an afterthought",
    body: "Jory is a coworker, not surveillance. Employees can always see what's shared back to management and what isn't. When a status update is being collected, it's clearly a manager-facing question — not a private chat dressed up otherwise.",
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
] as const;

export default function SecurityPage() {
  return (
    <main className="landing-page">
      <Nav />

      {/* Hero */}
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
          Trust is the architecture
        </h1>
        <p
          style={{
            fontSize: 20,
            color: "rgba(13,26,47,0.7)",
            letterSpacing: "-0.03em",
            lineHeight: 1.4,
            margin: "16px auto 0",
            maxWidth: 540,
          }}
        >
          Cross-business leakage is the worst class of bug. So we made it
          structurally impossible — not just policy. Here&apos;s how.
        </p>
      </section>

      {/* Security cards */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 48px",
        }}
      >
        <div
          className="security-card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 20,
          }}
        >
          {CARDS.map((card) => (
            <div
              key={card.title}
              className="security-card"
              style={{
                background: "#fff",
                borderRadius: 22,
                border: "1px solid #F5F4F3",
                boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
                padding: "36px",
                display: "flex",
                gap: 24,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: card.tint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={card.stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {card.icon}
                </svg>
              </div>
              <div>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: "#0D1A2F",
                    margin: "0 0 10px",
                  }}
                >
                  {card.title}
                </h2>
                <p
                  style={{
                    fontSize: 16,
                    color: "rgba(13,26,47,0.7)",
                    letterSpacing: "-0.03em",
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  {card.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust statement */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 48px",
        }}
      >
        <div
          className="marketing-dark-panel"
          style={{
            background: "#071B36",
            borderRadius: 22,
            padding: "48px 56px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h2
            style={{
              fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "#EDE8FF",
              margin: 0,
            }}
          >
            Grounded answers. No improvisation.
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "rgba(237,232,255,0.75)",
              letterSpacing: "-0.03em",
              lineHeight: 1.6,
              margin: 0,
              maxWidth: 680,
            }}
          >
            If Jory makes up a procedure that doesn&apos;t exist in your
            business memory, an employee could get hurt or violate policy. So
            employee-facing answers are always grounded in published procedures
            with a citation back to the source — usually the original video the
            owner recorded. If there is no matching memory, Jory says so. It
            does not improvise. Translations of safety-critical content keep the
            original alongside the translation.
          </p>
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
              Want the architecture deep-dive?
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
              We&apos;re happy to walk you through tenancy isolation, the
              capability gateway, audit, and our pilot data-handling
              commitments.
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
