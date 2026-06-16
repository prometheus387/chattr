"use client";

import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";

import { useAuth } from "@/contexts/auth-provider";
import { api } from "@/lib/api";
import { ApiError, type PublicUser } from "@/types/api";
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
 * reassign their role, or add a brand new member by username.
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
  const [adding, setAdding] = useState(false);
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
            Owners are pinned; everyone else can be reassigned.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="auth-input h-9 w-64 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white placeholder-white/30 outline-none"
          />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <PlusIcon />
            Add member
          </button>
        </div>
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
      {adding ? (
        <AddMemberModal
          guild={guild}
          roles={roles}
          existingMemberIds={new Set(members.map((m) => m.userId))}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
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
            canAssign: guild.isAdministrator || guild.canManageRoles,
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
  onAssign,
  onOpenMenu,
}: {
  member: GuildMember;
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
        {member.isOwner ? (
          <span className="text-[11px] uppercase tracking-wider text-emerald-300/80">
            Owner
          </span>
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
            Assign role
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
/*  Add member modal                                                           */
/* -------------------------------------------------------------------------- */

function AddMemberModal({
  guild,
  roles,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  guild: GuildSummary;
  roles: Role[];
  /**
   * Set of user ids already in the guild. We block the submit
   * button if the picked user is in here — the server would 409,
   * but a clearer inline message is friendlier.
   */
  existingMemberIds: Set<number>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const titleId = useId();
  const [username, setUsername] = useState("");
  const [picked, setPicked] = useState<PublicUser | null>(null);
  const [pickedRoleId, setPickedRoleId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Default the role picker to @everyone — the only safe choice
  // for users who shouldn't be promoted above the rest of the
  // guild on day one.
  useEffect(() => {
    const everyone = roles.find((r) => r.name === "@everyone");
    if (everyone) setPickedRoleId(everyone.id);
  }, [roles]);

  // Escape closes. We intentionally don't block on `saving`
  // here — the user can always cancel out of a hang.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const trimmed = username.trim();
  const alreadyInGuild = picked ? existingMemberIds.has(picked.id) : false;
  const canSubmit = !!picked && pickedRoleId !== null && !alreadyInGuild && !saving;

  const onLookup = async () => {
    if (!trimmed) return;
    setError(null);
    setPicked(null);
    setLooking(true);
    try {
      const user = await api.users.getByUsername(trimmed);
      if (!user) {
        setError(`No user named “${trimmed}” on the platform.`);
        return;
      }
      setPicked(user);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || "Lookup failed."
          : "Network error.",
      );
    } finally {
      setLooking(false);
    }
  };

  const onAdd = async () => {
    if (!picked || pickedRoleId === null) return;
    setError(null);
    setSaving(true);
    try {
      await api.guildMembers.add(guild.id, {
        userId: picked.id,
        roleId: pickedRoleId,
      });
      onAdded();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to add members to this guild."
            : err.status === 404
              ? "User or role not found."
              : err.status === 409
                ? "That user is already a member of this guild."
                : err.message || "Could not add member."
          : "Network error.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} closeDisabled={saving} maxWidth={480} labelledBy={titleId}>
      <header className="border-b border-white/[0.06] px-6 py-4">
        <h3 id={titleId} className="text-[16px] font-semibold text-white">
          Add member
        </h3>
        <p className="mt-0.5 text-[12px] text-white/45">
          Add an existing platform user to{" "}
          <span className="text-white/75">{guild.name}</span>. They'll appear
          in the member list immediately.
        </p>
      </header>

      <div className="space-y-4 px-6 py-5">
        <Field label="Username" hint="Case-insensitive. Exact match.">
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (picked) setPicked(null);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onLookup();
                }
              }}
              placeholder="e.g. alice"
              autoComplete="off"
              disabled={looking || saving}
              className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onLookup}
              disabled={!trimmed || looking}
              className="h-[42px] shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {looking ? "Looking…" : "Look up"}
            </button>
          </div>
        </Field>

        {picked ? (
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[13px] font-semibold text-[#0b0c0f]"
              style={{ backgroundColor: "#99aab5" }}
            >
              {picked.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={picked.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                (picked.displayName || picked.username).charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-white/90">
                {picked.displayName}
              </span>
              <span className="block truncate text-[11px] text-white/40">
                @{picked.username}
              </span>
            </span>
            {alreadyInGuild ? (
              <span className="rounded bg-amber-400/[0.12] px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-amber-200/90">
                Already a member
              </span>
            ) : null}
          </div>
        ) : null}

        {picked && !alreadyInGuild ? (
          <Field label="Role" hint="@everyone is the default for fresh joins.">
            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.06]">
              {[...roles]
                .sort((a, b) => b.position - a.position)
                .map((r) => {
                  const selected = pickedRoleId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setPickedRoleId(r.id)}
                      className={clsx(
                        "flex w-full items-center gap-2.5 border-b border-white/[0.04] px-3.5 py-2.5 text-left text-[13px] transition-colors last:border-b-0",
                        selected
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
          </Field>
        ) : null}

        {error ? (
          <p role="alert" className="auth-shake text-[11.5px] text-rose-300/95">
            {error}
          </p>
        ) : null}
      </div>

      <ModalFooter
        onCancel={onClose}
        cancelDisabled={saving}
        onSubmit={onAdd}
        submitDisabled={!canSubmit}
        submitLabel={saving ? "Adding…" : "Add to guild"}
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wider text-white/45">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11px] text-white/35">{hint}</p> : null}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
