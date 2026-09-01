"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

import { useAuth } from "@/contexts/auth-provider";
import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { GuildMember, GuildSummary, Role } from "@/types/client";
import { MemberContextMenu } from "./member-context-menu";

interface Props {
  guild: GuildSummary;
  members: GuildMember[] | null;
  roles: Role[] | null;
  /**
   * Called after any successful mutation so the parent can
   * re-fetch its caches. We don't try to splice the changes
   * in-place — server renumbering on position changes would
   * make that fragile.
   */
  onDataChanged: () => void;
}

/**
 * Members tab: list every member of the guild, search them,
 * reassign their role. New members join through an invite so
 * they always consent to joining the guild.
 * Owners always pass the server's hierarchy check; non-owner
 * admins can only assign roles strictly below their own.
 *
 * The actor's current role sits at the top of every dropdown's
 * "disallowed" list — picking it would be a no-op, and picking
 * anything above it would 403. The server still re-checks, so
 * a stale tab from a demoted admin surfaces the 403 inline.
 */
export function MembersTab({ guild, members, roles, onDataChanged }: Props) {
  const auth = useAuth();
  const viewerId = auth.user?.id ?? -1;
  const [assigning, setAssigning] = useState<GuildMember | null>(null);
  const [search, setSearch] = useState("");
  // Right-click menu anchor. `null` = closed. We capture the
  // viewport coordinates at the moment of the contextmenu
  // event (e.clientX / e.clientY) so the menu pops up exactly
  // under the cursor.
  const [contextMenu, setContextMenu] = useState<
    | { member: GuildMember; x: number; y: number }
    | null
  >(null);

  // Resolve the viewer's own role + position so we can decide
  // who they can moderate. The viewer is the authenticated
  // user (`auth.user.id`); we look them up in the cached
  // `members` list. If for some reason the row isn't there
  // yet, we fall back to "you can do nothing".
  const viewerMember = useMemo(
    () => (members ?? []).find((m) => m.userId === viewerId) ?? null,
    [members, viewerId],
  );
  const viewerRole = useMemo(
    () => (viewerMember ? (roles ?? []).find((r) => r.id === viewerMember.roleId) ?? null : null),
    [viewerMember, roles],
  );
  const viewerIsAdmin =
    !!viewerRole?.permissions.isAdministrator || guild.isAdministrator;
  const viewerCanMoveAnyone = guild.isOwner || viewerIsAdmin;
  const viewerPosition = viewerRole?.position ?? 0;

  // Build the set of user-ids the viewer is NOT allowed to
  // kick / ban. Owners always qualify. Everyone at-or-above
  // the viewer's own tier is off-limits unless the viewer
  // is an owner / admin (those roles bypass hierarchy).
  const untargetableIds = useMemo(() => {
    const out = new Set<number>();
    if (!members || !roles) return out;
    for (const m of members) {
      if (m.isOwner) {
        out.add(m.userId);
        continue;
      }
      if (viewerCanMoveAnyone) continue;
      const mRole = roles.find((r) => r.id === m.roleId);
      if (!mRole) continue;
      if (mRole.position >= viewerPosition) out.add(m.userId);
    }
    return out;
  }, [members, roles, viewerCanMoveAnyone, viewerPosition]);

  const filtered = useMemo(() => {
    if (!members) return null;
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q),
    );
  }, [members, search]);

  if (members === null || roles === null) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-white/45">
        <span
          aria-hidden
          className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-white/15 border-t-white/60"
        />
        Loading members…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] leading-relaxed text-white/45">
            {members.length} {members.length === 1 ? "member" : "members"}.
            Owners stay protected and can reassign their own role.
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="auth-input h-9 w-64 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white placeholder-white/30 outline-none"
        />
      </header>

      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-white/[0.06] bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-2.5">Member</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5 w-20">Joined</th>
              <th className="px-4 py-2.5 text-right w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(filtered ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-[12.5px] text-white/40"
                >
                  {search ? `No members match “${search}”.` : "No members."}
                </td>
              </tr>
            ) : (
              (filtered ?? []).map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  canAssignOwner={guild.isOwner && m.userId === viewerId}
                  onAssign={() => setAssigning(m)}
                  onOpenMenu={(x, y) =>
                    setContextMenu({ member: m, x, y })
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {assigning ? (
        <RoleAssignSheet
          guild={guild}
          member={assigning}
          roles={roles}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null);
            onDataChanged();
          }}
        />
      ) : null}
      {contextMenu ? (
        <MemberContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          member={contextMenu.member}
          guild={guild}
          roles={roles}
          untargetableIds={untargetableIds}
          viewerUserId={viewerId}
          viewer={{
            // The "assign role" entry is gated by the tab's
            // overall permission to manage roles, not by per-
            // member hierarchy. We re-use the role-assign sheet
            // inside the menu, which itself does the hierarchy
            // check for the per-target case.
            canAssign: guild.isOwner || guild.isAdministrator || guild.canManageRoles,
            canKick: guild.canKickMembers,
            canBan: guild.canBanMembers,
          }}
          onClose={() => setContextMenu(null)}
          onChanged={onDataChanged}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function MemberRow({
  member,
  canAssignOwner,
  onAssign,
  onOpenMenu,
}: {
  member: GuildMember;
  canAssignOwner: boolean;
  onAssign: () => void;
  /**
   * Open the per-guild context menu for this member. The
   * tab receives both left and right click through this —
   * the page-level menu, when shown, presents the same
   * affordances either way. Right click is what most users
   * try first; left click is the explicit "make it
   * discoverable" affordance.
   */
  onOpenMenu: (x: number, y: number) => void;
}) {
  const initial = (member.displayName || member.username).charAt(0).toUpperCase();
  const joined = new Date(member.joinedAt).toISOString().slice(0, 10);
  return (
    <tr
      // onMouseDown (not onClick) so the click fires before
      // the browser starts a text selection on the table
      // cells. Without this the user's left click would
      // either do nothing (selection swallows it) or, on
      // the next right-click, surface the browser's
      // "Copy / Paste" native menu instead of our own
      // context menu. `select-none` is a belt-and-suspenders
      // guard against double-click selection leaving a
      // highlighted name behind.
      className="cursor-pointer select-none border-b border-white/[0.04] last:border-b-0 transition-colors hover:bg-white/[0.04]"
      onMouseDown={(e) => {
        // Only react to left button — middle / right click
        // is handled by the matching onContextMenu handler.
        if (e.button !== 0) return;
        onOpenMenu(e.clientX, e.clientY);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e.clientX, e.clientY);
      }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-semibold text-[#0b0c0f]"
            style={{ backgroundColor: member.roleColor || "#99aab5" }}
          >
            {member.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-white/90">
              {member.displayName}
            </span>
            <span className="block truncate text-[11px] text-white/40">
              @{member.username}
            </span>
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-white/75">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: member.roleColor || "#99aab5" }}
          />
          {member.roleName}
        </span>
      </td>
      <td className="px-4 py-3 tabular-nums text-white/45">{joined}</td>
      <td className="px-4 py-3 text-right">
        {member.isOwner && !canAssignOwner ? (
          <span className="text-[11px] uppercase tracking-wider text-emerald-300/80">Owner</span>
        ) : (
          <button
            type="button"
            // Stop the row's onMouseDown from also firing
            // when the user clicks the dedicated "Assign
            // role" button — the row opens the context
            // menu, the button opens the dedicated assign
            // sheet.
            onMouseDown={(e) => {
              e.stopPropagation();
              onAssign();
            }}
            // Suppress the native context menu on the
            // button itself (the row handles right-click).
            onContextMenu={(e) => e.preventDefault()}
            className="rounded-md px-2 py-1 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            {member.isOwner ? "Assign own role" : "Assign role"}
          </button>
        )}
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*  Assign role sheet (existing member)                                        */
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

  // Find the actor's own role so we can disable anything
  // at-or-above it (the server will reject with 403). Owners
  // get the universal bypass — the dropdown stays fully open.
  const actorPosition = useMemo(() => {
    const me = roles.find((r) => r.id === member.roleId);
    return me?.position ?? 0;
  }, [roles, member.roleId]);

  const isActorOwner = guild.isOwner;
  const actorRole = roles.find((r) => r.id === member.roleId);
  const actorIsAdmin = !!actorRole?.permissions.isAdministrator;
  const canMoveAnyone = isActorOwner || actorIsAdmin;

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
    <ModalShell onClose={onClose} closeDisabled={saving} maxWidth={440}>
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
          <p role="alert" className="auth-shake mt-3 text-[11.5px] text-rose-300/95">
            {error}
          </p>
        ) : null}
      </div>
      <ModalFooter
        onCancel={onClose}
        cancelDisabled={saving}
        onSubmit={onSave}
        submitDisabled={saving || pickedId === member.roleId}
        submitLabel={saving ? "Saving…" : "Save"}
      />
    </ModalShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Reusable modal chrome                                                      */
/* -------------------------------------------------------------------------- */

function ModalShell({
  children,
  onClose,
  closeDisabled,
  maxWidth = 480,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  maxWidth?: number;
  labelledBy?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!closeDisabled && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="auth-card-enter w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalFooter({
  onCancel,
  cancelDisabled,
  onSubmit,
  submitDisabled,
  submitLabel,
}: {
  onCancel: () => void;
  cancelDisabled?: boolean;
  onSubmit: () => void;
  submitDisabled?: boolean;
  submitLabel: string;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] bg-[#0a0b0e] px-6 py-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelDisabled}
        className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className="h-9 min-w-[110px] rounded-lg bg-white px-3.5 text-[12.5px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90 disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </footer>
  );
}
