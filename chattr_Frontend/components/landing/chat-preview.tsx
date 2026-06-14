"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

import { LockIcon, PaperclipIcon } from "./icons";

interface ChatMessage {
	id: string;
	author: string;
	avatarColor: string;
	body: string;
	time: string;
	mine?: boolean;
}

const ROOMS: { id: string; name: string; unread?: number; active?: boolean; isDm?: boolean }[] = [
	{ id: "ops", name: "ops-room", unread: 2, active: true },
	{ id: "design", name: "design-crit" },
	{ id: "general", name: "general" },
	{ id: "announcements", name: "announcements" },
	{ id: "kira", name: "Kira", isDm: true },
	{ id: "mara", name: "Mara", isDm: true },
	{ id: "patch", name: "patch-notes" },
];

const INITIAL_MESSAGES: ChatMessage[] = [
	{
		id: "m1",
		author: "Kira",
		avatarColor: "bg-rose-500/20 text-rose-300",
		body: "Pushed the new key bundle. Rotating the room key now.",
		time: "09:12",
	},
	{
		id: "m2",
		author: "Mara",
		avatarColor: "bg-sky-500/20 text-sky-300",
		body: "Got it. Hitting a clean handshake here, all green.",
		time: "09:13",
	},
	{
		id: "m3",
		author: "you",
		avatarColor: "bg-emerald-500/20 text-emerald-300",
		body: "Same on my end. AES session resumed, no re-prompt.",
		time: "09:14",
		mine: true,
	},
];

/**
 * A self-contained mockup of the chattr. client. Renders a realistic
 * sidebar + message area + composer. Cycles a short typing-indicator
 * animation and a fading "incoming message" to feel alive without
 * being distracting.
 */
export function ChatPreview() {
	const [showTyping, setShowTyping] = useState(false);
	const [incoming, setIncoming] = useState<ChatMessage | null>(null);

	useEffect(() => {
		// Reduced-motion users get a static preview.
		if (
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		let cancelled = false;
		let cycleId = 0;

		const cycle = () => {
			if (cancelled) return;
			// show typing indicator
			setShowTyping(true);
			// then a moment later, deliver a message and clear typing
			const deliverId = window.setTimeout(() => {
				if (cancelled) return;
				setShowTyping(false);
				setIncoming({
					id: `live-${cycleId}`,
					author: "Mara",
					avatarColor: "bg-sky-500/20 text-sky-300",
					body: "Fingerprint matches, we're good 👍",
					time: "now",
				});
				// fade it out again before the next cycle
				const clearId = window.setTimeout(() => {
					if (cancelled) return;
					setIncoming(null);
				}, 4500);
				cycleId = window.setTimeout(cycle, 7000) as unknown as number;
				// keep a handle to clear on unmount
				pendingHandles.push(clearId);
			}, 1600);
			pendingHandles.push(deliverId);
		};

		const pendingHandles: number[] = [];
		const startId = window.setTimeout(cycle, 1400);
		pendingHandles.push(startId);

		return () => {
			cancelled = true;
			for (const h of pendingHandles) window.clearTimeout(h);
		};
	}, []);

	return (
		<div
			aria-hidden
			className="relative w-full max-w-[640px] rounded-xl border border-white/10 bg-[#0d0e12] shadow-2xl shadow-black/50 ring-1 ring-white/[0.02] overflow-hidden font-sans"
		>
			{/* window chrome */}
			<div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 sm:px-4 sm:py-2.5">
				<div className="flex shrink-0 items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
					<span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
					<span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
				</div>
				<div className="flex min-w-0 items-center gap-2 text-[11px] text-white/40">
					<LockIcon size={11} className="hidden shrink-0 text-emerald-400/80 sm:inline-block" />
					<span className="truncate font-mono text-[10.5px] sm:text-[11px]">chattr — encrypted</span>
				</div>
				<div className="hidden shrink-0 items-center gap-1.5 text-[10px] text-white/40 sm:flex">
					<span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
					<span>online</span>
				</div>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
				{/* sidebar */}
				<div className="hidden border-r border-white/[0.06] bg-white/[0.015] py-3 sm:flex sm:flex-col sm:gap-3">
					<div className="px-3 text-[10px] font-medium uppercase tracking-wider text-white/30">
						Rooms
					</div>
					<ul className="flex flex-col">
						{ROOMS.map((room) => (
							<li key={room.id}>
								<div
									className={clsx(
										"flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors",
										room.active
											? "bg-white/[0.05] text-white"
											: "text-white/55 hover:bg-white/[0.03]",
									)}
								>
									<span className="flex items-center gap-1.5 truncate">
										<span className="text-white/30 font-mono text-xs">
											{room.isDm ? "@" : "#"}
										</span>
										<span className="truncate">{room.name}</span>
									</span>
									{room.unread ? (
										<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/90 px-1 text-[10px] font-semibold text-black">
											{room.unread}
										</span>
									) : null}
								</div>
							</li>
						))}
					</ul>
				</div>

				{/* messages */}
				<div className="flex h-[300px] flex-col overflow-hidden sm:h-[360px]">
					<div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2 sm:px-4 sm:py-2.5">
						<div className="flex min-w-0 items-center gap-2">
							<span className="text-white/40 font-mono text-sm">#</span>
							<span className="truncate text-sm font-medium text-white">ops-room</span>
							<span className="hidden shrink-0 rounded border border-emerald-400/20 bg-emerald-400/5 px-1.5 py-0.5 text-[10px] text-emerald-300/90 sm:inline-block">
								e2ee · verified
							</span>
						</div>
						<div className="hidden shrink-0 text-[10px] text-white/35 font-mono sm:block">
							3 members
						</div>
					</div>

					<div className="flex-1 space-y-3 overflow-hidden px-3 py-3 text-[12.5px] leading-relaxed sm:px-4 sm:py-4 sm:text-[13px]">
						{INITIAL_MESSAGES.map((m) => (
							<MessageRow key={m.id} message={m} />
						))}

						{incoming ? <MessageRow message={incoming} fresh /> : null}

						{showTyping ? <TypingRow /> : null}
					</div>

					{/* composer */}
					<div className="border-t border-white/[0.06] p-2.5 sm:p-3">
						<div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 sm:px-3 sm:py-2">
							<button
								type="button"
								aria-label="Attach a file"
								className="grid h-5 w-5 shrink-0 place-items-center rounded text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white/60"
							>
								<PaperclipIcon size={14} />
							</button>
							<span className="text-[12px] text-white/45 font-mono sm:text-[13px]">
								Send a message
							</span>
							<span className="caret ml-0.5 text-white/55" />
							<div className="ml-auto hidden shrink-0 items-center gap-1.5 text-[10px] text-white/35 font-mono sm:flex">
								<LockIcon size={11} className="text-emerald-400/70" />
								<span>encrypted</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function MessageRow({ message, fresh = false }: { message: ChatMessage; fresh?: boolean }) {
	return (
		<div className={clsx("flex items-start gap-2.5", fresh && "chat-fade-in")}>
			<div
				className={clsx(
					"mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
					message.avatarColor,
				)}
			>
				{message.author[0]?.toUpperCase()}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="font-medium text-white">{message.author}</span>
					<span className="text-[10px] text-white/30 font-mono">{message.time}</span>
				</div>
				<div
					className={clsx(
						"mt-0.5 text-white/80",
						message.mine && "text-emerald-50/95",
					)}
				>
					{message.body}
				</div>
			</div>
		</div>
	);
}

function TypingRow() {
	return (
		<div className="flex items-start gap-2.5 chat-fade-in">
			<div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sky-500/20 text-[11px] font-semibold text-sky-300">
				M
			</div>
			<div className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1.5">
				<span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/55" />
				<span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/55" />
				<span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/55" />
			</div>
		</div>
	);
}
