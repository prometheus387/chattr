"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

import type { DmSummary } from "@/types/client";

/**
 * Context menu for a DM row in the friends sidebar. The
 * "Hide from list" action is client-only — there's no
 * backend endpoint to delete a DM (deleting a conversation
 * would also need to clear the other user's view, which
 * is a bigger design call), so we just filter the row out
 * of the local cache. The user can still receive a new
 * message from that person, which will re-add the row to
 * the list when the next list refresh runs.
 */
export function DmContextMenu({
  position,
  dm,
  onClose,
  onHide,
}: {
  position: { x: number; y: number };
  dm: DmSummary;
  onClose: () => void;
  onHide: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [clamped, setClamped] = useState(position);
  const titleId = useId();

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const x = Math.min(
        position.x,
        Math.max(margin, window.innerWidth - rect.width - margin),
      );
      const y = Math.min(
        position.y,
        Math.max(margin, window.innerHeight - rect.height - margin),
      );
      setClamped({ x, y });
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-labelledby={titleId}
      style={{ left: clamped.x, top: clamped.y }}
      className="auth-card-enter fixed z-[60] min-w-[200px] overflow-hidden rounded-md border border-white/[0.08] bg-[#16181d] py-1 shadow-2xl shadow-black/60"
      data-context-menu
    >
      <div className="border-b border-white/[0.06] px-3 py-2">
        <div className="truncate text-[12.5px] font-semibold text-white/90">
          {dm.otherDisplayName}
        </div>
        <div className="truncate text-[10.5px] text-white/40">@{dm.otherUsername}</div>
      </div>
      <MenuItem
        label="Hide from list"
        icon={<HideIcon />}
        onClick={() => {
          onHide();
          onClose();
        }}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/[0.05]"
    >
      <span className="shrink-0 text-white/45">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function HideIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={13}
      height={13}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
