"use client";

import { useEffect, useId, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent } from "react";
import clsx from "clsx";

import { api } from "@/lib/api";
import { ApiError, type RolePermissions } from "@/types/api";
import type { GuildSummary, Role } from "@/types/client";

interface Props {
  guild: GuildSummary;
  roles: Role[] | null;
  /**
   * The role id of the currently-authenticated user, if we
   * know it. When set, the row matching this id is locked
   * against edit / delete — the server enforces the same
   * rule (see RoleHandlers.UpdateRole / DeleteRole), and
   * a non-owner admin shouldn't be able to demote themselves
   * by tweaking their own role. Owners are exempt.
   */
  currentUserRoleId: number | null;
  /**
   * Called after any successful create / update / delete so the
   * parent can re-fetch its caches. We don't try to splice the
   * changes in-place — server renumbering on position changes
   * would make that fragile.
   */
  onDataChanged: () => void;
}

/**
 * Roles tab: list the guild's roles in hierarchy order, create
 * new ones, edit name / colour / permissions, and delete the
 * ones nobody holds. The user reorders the hierarchy by
 * dragging the rows up and down — there's no position input
 * anywhere in the UI; the drag handler computes the new
 * position and the server renumbers the rest.
 *
 * The owner is the universal bypass in `GuildPermissionService`,
 * so they can move / delete / edit any role including @everyone.
 * Non-owner admins can only touch roles strictly below their
 * own — the server enforces that, but we hide the actions
 * client-side so the user doesn't see a button that 403s.
 */
export function RolesTab({ guild, roles, currentUserRoleId, onDataChanged }: Props) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  // Drag state for hierarchy reordering. We track the
  // currently-dragged role id and the drop target's
  // "before" / "after" position so the visual cue (a
  // 1px line above or below the target row) lines up with
  // where the dragged row will actually land.
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<
    | { roleId: number; position: "before" | "after" }
    | null
  >(null);

  if (roles === null) {
    return <LoadingState label="Loading roles…" />;
  }

  // ---- Drag handlers ----------------------------------------------------
  const onDragStart = (role: Role, e: ReactDragEvent<HTMLTableRowElement>) => {
    if (role.name === "@everyone") {
      // @everyone is locked at position 0 — there's no
      // meaningful "above" it. We refuse the drag outright
      // so the cursor stays a default arrow, not a grab.
      e.preventDefault();
      return;
    }
    setDraggingId(role.id);
    e.dataTransfer.setData("application/x-chattr-role-id", String(role.id));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const onDragOverRole = (
    role: Role,
    position: "before" | "after",
    e: ReactDragEvent<HTMLTableRowElement>,
  ) => {
    if (draggingId === null || draggingId === role.id) return;
    // Dropping above @everyone is allowed — @everyone is
    // pinned to position 0 but new rows can land above it
    // visually (they just get renumbered to position 10+).
    // The server handles the actual position math.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget((prev) => {
      if (prev?.roleId === role.id && prev.position === position) return prev;
      return { roleId: role.id, position };
    });
  };

  const onDropRole = async (role: Role, e: ReactDragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    if (draggingId === null) return;
    const position =
      dropTarget?.roleId === role.id ? dropTarget.position : "before";
    const dragged = roles.find((r) => r.id === draggingId);
    if (!dragged || dragged.id === role.id) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    // Compute the absolute target position from the
    // current list. The server renumbers everyone else
    // to a gap-of-10 grid on its end.
    const list = roles;
    const targetIndex = list.findIndex((r) => r.id === role.id);
    if (targetIndex < 0) return;
    const insertAt = position === "before" ? targetIndex : targetIndex + 1;
    try {
      await api.guildRoles.update(guild.id, dragged.id, {
        position: insertAt,
      });
      onDataChanged();
    } catch (err) {
      // Best-effort: surface the error and let the user
      // try again. We don't roll back the local state
      // because the server is the source of truth — the
      // next onDataChanged will reconcile.
      alert(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to reorder roles here."
            : err.message || "Could not reorder role."
          : "Network error.",
      );
    } finally {
      setDraggingId(null);
      setDropTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] leading-relaxed text-white/45">
            {roles.length} {roles.length === 1 ? "role" : "roles"} in this
            guild. Drag rows to re-order the hierarchy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={clsx(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 text-[12.5px] font-medium text-white/85 transition-colors",
            "hover:bg-white/[0.08] hover:text-white",
          )}
        >
          <PlusIcon />
          New role
        </button>
      </header>

      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            <col className="w-[36%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[20%]" />
            <col />
          </colgroup>
          <thead className="border-b border-white/[0.06] bg-white/[0.02] text-[10.5px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Colour</th>
              <th className="px-4 py-2.5">Display</th>
              <th className="px-4 py-2.5">Members</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              // The actor's own role is locked: even an admin
              // can't edit their own role (the server enforces
              // this with a 400 + a dedicated message; here we
              // just disable the buttons so the user never sees
              // a click that was going to fail). Owners are
              // exempt — they need to be able to manage
              // their own role.
              const isOwnRole =
                currentUserRoleId !== null && r.id === currentUserRoleId;
              const canEdit = !isOwnRole || guild.isOwner;
              return (
                <RoleRow
                  key={r.id}
                  role={r}
                  isOwner={guild.isOwner}
                  isDragging={draggingId === r.id}
                  dropIndicator={
                    dropTarget?.roleId === r.id ? dropTarget.position : null
                  }
                  // We still hand the row its onEdit /
                  // onDelete callbacks — the row will guard
                  // them itself based on canEdit. The
                  // callback would no-op anyway because the
                  // server would reject, but disabling the
                  // button is the visible affordance.
                  isOwnRole={isOwnRole}
                  canEdit={canEdit}
                  onEdit={() => setEditing(r)}
                  onDelete={() => setDeleting(r)}
                  onDragStart={(e) => onDragStart(r, e)}
                  onDragEnd={onDragEnd}
                  onDragOverBefore={(e) => onDragOverRole(r, "before", e)}
                  onDragOverAfter={(e) => onDragOverRole(r, "after", e)}
                  onDrop={(e) => onDropRole(r, e)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {creating ? (
        <RoleEditModal
          mode="create"
          guild={guild}
          onClose={() => setCreating(false)}
          onSaved={onDataChanged}
        />
      ) : null}
      {editing ? (
        <RoleEditModal
          mode="edit"
          guild={guild}
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={onDataChanged}
        />
      ) : null}
      {deleting ? (
        <DeleteRoleConfirm
          role={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.guildRoles.delete(guild.id, deleting.id);
              setDeleting(null);
              onDataChanged();
            } catch (err) {
              alert(
                err instanceof ApiError
                  ? err.status === 409
                    ? `${err.message} Reassign them first.`
                    : err.status === 400
                      ? err.message
                      : "Could not delete role."
                  : "Network error.",
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row                                                                       */
/* -------------------------------------------------------------------------- */

interface RoleRowProps {
  role: Role;
  isOwner: boolean;
  isDragging: boolean;
  /**
   * `'before'` / `'after'` when this row is the active drop
   * target, null otherwise. The row renders a 1px line above
   * or below itself to communicate the insertion point.
   */
  dropIndicator: "before" | "after" | null;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (e: ReactDragEvent<HTMLTableRowElement>) => void;
  onDragEnd: () => void;
  onDragOverBefore: (e: ReactDragEvent<HTMLTableRowElement>) => void;
  onDragOverAfter: (e: ReactDragEvent<HTMLTableRowElement>) => void;
  onDrop: (e: ReactDragEvent<HTMLTableRowElement>) => void;
}

function RoleRow({
  role,
  isOwner,
  isDragging,
  dropIndicator,
  isOwnRole,
  canEdit,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverBefore,
  onDragOverAfter,
  onDrop,
}: RoleRowProps & {
  /**
   * True iff this row is the role the current viewer is
   * sitting on. Drives the "you" badge and the disabled
   * state on edit / delete. The row is also marked
   * non-draggable when this is true (you can't reorder
   * your own role out from under yourself; the server
   * would also reject the move).
   */
  isOwnRole: boolean;
  /**
   * Convenience flag combining `isOwnRole` and the user's
   * owner status — false means the buttons are disabled
   * with a "you can't edit your own role" hint.
   */
  canEdit: boolean;
}) {
  const isEveryone = role.name === "@everyone";
  // Drag-source rules:
  //   - @everyone is locked at position 0 (server-enforced)
  //   - the actor's own role is locked (they can't reorder
  //     themselves out of the hierarchy)
  // Owners can move their own role.
  const draggable = !isEveryone && (isOwner || !isOwnRole);
  return (
    <tr
      // Drop-zones are split top-half / bottom-half via
      // the row's bounding rect midpoint, the same way
      // the channel sidebar does it.
      onDragOver={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) onDragOverBefore(e);
        else onDragOverAfter(e);
      }}
      onDrop={onDrop}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={clsx(
        "relative border-b border-white/[0.04] last:border-b-0 transition-colors",
        draggable
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-default",
        isDragging && "opacity-40",
        // `select-none` keeps a row from getting half-selected
        // mid-drag, which would otherwise surface the
        // browser's native drag-image text instead of our
        // visual cue.
        "select-none",
      )}
    >
      {dropIndicator === "before" ? (
        <td
          aria-hidden
          colSpan={5}
          className="pointer-events-none absolute -top-px left-0 right-0 h-[2px] bg-emerald-400 p-0"
        />
      ) : null}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-[11px] font-semibold text-[#0b0c0f]"
            style={{ backgroundColor: role.color || "#99aab5" }}
          >
            {role.iconSvg ? (
              <span
                className="h-3.5 w-3.5"
                // role.IconSvg is sanitized server-side — see SvgSanitizer
                dangerouslySetInnerHTML={{ __html: role.iconSvg }}
              />
            ) : (
              role.name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="truncate text-white/90">{role.name}</span>
          {isEveryone ? (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/45">
              default
            </span>
          ) : null}
          {isOwnRole ? (
            <span
              // "you" badge — marks the row as the actor's
              // current role. The `you`-class colour stays
              // neutral (white) so it doesn't compete with
              // the role-colour cue on the name.
              className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/75"
            >
              you
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-2 text-white/65">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-white/[0.08]"
            style={{ backgroundColor: role.color || "#99aab5" }}
          />
          <span className="font-mono text-[11.5px] text-white/55">
            {role.color || "#99aab5"}
          </span>
        </span>
      </td>
      <td className="px-4 py-3 text-white/55">
        {role.displaySeparately ? "Separate" : "Folded"}
      </td>
      <td className="px-4 py-3 text-white/55">
        {/* Count would need an extra query; we leave it
            blank here rather than show stale data. The
            per-section headers in the user sidebar give
            the user the count they actually want. */}
        <span className="text-white/30">—</span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={!canEdit}
            title={
              canEdit
                ? undefined
                : "You can't edit the role you're currently a member of."
            }
            className={clsx(
              "rounded-md px-2 py-1 text-[12px] transition-colors",
              canEdit
                ? "text-white/70 hover:bg-white/[0.06] hover:text-white"
                : "cursor-not-allowed text-white/30",
            )}
          >
            Edit
          </button>
          {!isEveryone && isOwner ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-2 py-1 text-[12px] text-rose-300/80 transition-colors hover:bg-rose-400/[0.08] hover:text-rose-200"
            >
              Delete
            </button>
          ) : null}
        </div>
      </td>
      {dropIndicator === "after" ? (
        <td
          aria-hidden
          colSpan={5}
          className="pointer-events-none absolute -bottom-px left-0 right-0 h-[2px] bg-emerald-400 p-0"
        />
      ) : null}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/*  Create / Edit modal                                                       */
/* -------------------------------------------------------------------------- */

interface EditProps {
  mode: "create" | "edit";
  guild: GuildSummary;
  role?: Role;
  onClose: () => void;
  onSaved: () => void;
}

const PERMISSION_FIELDS: Array<{
  key: keyof RolePermissions;
  label: string;
  description: string;
}> = [
  { key: "isAdministrator", label: "Administrator", description: "Full control of the guild and all roles below." },
  { key: "canManageRoles", label: "Manage roles", description: "Create, edit, and assign roles strictly below this one." },
  { key: "canManageChannels", label: "Manage channels", description: "Create, rename, and delete channels." },
  { key: "canCreateInvite", label: "Create invite", description: "Issue invite links for the guild." },
  { key: "canDeleteMessages", label: "Delete messages", description: "Remove messages posted by other members." },
  { key: "canBanMembers", label: "Ban members", description: "Permanently remove a member from the guild." },
  { key: "canKickMembers", label: "Kick members", description: "Remove a member. They can rejoin later with a new invite." },
  { key: "canMuteMembers", label: "Mute members", description: "Prevent a member from sending messages." },
  { key: "canDeafenMembers", label: "Deafen members", description: "Prevent a member from seeing messages in voice." },
  { key: "canTimeoutMembers", label: "Timeout members", description: "Temporarily restrict a member's activity." },
  { key: "canChangeOwnNickname", label: "Change own nickname", description: "Allow this role's members to set their own nickname." },
  { key: "canChangeNickName", label: "Change others' nickname", description: "Edit another member's nickname." },
  { key: "bypassSlowmode", label: "Bypass slowmode", description: "Send messages without waiting on slowmode." },
];

function RoleEditModal({ mode, guild, role, onClose, onSaved }: EditProps) {
  const titleId = useId();
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState(role?.color ?? "#99aab5");
  const [displaySeparately, setDisplaySeparately] = useState(
    role?.displaySeparately ?? false,
  );
  // We keep TWO copies of the per-flag state:
  //   - `perms`         : what the form is currently showing
  //   - `rememberedPerms`: a snapshot of the granular state from
  //                        BEFORE the user enabled Administrator.
  // Why both: while Administrator is on, the granular flags are
  // visually forced to `true` (admin implies everything). But
  // un-checking Administrator should restore whatever the user
  // had set before — not wipe the form to all-false. The
  // remembered snapshot is what we restore from.
  const initialPerms: RolePermissions = role?.permissions ?? {
    isAdministrator: false,
    canManageRoles: false,
    canCreateInvite: false,
    canManageChannels: false,
    canDeleteMessages: false,
    canBanMembers: false,
    canKickMembers: false,
    canMuteMembers: false,
    canDeafenMembers: false,
    canTimeoutMembers: false,
    canChangeOwnNickname: false,
    canChangeNickName: false,
    bypassSlowmode: false,
  };
  const [perms, setPerms] = useState<RolePermissions>(initialPerms);
  const [rememberedPerms, setRememberedPerms] =
    useState<RolePermissions>(initialPerms);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= 50;
  const isEveryone = role?.name === "@everyone";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameValid) {
      setError("Role name is required (1–50 characters).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        await api.guildRoles.create(guild.id, {
          name: trimmedName,
          color,
          displaySeparately,
          permissions: perms,
        });
      } else if (role) {
        // Position is intentionally NOT in this payload —
        // hierarchy is changed via drag in the role list, not
        // typed here. The role keeps its existing position.
        await api.guildRoles.update(guild.id, role.id, {
          name: trimmedName,
          color,
          displaySeparately,
          permissions: perms,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 403
            ? "You don't have permission to edit this role."
            : err.message || "Could not save changes."
          : "Network error.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!saving && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="auth-card-enter flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70"
      >
        <header className="border-b border-white/[0.06] px-6 py-4">
          <h3 id={titleId} className="text-[16px] font-semibold text-white">
            {mode === "create" ? "New role" : `Edit ${role?.name}`}
          </h3>
          <p className="mt-0.5 text-[12px] text-white/45">
            {isEveryone
              ? "@everyone is the default tier. The name and position are locked."
              : "Permission flags take effect immediately on save. Drag the row in the list to re-order."}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Role name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                disabled={isEveryone || saving}
                className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none disabled:opacity-60"
              />
            </Field>
            <Field label="Colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={saving}
                  className="h-9 w-12 cursor-pointer rounded border border-white/[0.08] bg-transparent"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={saving}
                  className="auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-[12.5px] text-white outline-none"
                />
              </div>
            </Field>
            <Field label="Display separately">
              <label className="flex h-[42px] cursor-pointer items-center gap-2 text-[12.5px] text-white/70">
                <input
                  type="checkbox"
                  checked={displaySeparately}
                  onChange={(e) => setDisplaySeparately(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-white/[0.12] bg-white/[0.04] text-emerald-400 focus:ring-emerald-400/30"
                />
                Members with this role get their own group in the sidebar.
              </label>
            </Field>
          </div>

          <div className="mt-6">
            <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-white/45">
              Permissions
            </h4>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PERMISSION_FIELDS.map((f) => {
                const key = f.key as keyof RolePermissions;
                // Administrator is the catch-all permission — if it's
                // checked, every other flag is implicitly on. We hide
                // that from the form by locking the other toggles:
                //   - visually disabled (cursor + dimmed colour)
                //   - non-clickable (button is a span, not a button)
                //   - forced to `true` so the save payload still
                //     reflects "this role has full power"
                // When the user un-checks Administrator, the other
                // toggles snap back to their previous values, so
                // promoting a role to admin and then demoting it
                // doesn't silently wipe the granular settings.
                const isAdminFlag = f.key === "isAdministrator";
                const lockedByAdmin = perms.isAdministrator && !isAdminFlag;
                const remembered = rememberedPerms[key];
                const effectiveChecked = lockedByAdmin
                  ? true
                  : isAdminFlag
                    ? perms.isAdministrator
                    : remembered;
                return (
                  <PermToggle
                    key={f.key}
                    label={f.label}
                    description={
                      lockedByAdmin
                        ? `${f.description} (Implied by Administrator.)`
                        : f.description
                    }
                    checked={effectiveChecked}
                    disabled={
                      saving ||
                      (f.key === "isAdministrator" && isEveryone) ||
                      lockedByAdmin
                    }
                    locked={lockedByAdmin}
                    onChange={(v) => {
                      if (isAdminFlag) {
                        // Toggling the master permission: when turning
                        // it ON, freeze the current per-flag values
                        // (they'll be implied from now on). When
                        // turning it OFF, restore from the remembered
                        // snapshot so we don't lose what the user set
                        // before they promoted the role.
                        setPerms((prev: RolePermissions) => {
                          if (v) {
                            // Snapshot current state, then flip admin
                            // on. Subsequent re-renders will read
                            // from the snapshot for the granular flags.
                            setRememberedPerms({ ...prev });
                            return { ...prev, isAdministrator: true };
                          }
                          // Restore the snapshot for granular flags;
                          // admin itself becomes false.
                          const restored = { ...rememberedPerms, isAdministrator: false };
                          return restored;
                        });
                        return;
                      }
                      setRememberedPerms((prev) => ({ ...prev, [key]: v }));
                      setPerms((prev: RolePermissions) => ({ ...prev, [key]: v }));
                    }}
                  />
                );
              })}
            </div>
            {perms.isAdministrator ? (
              <p className="mt-2 text-[11px] text-white/40">
                Administrator implies every other permission. Individual
            flags are locked while this is on — uncheck Administrator
            to edit them again. To re-order the hierarchy, drag the
            row in the role list.
              </p>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="auth-shake mt-4 text-[11.5px] text-rose-300/95"
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
            type="submit"
            disabled={!nameValid || saving}
            className="h-9 min-w-[100px] rounded-lg bg-white px-3.5 text-[12.5px] font-medium text-[#0b0c0f] transition-colors hover:bg-white/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "create" ? "Create role" : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
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

function PermToggle({
  label,
  description,
  checked,
  disabled,
  locked = false,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  /**
   * Set when the toggle is forced on by another flag (currently
   * only Administrator). Visually demotes the row (dimmer text,
   * no pointer cursor) and removes the checkbox's change handler
   * — the user can't un-check it, only un-check the flag that
   * locked it. A small padlock glyph is added so the lock is
   * obvious at a glance.
   */
  locked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={clsx(
        "flex items-start gap-2.5 rounded-lg border bg-white/[0.02] px-3 py-2.5 transition-colors",
        locked
          ? "cursor-not-allowed border-white/[0.04] opacity-70"
          : disabled
            ? "cursor-not-allowed border-white/[0.06] opacity-60"
            : "cursor-pointer border-white/[0.06] hover:bg-white/[0.04]",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || locked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/[0.12] bg-white/[0.04] text-emerald-400 focus:ring-emerald-400/30 disabled:cursor-not-allowed"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-white/85">
          <span className="truncate">{label}</span>
          {locked ? (
            <svg
              viewBox="0 0 24 24"
              width={11}
              height={11}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-white/35"
              aria-label="Locked by Administrator"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : null}
        </span>
        <span className="block text-[11px] leading-relaxed text-white/40">
          {description}
        </span>
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/*  Delete confirmation                                                       */
/* -------------------------------------------------------------------------- */

function DeleteRoleConfirm({
  role,
  onCancel,
  onConfirm,
}: {
  role: Role;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70">
        <h3 className="text-[16px] font-semibold text-white">Delete role</h3>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
          <span className="text-white/85">{role.name}</span> will be removed
          for everyone. Any member still holding it must be reassigned first.
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
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="h-9 rounded-lg bg-rose-400/[0.12] px-3.5 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-400/[0.20] disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete role"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-white/45">
      <span
        aria-hidden
        className="auth-spinner h-3.5 w-3.5 rounded-full border-2 border-white/15 border-t-white/60"
      />
      {label}
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
