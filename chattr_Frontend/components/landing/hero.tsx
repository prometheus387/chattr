import NextLink from "next/link";
import clsx from "clsx";

import { ChatPreview } from "./chat-preview";
import { Reveal } from "./reveal";
import { ArrowRightIcon, LockIcon } from "./icons";

/**
 * A small link-styled-as-button used in the hero CTAs. Kept local because
 * we don't need a full Button primitive (with its disabled/loading state
 * machinery) for a static marketing call-to-action.
 */
function LinkButton({
	href,
	children,
	variant = "primary",
	className,
	external = false,
	...rest
}: {
	href: string;
	children: React.ReactNode;
	variant?: "primary" | "outline";
	className?: string;
	external?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	const base =
		"inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13.5px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090c]"

	const variants: Record<"primary" | "outline", string> = {
		primary:
			"bg-white text-[#0b0c0f] hover:bg-white/90 active:bg-white/85 shadow-[0_1px_0_0_rgba(255,255,255,0.2)_inset,0_1px_2px_rgba(0,0,0,0.3)]",
		outline:
			"border border-white/15 bg-white/[0.02] text-white/85 hover:bg-white/[0.06] hover:border-white/25 hover:text-white",
	};

	return (
		<NextLink
			href={href}
			className={clsx(base, variants[variant], className)}
			target={external ? "_blank" : undefined}
			rel={external ? "noreferrer" : undefined}
			{...rest}
		>
			{children}
		</NextLink>
	);
}

export function Hero() {
	return (
		<section className="relative w-full pt-12 pb-20 sm:pt-20 sm:pb-28">
			<div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
				{/* left: copy + CTAs */}
				<div className="flex flex-col items-start">
					<Reveal as="div" delay={0}>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-300/90">
							<LockIcon size={12} />
							End-to-end encrypted
						</span>
					</Reveal>

					<Reveal
						as="h1"
						delay={80}
						className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05] font-semibold tracking-tight text-white"
					>
						Talk to people.
						<br />
						<span className="text-white/55">Not to the cloud.</span>
					</Reveal>

					<Reveal
						as="p"
						delay={160}
						className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-base"
					>
						chattr. is a quiet little chat app for groups, guilds and DMs.
						We run the servers, you hold the keys — messages are sealed
						with AES-256 and signed with PGP keys that never leave your
						devices. No analytics, no ads, no magic — just the
						conversation.
					</Reveal>

					<Reveal
						as="div"
						delay={240}
						className="mt-7 flex flex-wrap items-center gap-3"
					>
						<LinkButton href="/client">
							Open the web app
							<ArrowRightIcon size={14} />
						</LinkButton>
						<LinkButton href="/pricing" variant="outline">
							See pricing
						</LinkButton>
					</Reveal>

					<Reveal
						as="div"
						delay={320}
						className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-white/40"
					>
						<span className="font-mono">v0.3.1 · end-to-end encrypted</span>
						<span className="hidden h-1 w-1 rounded-full bg-white/20 sm:inline-block" />
						<span>Web · Desktop · Mobile</span>
						<span className="hidden h-1 w-1 rounded-full bg-white/20 sm:inline-block" />
						<span>Closed source</span>
					</Reveal>
				</div>

				{/* right: the product preview */}
				<Reveal delay={180} className="relative w-full">
					{/* faint glow behind the preview, kept very subtle */}
					<div
						aria-hidden
						className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-emerald-500/10 via-white/[0.02] to-transparent blur-2xl"
					/>
					<ChatPreview />
				</Reveal>
			</div>
		</section>
	);
}
