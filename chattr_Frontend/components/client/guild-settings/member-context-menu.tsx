"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { GuildMember, GuildSummary, Role } from "@/types/client";

interface Props {
  /**
   * Anchor point in viewport coordinates. The menu opens at
   * this (x, y) and is clamped to the viewport so it never
   * overflows the right or bottom edge.
   */
  position: { x: number; y: number };
  member: GuildMember;
  guild: GuildSummary;
  /**
   * Current user's permission flags. The menu only shows
   * actions the user is allowed to take — kicking or banning
   * from a context where the actor lacks the permission is a
   * recipe for a 403 the user has to debug.
   */
  viewer: {
    canAssign: boolean;
    canKick: boolean;
    canBan: boolean;
  };
  /**
   * Set of user ids the current user is NOT allowed to
   * moderate. Built by the parent using the role hierarchy
   * (you can't kick someone at-or-above your own role).
   * Owners are always in this set.
   */
  untargetableIds: Set<number>;
  /**
   * The current user's own id, used to hide destructive
   * actions on yourself.
   */
  viewerUserId: number;
  /**
   * Roles in the guild. Required for the "Assign role" sub-sheet.
   */
  roles: Role[];
  onClose: () => void;
  /**
   * Called after any successful action. The parent uses this
   * to re-fetch the member list (or splice the change in
   * client-side).
   */
  onChanged: () => void;
}

/**
 * Right-click context menu for a guild member row. Renders as
 * a fixed-positioned popover at the click point, with up to
 * three actions: "Assign role", "Kick", "Ban". Destructive
 * actions (kick, ban) open a confirm modal before firing.
 *
 * The menu closes on:
 *   - clicking outside (mousedown on document)
 *   - Escape
 *   - picking an action (the action handler closes it)
 *
 * The menu never closes on its own while an async action is
 * in flight; the confirm modal handles its own busy state and
 * closes only when the action settles (success or failure).
 */
export function MemberContextMenu({
  position,
  member,
  guild,
  viewer,
  untargetableIds,
  viewerUserId,
  roles,
  onClose,
  onChanged,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [kicking, setKicking] = useState(false);
  const [banning, setBanning] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"kick" | "ban" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clamp position to viewport so the menu never overflows
  // off-screen. We measure the menu's size after mount via
  // ResizeObserver-ish tricks; simplest is to defer the
  // position adjustment to the next frame.
  const [clamped, setClamped] = useState(position);
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
    // We only want to run this on mount; subsequent position
    // changes are not supported (the menu is short-lived).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-outside + Escape close. We intentionally don't
  // close on Escape when a confirm dialog is open — the
  // confirm dialog has its own Escape handler.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      // Clicks on the confirm backdrop also count as "outside
      // the menu" — let the confirm handler decide.
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-context-menu-confirm]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !assignOpen && !confirmKind) onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, assignOpen, confirmKind]);

  const isOwner = member.isOwner;
  const isSelf = member.userId === viewerUserId;
  const isUntargetable = untargetableIds.has(member.userId);

  const canAssign = viewer.canAssign && !isOwner;
  const canKick = viewer.canKick && !isOwner && !isSelf && !isUntargetable;
  const canBan = viewer.canBan && !isOwner && !isSelf && !isUntargetable;

  const anyAction = canAssign || canKick || canBan;

  if (!anyAction) {
    return (
      <div
        ref={menuRef}
        role="menu"
        style={{ left: clamped.x, top: clamped.y }}
        className="auth-card-enter fixed z-[60] min-w-[200px] overflow-hidden rounded-md border border-white/[0.08] bg-[#16181d] py-1 shadow-2xl shadow-black/60"
        data-context-menu
      >
        <div className="px-3 py-2 text-[12px] text-white/40">
          You can't moderate this member.
        </div>
      </div>
    );
  }

  const onKick = async () => {
    setError(null);
    setKicking(true);
    try {
      await api.guildMembers.kick(guild.id, member.userId);
      setConfirmKind(null);
      onChanged();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to kick this member."
            : err.status === 409
              ? err.message
              : err.message || "Could not kick member."
          : "Network error.",
      );
    } finally {
      setKicking(false);
    }
  };

  const onBan = async () => {
    setError(null);
    setBanning(true);
    try {
      await api.guildBans.create(guild.id, { userId: member.userId });
      setConfirmKind(null);
      onChanged();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to ban this member."
            : err.status === 409
              ? err.message
              : err.message || "Could not ban member."
          : "Network error.",
      );
    } finally {
      setBanning(false);
    }
  };

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        style={{ left: clamped.x, top: clamped.y }}
        className="auth-card-enter fixed z-[60] min-w-[200px] overflow-hidden rounded-md border border-white/[0.08] bg-[#16181d] py-1 shadow-2xl shadow-black/60"
        data-context-menu
      >
        <MenuHeader name={member.displayName} sub={`@${member.username}`} />
        {canAssign ? (
          <MenuItem
            label="Assign role"
            icon={<AssignIcon />}
            onClick={() => setAssignOpen(true)}
          />
        ) : null}
        {canKick ? (
          <MenuItem
            label="Kick from guild"
            icon={<KickIcon />}
            danger
            onClick={() => setConfirmKind("kick")}
          />
        ) : null}
        {canBan ? (
          <MenuItem
            label="Ban from guild"
            icon={<BanIcon />}
            danger
            onClick={() => setConfirmKind("ban")}
          />
        ) : null}
      </div>

      {assignOpen ? (
        <RoleAssignSheet
          guild={guild}
          member={member}
          roles={roles}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => {
            setAssignOpen(false);
            onChanged();
            onClose();
          }}
        />
      ) : null}
      {confirmKind === "kick" ? (
        <ConfirmDialog
          kind="kick"
          member={member}
          busy={kicking}
          error={error}
          onCancel={() => {
            setConfirmKind(null);
            setError(null);
          }}
          onConfirm={onKick}
        />
      ) : null}
      {confirmKind === "ban" ? (
        <ConfirmDialog
          kind="ban"
          member={member}
          busy={banning}
          error={error}
          onCancel={() => {
            setConfirmKind(null);
            setError(null);
          }}
          onConfirm={onBan}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function MenuHeader({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="border-b border-white/[0.06] px-3 py-2">
      <div className="truncate text-[12.5px] font-semibold text-white/90">
        {name}
      </div>
      <div className="truncate text-[10.5px] text-white/40">{sub}</div>
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

/* -------------------------------------------------------------------------- */
/*  Confirm dialog (kick / ban)                                                 */
/* -------------------------------------------------------------------------- */

function ConfirmDialog({
  kind,
  member,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  kind: "kick" | "ban";
  member: GuildMember;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const isBan = kind === "ban";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-context-menu-confirm
    >
      <div className="auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70">
        <h3
          id={titleId}
          className="text-[16px] font-semibold text-white"
        >
          {isBan ? "Ban" : "Kick"} {member.displayName}?
        </h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
          {isBan
            ? "They'll be removed from the guild and blocked from rejoining via any future invite. You can lift the ban later from the bans list."
            : "They'll be removed from the guild and can rejoin later with a new invite."}
        </p>
        {error ? (
          <p
            role="alert"
            className="auth-shake mt-3 text-[11.5px] text-rose-300/95"
          >
            {error}
          </p>
        ) : null}
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
              {isBan ? "Ban member" : "Kick member"}
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
/*  Role-assign sheet (same shape as in members-tab, but scoped to the menu)  */
/* -------------------------------------------------------------------------- */

function RoleAssignSheet({
  guild,
  member,
  roles,
  onClose,
  onAssigned,
}: {
  guild: GuildSummary;
  member: GuildMember;
  roles: Role[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [pickedId, setPickedId] = useState<number>(member.roleId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isActorOwner = guild.isOwner;
  const actorRole = roles.find((r) => r.id === member.roleId);
  const actorIsAdmin = !!actorRole?.permissions.isAdministrator;
  const canMoveAnyone = isActorOwner || actorIsAdmin;
  const actorPosition = actorRole?.position ?? 0;

  const onSave = async () => {
    if (pickedId === member.roleId) {
      onClose();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.guildMembers.assignRole(guild.id, member.userId, pickedId);
      onAssigned();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "You can only assign roles below your own."
            : err.status === 409
              ? err.message
              : err.message || "Could not assign role."
          : "Network error.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!saving && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      data-context-menu-confirm
    >
      <div className="auth-card-enter w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70">
        <header className="border-b border-white/[0.06] px-6 py-4">
          <h3 className="text-[16px] font-semibold text-white">Assign role</h3>
          <p className="mt-0.5 text-[12px] text-white/45">
            <span className="text-white/75">{member.displayName}</span> is
            currently <span className="text-white/75">{member.roleName}</span>.
          </p>
        </header>
        <div className="px-6 py-5">
          <label className="mb-2 block text-[11.5px] font-medium uppercase tracking-wider text-white/45">
            New role
          </label>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-white/[0.06]">
            {[...roles]
              .sort((a, b) => b.position - a.position)
              .map((r) => {
                const disabled = !canMoveAnyone && r.position >= actorPosition;
                const selected = pickedId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPickedId(r.id)}
                    className={clsx(
                      "flex w-full items-center gap-2.5 border-b border-white/[0.04] px-3.5 py-2.5 text-left text-[13px] transition-colors last:border-b-0",
                      disabled
                        ? "cursor-not-allowed text-white/30"
                        : selected
                          ? "bg-white/[0.07] text-white"
                          : "text-white/75 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color || "#99aab5" }}
                    />
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="text-[10.5px] tabular-nums text-white/35">
                      #{r.position}
                    </span>
                  </button>
                );
              })}
          </div>
          {!canMoveAnyone ? (
            <p className="mt-2 text-[11px] text-white/40">
              You can only assign roles below your own. Roles at or above
              your current tier are disabled.
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="auth-shake mt-3 text-[11.5px] text-rose-300/95"
            >
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] bg-[#0a0b0e] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || pickedId === member.roleId}
            className="h-9 min-w-[100px] rounded-lg bg-white px-3.5 text-[12.5px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function AssignIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m17 11 2 2-4 4" />
    </svg>
  );
}

function KickIcon() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function BanIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="5" y1="5" x2="19" y2="19" />
    </svg>
  );
}
