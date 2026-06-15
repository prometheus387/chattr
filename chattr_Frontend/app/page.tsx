import { Hero } from "@/components/landing/hero";
import { TrustStrip } from "@/components/landing/trust-strip";
import { Features } from "@/components/landing/features";
import { SiteFooter } from "@/components/landing/footer";
import { PageContainer } from "@/components/landing/page-container";

export default function Home() {
  return (
    <PageContainer>
      <div className="flex flex-col">
        <Hero />
        <TrustStrip />
        <Features />
        <SiteFooter />
      </div>
    </PageContainer>
  );
}
