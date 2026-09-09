import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { PipelineBand } from "@/components/marketing/pipeline-band";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features } from "@/components/marketing/features";
import { Pricing } from "@/components/marketing/pricing";
import { Testimonials } from "@/components/marketing/testimonials";
import { CtaBand } from "@/components/marketing/cta-band";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteNav />
      <Hero />
      <PipelineBand />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Pricing />
      <CtaBand />
      <SiteFooter />
    </main>
  );
}
