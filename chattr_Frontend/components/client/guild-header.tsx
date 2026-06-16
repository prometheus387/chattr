"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

interface Props {
  guildName: string;
  isOwner: boolean;
  /**
   * True iff the current user has a role with IsAdministrator on
   * this guild (or is the owner). Drives the "Admin" label in
   * the header and unlocks the Overview tab of the settings modal.
   * @deprecated use `isAdministrator` / `canManageRoles` /
   *   `canManageChannels` flags together. Kept for now to avoid
   *   breaking existing call sites — the settings entry is enabled
   *   if ANY of the three is true.
   */
  isAdministrator?: boolean;
  /** Owner / admin may rename the guild. Opens Overview tab. */
  canManageGuild?: boolean;
  /** Manage roles / members. Opens Roles + Members tabs. */
  canManageRoles?: boolean;
  /** Manage channels. Opens Channels tab. */
  canManageChannels?: boolean;
  /**
   * True iff the current user can issue invite links for the
   * guild (owner / IsAdministrator / role with
   * CanCreateInvite). Enables the "Invite people" entry in
   * the dropdown.
   */
  canCreateInvite?: boolean;
  busy?: boolean;
  errorMessage?: string | null;
  /**
   * Called after the user confirms the leave-guild dialog. The
   * header awaits this so it can keep the dropdown open while
   * the API call is in flight (showing the `busy` spinner on
   * the confirm button) and only close the dropdown once the
   * promise resolves successfully. If the call throws / rejects,
   * the dropdown stays open and `errorMessage` should reflect
   * the failure.
   */
  onLeave: () => void | Promise<void>;
  /** Stub actions shown in the dropdown but not wired up yet. */
  onInvite?: () => void;
  /**
   * Opens the guild settings modal. Enabled when the user holds
   * at least one of `canManageGuild` / `canManageRoles` /
   * `canManageChannels` (or is an admin via the legacy
   * `isAdministrator` flag).
   */
  onSettings?: () => void;
}

/**
 * Discord-style guild-header. Click anywhere on the pill to toggle a
 * dropdown with a "Leave guild" action (functional) and a few placeholders
 * (invite / settings) so the menu doesn't feel sparse.
 *
 * The "Leave guild" entry opens a confirm dialog rather than firing
 * the request immediately — leaving is destructive and a single misclick
 * on a small dropdown target shouldn't kick you out. The confirm
 * awaits the parent's `onLeave` so the dropdown stays open during
 * the API call (with the button showing a busy spinner) and only
 * closes once the leave actually succeeded. On failure the dropdown
 * stays open so `errorMessage` remains visible to the user.
 */
export function GuildHeader({
  guildName,
  isOwner,
  isAdministrator = false,
  canManageGuild = false,
  canManageRoles = false,
  canManageChannels = false,
  canCreateInvite = false,
  busy,
  errorMessage,
  onLeave,
  onInvite,
  onSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape closes the menu. Escape only closes
  // the dropdown — if the confirm dialog is open it has its own
  // Escape handler and gets first dibs.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, confirming]);

  const onConfirmLeave = async () => {
    try {
      await onLeave();
      // Only close the dropdown on success — the parent updated
      // the selection to a different guild (or to friends), so
      // the whole header is about to be unmounted anyway. Closing
      // here is belt-and-suspenders.
      setOpen(false);
      setConfirming(false);
    } catch {
      // Parent is expected to set `errorMessage` on failure.
      // Keep both the dropdown and the confirm dialog closed —
      // re-opening the confirm lets the user retry, and the
      // error banner is right below the menu item.
      setConfirming(false);
    }
  };

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
          {(() => {
            // Invite is enabled if the user holds any of:
            //   - owner (universal bypass)
            //   - IsAdministrator on the role
            //   - CanCreateInvite on the role
            // Owners always qualify, so they're never locked
            // out of inviting someone to their own guild.
            const canInvite =
              isAdministrator || canCreateInvite;
            return (
              <MenuItem
                icon={<UserPlusIcon />}
                label="Invite people"
                disabled={!canInvite}
                onClick={onInvite}
              />
            );
          })()}
          {(() => {
            // Settings is enabled if the user holds ANY of the
            // management flags. Owners and admins always qualify.
            // The label hints at what the user can actually do,
            // not just at the legacy "admin" gate.
            const canOpenSettings =
              isAdministrator || canManageGuild || canManageRoles || canManageChannels;
            const label = isAdministrator
              ? "Guild settings"
              : canManageRoles && canManageChannels
                ? "Guild settings (mod)"
                : canManageRoles
                  ? "Guild settings — manage roles"
                  : canManageChannels
                    ? "Guild settings — manage channels"
                    : "Guild settings";
            return (
              <MenuItem
                icon={<SettingsIcon />}
                label={label}
                disabled={!canOpenSettings}
                onClick={onSettings}
              />
            );
          })()}
          <div className="my-1 h-px bg-white/[0.06]" />
          <MenuItem
            icon={<LeaveIcon />}
            label="Leave guild"
            danger
            disabled={busy}
            onClick={() => setConfirming(true)}
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

      {confirming ? (
        <LeaveGuildConfirm
          guildName={guildName}
          busy={!!busy}
          onCancel={() => setConfirming(false)}
          onConfirm={onConfirmLeave}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Leave-guild confirm dialog                                                 */
/* -------------------------------------------------------------------------- */

function LeaveGuildConfirm({
  guildName,
  busy,
  onCancel,
  onConfirm,
}: {
  guildName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const titleId = useId();
  // Close on Escape. We intentionally DON'T block on busy: the
  // user might want to bail out of a hang. The parent keeps the
  // dropdown open either way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70">
        <h2
          id={titleId}
          className="text-[18px] font-semibold tracking-tight text-white"
        >
          Leave {guildName}?
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
          You'll stop seeing messages from this guild. You can rejoin later
          with a valid invite link.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="group relative inline-flex h-9 min-w-[100px] items-center justify-center gap-2 overflow-hidden rounded-lg bg-rose-400/[0.12] px-3.5 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-400/[0.20] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={clsx("flex items-center gap-2", busy && "opacity-0")}>
              Leave guild
            </span>
            {busy ? (
              <span
                aria-hidden
                className="auth-spinner absolute inset-0 m-auto h-3.5 w-3.5 rounded-full border-2 border-rose-200/30 border-t-rose-200"
              />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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
