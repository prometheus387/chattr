"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

import type { Channel } from "@/types/client";

/**
 * Context menu for a channel row in the guild sidebar. Two
 * actions — Edit and Delete — both gated on `canManageChannels`
 * (the parent passes that; the server re-checks too). Opens
 * on left- or right-click on the row, anchored at the click
 * point.
 */
export function ChannelContextMenu({
  position,
  channel,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: {
  position: { x: number; y: number };
  channel: Channel;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [clamped, setClamped] = useState(position);
  const titleId = useId();

  // Clamp the menu inside the viewport so it never overflows
  // off-screen — same trick as the member context menu. We
  // measure after mount and shift up/left if needed.
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

  // Click outside + Escape close. We intentionally don't close
  // on the backdrop's mousedown — there is no backdrop here;
  // the menu is just a floating popover.
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

  if (!canManage) {
    return (
      <div
        ref={menuRef}
        role="menu"
        style={{ left: clamped.x, top: clamped.y }}
        className="auth-card-enter fixed z-[60] min-w-[200px] overflow-hidden rounded-md border border-white/[0.08] bg-[#16181d] py-1 shadow-2xl shadow-black/60"
        data-context-menu
      >
        <div className="px-3 py-2 text-[12px] text-white/40">
          You can't manage channels in this guild.
        </div>
      </div>
    );
  }

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
          #{channel.name}
        </div>
        <div className="truncate text-[10.5px] text-white/40">
          {channel.category ?? "Uncategorized"}
        </div>
      </div>
      <MenuItem
        label="Edit channel"
        icon={<EditIcon />}
        onClick={() => {
          onEdit();
          onClose();
        }}
      />
      <MenuItem
        label="Delete channel"
        icon={<TrashIcon />}
        danger
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
        danger
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

function EditIcon() {
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
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function TrashIcon() {
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
