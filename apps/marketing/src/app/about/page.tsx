import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { SignupButton } from "@/components/landing/signup-button";

export const metadata: Metadata = {
  title: "About — Jory",
  description:
    "Why we're building an AI manager for the 80% of the workforce who don't sit at desks — cafes, construction, kitchens, retail, security, cleaning, field services.",
};

export default function AboutPage() {
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
          Software finally
          <br />
          <span style={{ color: "#3E2EC0" }}>shows up at the bar.</span>
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
          Roughly 80% of the global workforce is deskless — they work in cafes,
          on construction sites, in kitchens, vans, stores, hospitals, hotels.
          Software has barely served them. We're changing that.
        </p>
      </section>

      {/* Story card */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 24px",
        }}
      >
        <div
          className="about-story-grid"
          style={{
            background: "#fff",
            borderRadius: 22,
            border: "1px solid #F5F4F3",
            boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
            padding: "48px 56px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "start",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0D1A2F",
                margin: "0 0 20px",
                lineHeight: 1.1,
              }}
            >
              The story so far
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "rgba(13,26,47,0.75)",
                letterSpacing: "-0.03em",
                lineHeight: 1.65,
                margin: "0 0 16px",
              }}
            >
              Talking to small-business owners we kept hearing the same things:
              onboarding takes forever and never sticks. Checklists die on
              laminated sheets nobody reads. Status updates are missing or
              lying. Multi-location is exponential pain. Language barriers keep
              breaking. And turnover means the owner re-onboards their entire
              staff every year.
            </p>
            <p
              style={{
                fontSize: 17,
                color: "rgba(13,26,47,0.75)",
                letterSpacing: "-0.03em",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              Three things are now true at the same time, for the first time:
              multimodal models can ingest a 30-second iPhone video and turn it
              into structured knowledge; chat is the universal UI for deskless
              work (WhatsApp, SMS, iMessage); and the small-business ops
              category has stalled. So we built Jory.
            </p>
          </div>
          <div>
            <h2
              style={{
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0D1A2F",
                margin: "0 0 20px",
                lineHeight: 1.1,
              }}
            >
              Our mission
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "rgba(13,26,47,0.75)",
                letterSpacing: "-0.03em",
                lineHeight: 1.65,
                margin: "0 0 16px",
              }}
            >
              A new hire at a small business should be able to text a number,
              get onboarded, learn the job, ask questions, and complete their
              first shift — without their manager being tied up explaining the
              same things for the hundredth time.
            </p>
            <p
              style={{
                fontSize: 17,
                color: "rgba(13,26,47,0.75)",
                letterSpacing: "-0.03em",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              That sentence is our north star. If a feature doesn&apos;t move us
              toward it, it doesn&apos;t ship in year one.
            </p>
          </div>
        </div>
      </section>

      {/* Team card */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 24px",
        }}
      >
        <div
          className="marketing-dark-panel"
          style={{
            background: "#EDE8FF",
            borderRadius: 22,
            padding: "48px 56px",
          }}
        >
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#0D1A2F",
              margin: "0 0 20px",
              lineHeight: 1.1,
            }}
          >
            The team behind Jory
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "rgba(13,26,47,0.75)",
              letterSpacing: "-0.03em",
              lineHeight: 1.65,
              margin: "0 0 16px",
              maxWidth: 680,
            }}
          >
            We&apos;re a small team of engineers, designers, and operators. Some
            of us have run businesses where most employees don&apos;t have
            desks. All of us have watched owners and managers waste their days
            re-explaining the same things to a constantly-rotating crew.
          </p>
          <p
            style={{
              fontSize: 17,
              color: "rgba(13,26,47,0.75)",
              letterSpacing: "-0.03em",
              lineHeight: 1.65,
              margin: 0,
              maxWidth: 680,
            }}
          >
            We care about three things in this product: the answer is always
            grounded in what the owner actually taught Jory; the system
            structurally cannot leak data across businesses; and Jory feels like
            a competent coworker — not surveillance, not a chatbot.
          </p>
        </div>
      </section>

      {/* Contact card */}
      <section
        className="landing-section"
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: "0 48px 48px",
        }}
      >
        <div
          className="marketing-contact-card"
          style={{
            background: "#fff",
            borderRadius: 22,
            border: "1px solid #F5F4F3",
            boxShadow: "0px 5px 10px 0px rgba(3,17,40,0.06)",
            padding: "40px 56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 40,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0D1A2F",
                margin: "0 0 8px",
              }}
            >
              Get in touch
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "rgba(13,26,47,0.7)",
                letterSpacing: "-0.03em",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Pilot inquiries, partnerships, press — we&apos;d love to hear from
              you. We&apos;re especially interested in talking to owners of
              cafes, construction firms, catering companies, retail shops, and
              field-service businesses. Email{" "}
              <a
                href="mailto:hello@jory.ai"
                style={{
                  color: "#3E2EC0",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                hello@jory.ai
              </a>
            </p>
          </div>
          <SignupButton
            style={{
              background: "#01102B",
              color: "#fff",
              border: 0,
              borderRadius: 16,
              padding: "16px 24px",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              cursor: "pointer",
              fontFamily: "inherit",
              height: 60,
              boxSizing: "border-box",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
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
