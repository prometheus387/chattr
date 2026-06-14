import { Hero } from "@/components/landing/hero";
import { TrustStrip } from "@/components/landing/trust-strip";
import { Features } from "@/components/landing/features";
import { SiteFooter } from "@/components/landing/footer";

export default function Home() {
	return (
		<div className="flex flex-col">
			<Hero />
			<TrustStrip />
			<Features />
			<SiteFooter />
		</div>
	);
}
