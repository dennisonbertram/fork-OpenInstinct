import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { WhyHero } from "@/components/why/why-hero";
import { WhyPoints } from "@/components/why/why-points";
import { WhyProblem } from "@/components/why/why-problem";
import { WhyCosts } from "@/components/why/why-costs";
import { WhySystem } from "@/components/why/why-system";
import { WhyProof } from "@/components/why/why-proof";
import { WhyStandards } from "@/components/why/why-standards";
import { WhyNote } from "@/components/why/why-note";
import { WhyCta } from "@/components/why/why-cta";

export const metadata: Metadata = {
  title: "Why we're building Jory — Jory",
  description:
    "An inside look at why we're building Jory: Jory helps small and medium businesses document their training — and prove it happened.",
};

export default function WhyPage() {
  return (
    <main className="landing-page">
      <Nav />
      <WhyHero />
      <WhyPoints />
      <WhyProblem />
      <WhyCosts />
      <WhySystem />
      <WhyProof />
      <WhyStandards />
      <WhyNote />
      <WhyCta />
      <Footer />
    </main>
  );
}
