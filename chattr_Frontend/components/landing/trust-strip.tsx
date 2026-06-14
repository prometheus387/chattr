import { Reveal } from "./reveal";

const SPECS: { label: string; value: string; mono?: boolean }[] = [
	{ label: "Cipher", value: "AES-256-GCM", mono: true },
	{ label: "Identity", value: "PGP (ed25519 / x25519)", mono: true },
	{ label: "Transport", value: "Noise XX · TLS 1.3", mono: true },
	{ label: "Infrastructure", value: "Multi-region replicated" },
	{ label: "Source", value: "Closed source" },
];

export function TrustStrip() {
	return (
		<section className="w-full border-y border-white/[0.06] bg-white/[0.015]">
			<div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
				<Reveal as="div" className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
					Built on boring, audited primitives
				</Reveal>
				<Reveal as="ul" delay={120} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-white/55 sm:justify-end">
					{SPECS.map((s) => (
						<li key={s.label} className="flex items-center gap-1.5">
							<span className="text-white/35">{s.label}</span>
							<span className={s.mono ? "font-mono text-white/80" : "text-white/80"}>
								{s.value}
							</span>
						</li>
					))}
				</Reveal>
			</div>
		</section>
	);
}
