import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { HomeWorld } from "@/components/landing/home-world";
import { FeatureCards } from "@/components/landing/feature-cards";
import { UseCases } from "@/components/landing/use-cases";
import { WhyTeaser } from "@/components/landing/why-teaser";
import { CtaCard } from "@/components/landing/cta-card";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <main className="landing-page">
      <Nav />
      <Hero />
      <HomeWorld />
      <FeatureCards />
      <UseCases />
      <WhyTeaser />
      <CtaCard />
      <Footer />
    </main>
  );
}
