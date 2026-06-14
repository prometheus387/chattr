"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import clsx from "clsx";

interface RevealProps {
	as?: ElementType;
	children: ReactNode;
	className?: string;
	/** Delay in ms — useful for staggered lists. */
	delay?: number;
}

/**
 * Scroll-reveal wrapper. Toggles `data-revealed` on the underlying element
 * when it scrolls into view; the `.reveal` utility in globals.css fades
 * and slides the content in.
 *
 * Two non-obvious things to know about:
 *
 *  1. The first IntersectionObserver callback fires asynchronously, so
 *     elements that are already in the viewport on mount must also be
 *     revealed by an explicit visibility check on mount, or they'd stay
 *     invisible until the user scrolls.
 *
 *  2. On client-side back-navigation the page is restored from the
 *     browser's bfcache and React's `useEffect` does NOT re-run, so the
 *     observer never gets a chance to re-evaluate elements that were
 *     off-screen when the user originally left. A `pageshow` listener
 *     with `event.persisted` forces a reveal in that case — the
 *     animation is skipped, but the content is visible.
 */
export function Reveal({
	as: Tag = "div",
	children,
	className,
	delay = 0,
}: RevealProps) {
	const ref = useRef<HTMLElement | null>(null);
	const [revealed, setRevealed] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		// Reduced motion: skip the animation entirely.
		if (
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		) {
			setRevealed(true);
			return;
		}

		// No IntersectionObserver support: just show the content.
		if (typeof IntersectionObserver === "undefined") {
			setRevealed(true);
			return;
		}

		const isInView = (el: Element) => {
			const r = el.getBoundingClientRect();
			return r.top < window.innerHeight && r.bottom > 0;
		};

		let observer: IntersectionObserver | null = null;

		// Cover the "already in viewport on mount" case so we don't have
		// to wait for the observer's first async callback.
		if (isInView(node)) {
			setRevealed(true);
		} else {
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							setRevealed(true);
							observer?.disconnect();
						}
					}
				},
				{ rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
			);
			observer.observe(node);
		}

		// bfcache restoration: React doesn't re-run effects, the observer
		// won't re-fire, and any element that was off-screen when the
		// user left stays at `opacity: 0` forever. The `pageshow` event
		// with `event.persisted === true` is the only reliable signal.
		// We just reveal everything — the entrance animation is skipped
		// for that one render, which is the right trade-off.
		const onPageShow = (e: PageTransitionEvent) => {
			if (e.persisted) {
				setRevealed(true);
				observer?.disconnect();
				observer = null;
			}
		};
		window.addEventListener("pageshow", onPageShow);

		return () => {
			observer?.disconnect();
			window.removeEventListener("pageshow", onPageShow);
		};
	}, []);

	const style: CSSProperties = { ["--reveal-delay" as string]: `${delay}ms` };

	return (
		<Tag
			ref={ref as never}
			className={clsx("reveal", className)}
			data-revealed={revealed}
			style={style}
		>
			{children}
		</Tag>
	);
}
