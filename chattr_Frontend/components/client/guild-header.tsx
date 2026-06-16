"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

interface Props {
  guildName: string;
  isOwner: boolean;
  /**
   * True iff the current user has a role with IsAdministrator on this
   * guild. The owner always qualifies (their @everyone role is admin
   * by default), but other members can also be granted admin later.
   * Drives whether the settings entry is clickable.
   */
  isAdministrator?: boolean;
  busy?: boolean;
  errorMessage?: string | null;
  onLeave: () => void;
  /** Stub actions shown in the dropdown but not wired up yet. */
  onInvite?: () => void;
  /** Opens the guild settings modal. Only enabled when isAdministrator. */
  onSettings?: () => void;
}

/**
 * Discord-style guild-header. Click anywhere on the pill to toggle a
 * dropdown with a "Leave guild" action (functional) and a few placeholders
 * (invite / settings) so the menu doesn't feel sparse.
 */
export function GuildHeader({
  guildName,
  isOwner,
  isAdministrator = false,
  busy,
  errorMessage,
  onLeave,
  onInvite,
  onSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          "group flex w-full items-center justify-between gap-2 border-b border-white/[0.06] bg-[#0a0b0e] px-4 py-3 text-left transition-colors",
          "hover:bg-white/[0.04]",
          open && "bg-white/[0.04]",
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold text-white">
            {guildName}
          </span>
          {isOwner ? (
            <span className="text-[10.5px] uppercase tracking-wider text-emerald-300/80">
              Owner
            </span>
          ) : isAdministrator ? (
            <span className="text-[10.5px] uppercase tracking-wider text-amber-300/80">
              Admin
            </span>
          ) : (
            <span className="text-[10.5px] uppercase tracking-wider text-white/35">
              Member
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(
            "shrink-0 text-white/45 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-2 right-2 top-full z-20 mt-1 overflow-hidden rounded-md border border-white/[0.08] bg-[#16181d] py-1 shadow-2xl shadow-black/60"
        >
          <MenuItem
            icon={<UserPlusIcon />}
            label="Invite people"
            disabled
            onClick={onInvite}
          />
          <MenuItem
            icon={<SettingsIcon />}
            label={isAdministrator ? "Guild settings" : "Guild settings (admin only)"}
            disabled={!isAdministrator}
            onClick={onSettings}
          />
          <div className="my-1 h-px bg-white/[0.06]" />
          <MenuItem
            icon={<LeaveIcon />}
            label="Leave guild"
            danger
            disabled={busy}
            onClick={onLeave}
          />
          {errorMessage && (
            <p
              role="alert"
              className="px-3 py-2 text-[11.5px] text-rose-300/90"
            >
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
        disabled
          ? "cursor-not-allowed text-white/30"
          : danger
            ? "text-rose-300/90 hover:bg-rose-400/[0.08]"
            : "text-white/80 hover:bg-white/[0.05]",
      )}
    >
      <span
        className={clsx(
          "shrink-0",
          danger ? "text-rose-300/80" : "text-white/45",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/* ---- inline icons (so we don't pull a whole icon library) -------------- */

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
