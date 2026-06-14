import NextLink from "next/link";

import { siteConfig } from "@/config/site";

const FOOTER_GROUPS: { title: string; items: { label: string; href: string }[] }[] = [
	{
		title: "Product",
		items: [
			{ label: "Web client", href: "/client" },
			{ label: "Features", href: "/#features" },
			{ label: "Pricing", href: "/pricing" },
			{ label: "Changelog", href: "/changelog" },
		],
	},
	{
		title: "Resources",
		items: [
			{ label: "Help center", href: "/help" },
			{ label: "Status", href: "/status" },
			{ label: "Integrations", href: "/integrations" },
			{ label: "API docs", href: "/docs/api" },
		],
	},
	{
		title: "Company",
		items: [
			{ label: "About", href: "/about" },
			{ label: "Careers", href: "/careers" },
			{ label: "Contact", href: "/contact" },
			{ label: "Terms", href: "/terms" },
		],
	},
];

export function SiteFooter() {
	return (
		<footer className="mt-12 border-t border-white/[0.06]">
			<div className="mx-auto max-w-7xl px-6 py-12">
				<div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
					<div>
						<div className="flex items-center gap-2">
							<span className="text-base font-semibold text-white">chattr.</span>
							<span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
								v0.3.1
							</span>
						</div>
						<p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/45">
							{siteConfig.description}.
						</p>
					</div>

					{FOOTER_GROUPS.map((group) => (
						<div key={group.title}>
							<h4 className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
								{group.title}
							</h4>
							<ul className="mt-4 space-y-2.5">
								{group.items.map((item) => (
									<li key={item.label}>
										<NextLink
											href={item.href}
											className="text-[13.5px] text-white/65 transition-colors hover:text-white"
										>
											{item.label}
										</NextLink>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 text-[12px] text-white/35 sm:flex-row sm:items-center">
					<p>
						© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
					</p>
					<p className="font-mono">
						Made with C#, TypeScript and a lot of ADHD.
					</p>
				</div>
			</div>
		</footer>
	);
}
