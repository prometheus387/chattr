"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import clsx from "clsx";

import { siteConfig } from "@/config/site";
import { useAuth } from "@/contexts/auth-provider";

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const auth = useAuth();

  // Close the mobile menu whenever the viewport grows past the `sm` breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Tighten the navbar background once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <nav
      className={clsx(
        "navbar-enter fixed top-0 left-0 right-0 z-40 w-full border-b transition-colors duration-300",
        isScrolled
          ? "border-white/[0.08] bg-[#08090c]/80 backdrop-blur-xl"
          : "border-transparent bg-[#08090c]/30 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-6">
        {/* Logo + desktop nav */}
        <div className="flex items-center gap-6">
          <NextLink
            href="/"
            className="group flex items-center gap-1"
            aria-label="chattr. home"
          >
            <span className="text-[15px] font-bold text-white transition-colors group-hover:text-emerald-300">
              chattr.
            </span>
          </NextLink>

          <ul className="hidden items-center gap-1 lg:flex">
            {siteConfig.navItems.map((item) => (
              <li key={item.href}>
                <NextLink
                  href={item.href}
                  className="nav-link relative inline-flex items-center px-3 py-1.5 text-[13.5px] text-white/65 transition-colors duration-200 hover:text-white"
                >
                  {item.label}
                </NextLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Desktop auth controls */}
        <div className="hidden items-center gap-2 sm:flex">
          {auth.isAuthorized ? (
            <>
              <NextLink
                href={auth.user ? `/u/${auth.user.username}` : "/client"}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[13px] text-white/75 transition-colors hover:border-white/15 hover:text-white"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
                {auth.user?.displayName ?? "Authorized"}
              </NextLink>
              <button
                type="button"
                onClick={() => {
                  auth.signOut();
                  window.location.href = "/";
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.02] px-4 text-[13px] font-medium text-white/85 transition-all duration-150 hover:border-white/25 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NextLink
                href="/signin"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.02] px-4 text-[13px] font-medium text-white/85 transition-all duration-150 hover:border-white/25 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                Sign in
              </NextLink>
              <NextLink
                href="/register"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-4 text-[13px] font-medium text-[#0b0c0f] transition-all duration-150 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                Register
              </NextLink>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          aria-controls="mobile-menu"
          className="relative grid h-9 w-9 place-items-center rounded-md border border-white/[0.06] text-white/70 transition-colors hover:border-white/15 hover:text-white sm:hidden"
          onClick={() => setIsMenuOpen((v) => !v)}
        >
          <span className="hamburger" data-open={isMenuOpen}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {/* Mobile menu — animated via the grid-template-rows 0fr → 1fr trick */}
      <div
        id="mobile-menu"
        aria-hidden={!isMenuOpen}
        className={clsx(
          "mobile-menu sm:hidden",
          isMenuOpen && "mobile-menu-open",
        )}
      >
        <div className="mobile-menu-inner">
          <ul className="flex flex-col gap-1 px-6 pb-6 pt-2">
            {siteConfig.navItems.map((item) => (
              <li key={item.href}>
                <NextLink
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-[14px] text-white/75 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white"
                >
                  {item.label}
                </NextLink>
              </li>
            ))}
            {!auth.isAuthorized ? (
              <li className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
                <NextLink
                  href="/signin"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 bg-white/[0.02] px-4 text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
                >
                  Sign in
                </NextLink>
                <NextLink
                  href="/register"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-4 text-[13.5px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90"
                >
                  Register
                </NextLink>
              </li>
            ) : (
              <li className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
                <NextLink
                  href={auth.user ? `/u/${auth.user.username}` : "/client"}
                  onClick={() => setIsMenuOpen(false)}
                  className="px-3 text-[12px] uppercase tracking-wider text-white/40"
                >
                  Signed in as {auth.user?.displayName ?? "you"}
                </NextLink>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    auth.signOut();
                    window.location.href = "/";
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 bg-white/[0.02] px-4 text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
                >
                  Sign out
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};
