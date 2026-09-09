import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Terms of Service — Jory",
  description: "The terms that govern your use of Jory.",
};

const SECTIONS: { heading: string; paragraphs: string[] }[] = [
  {
    heading: "What Jory is",
    paragraphs: [
      "Jory is an AI manager for deskless businesses. Owners and managers teach Jory how their business should run, and Jory turns that into text-based training, procedure answers, quick checks, signed proof, and follow-up for their teams.",
    ],
  },
  {
    heading: "Jory is free to use",
    paragraphs: [
      "Jory is currently free to use. If we ever introduce paid plans, we will tell you clearly before anything starts costing you money.",
    ],
  },
  {
    heading: "Your content",
    paragraphs: [
      "You own the content you and your team send to Jory — your standards, procedures, messages, photos, voice notes, and videos. You give us permission to store and process that content so we can run the service for your business: answering questions, tracking training, and keeping your records.",
    ],
  },
  {
    heading: "How we use your data to improve Jory",
    paragraphs: [
      "In exchange for free use of the service, you agree that we may use the content of conversations and materials shared with Jory to train and improve our models, features, and services.",
      "We do not sell your personal information, and we do not share your business's private content with other Jory customers.",
    ],
  },
  {
    heading: "Acceptable use",
    paragraphs: [
      "Use Jory for running your business. Don't use it to break the law, to harass people, to send spam, or to try to extract other businesses' data. We may suspend accounts that abuse the service.",
    ],
  },
  {
    heading: "Disclaimers",
    paragraphs: [
      "Jory is provided as-is, without warranties. Jory's answers can be wrong; you are responsible for the decisions you make in your business. To the maximum extent the law allows, we are not liable for indirect or consequential damages arising from your use of the service.",
    ],
  },
  {
    heading: "Changes to these terms",
    paragraphs: [
      "We may update these terms as the service evolves. When we make material changes, we will update this page and the date below.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: ["Questions about these terms? Email hello@jory.ai."],
  },
];

export default function TermsPage() {
  return (
    <main className="landing-page">
      <Nav />

      <section
        className="landing-section"
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "64px 48px 80px",
        }}
      >
        <h1
          style={{
            fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: "#0D1A2F",
            margin: 0,
          }}
        >
          Terms of Service
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "rgba(13,26,47,0.5)",
            letterSpacing: "-0.02em",
            margin: "12px 0 0",
          }}
        >
          Last updated: July 3, 2026
        </p>

        {SECTIONS.map((section) => (
          <section key={section.heading} style={{ marginTop: 36 }}>
            <h2
              style={{
                fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0D1A2F",
                margin: 0,
              }}
            >
              {section.heading}
            </h2>
            {section.paragraphs.map((text) => (
              <p
                key={text.slice(0, 40)}
                style={{
                  fontSize: 17,
                  color: "rgba(13,26,47,0.75)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.55,
                  margin: "12px 0 0",
                }}
              >
                {text}
              </p>
            ))}
          </section>
        ))}
      </section>

      <Footer />
    </main>
  );
}
