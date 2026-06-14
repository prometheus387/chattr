import { Reveal } from "./reveal";
import {
	HashIcon,
	UsersIcon,
	KeyIcon,
	ShieldCheckIcon,
	TerminalIcon,
	ServerIcon,
} from "./icons";

interface Feature {
	icon: React.ComponentType<{ size?: number; className?: string }>;
	title: string;
	body: string;
	meta?: string;
}

const FEATURES: Feature[] = [
	{
		icon: HashIcon,
		title: "Guilds and rooms",
		body: "Long-lived rooms organised into guilds. Threads, mentions, pinned messages, slow mode — the familiar shape, none of the surveillance.",
		meta: "Unlimited rooms per guild",
	},
	{
		icon: UsersIcon,
		title: "Direct messages",
		body: "One-to-one and small group DMs that work like the rest of the app. No phone number required, no contact upload, no discovery feed.",
		meta: "1:1 and up to 32 members",
	},
	{
		icon: KeyIcon,
		title: "Your keys, your devices",
		body: "Each device holds its own long-term PGP identity. Pair a new phone with a QR code and a fingerprint check — that's it.",
		meta: "Cross-device key sync",
	},
	{
		icon: ShieldCheckIcon,
		title: "Verified sessions",
		body: "Every message is signed and every session is fingerprinted. You'll see a warning if anything in the chain looks off.",
		meta: "Out-of-band verification",
	},
	{
		icon: TerminalIcon,
		title: "Bots and integrations",
		body: "A small, well-documented HTTP API for bots. Webhook integrations for GitHub, Linear, Jira and PagerDuty ship in the box.",
		meta: "JSON over HTTPS",
	},
	{
		icon: ServerIcon,
		title: "We run the servers",
		body: "Zero ops. Our infrastructure runs the servers so you don't have to — patched, backed up, and replicated across regions. You get the messages; we get the uptime.",
		meta: "99.9% uptime SLA",
	},
];

export function Features() {
	return (
		<section id="features" className="w-full py-20 sm:py-28">
			<div className="mx-auto max-w-7xl px-6">
				<Reveal as="div" className="max-w-2xl">
					<span className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">
						What's inside
					</span>
					<h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
						Everything a chat app needs.
						<br />
						<span className="text-white/45">Nothing it doesn't.</span>
					</h2>
					<p className="mt-4 text-[15px] leading-relaxed text-white/55">
						We left out the parts of modern chat that have nothing to do with
						chat. No "for you" feed, no read-receipt anxiety, no phone-home
						telemetry. Just the rooms, the messages, and the keys.
					</p>
				</Reveal>

				<ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((f, i) => (
						<li key={f.title} className="bg-[#0c0d11]">
							<Reveal
								as="div"
								delay={i * 60}
								className="group h-full p-6 transition-colors hover:bg-white/[0.015]"
							>
								<div className="flex items-center gap-3">
									<span className="grid h-9 w-9 place-items-center rounded-md border border-white/[0.07] bg-white/[0.025] text-white/75 transition-colors group-hover:border-emerald-400/30 group-hover:text-emerald-300">
										<f.icon size={18} />
									</span>
									<h3 className="text-[15px] font-medium text-white">
										{f.title}
									</h3>
								</div>
								<p className="mt-3 text-[13.5px] leading-relaxed text-white/55">
									{f.body}
								</p>
								{f.meta ? (
									<p className="mt-4 text-[11px] font-mono uppercase tracking-wider text-white/30">
										{f.meta}
									</p>
								) : null}
							</Reveal>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
