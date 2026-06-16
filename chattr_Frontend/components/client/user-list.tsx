"use client";

import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import clsx from "clsx";
import type { GuildMember, Role, UserPresence } from "@/types/client";
import { isOnline } from "@/lib/presence";
import type { ViewerPermissions } from "./message-list";

interface Props {
  /** Members of the current guild, with their role metadata. */
  members: GuildMember[];
  /** Roles in the guild; we use displaySeparately to decide
   *  which roles get their own section in the sidebar. */
  roles: Role[];
  /** Platform-wide presence list (from /api/presence/users) so
   *  each member row can show an online/offline dot. */
  presences: UserPresence[];
  /** When true, show offline users too. Otherwise hide them. */
  showOffline: boolean;
  className?: string;
  /**
   * Members the viewer is not allowed to moderate. Used to
   * gate the click handler so the cursor and affordances are
   * only "active" for actually-targetable users.
   */
  untargetableIds?: Set<number>;
  viewerUserId?: number;
  viewer?: ViewerPermissions;
  /**
   * Activate the page-level context menu for a member. Both
   * left and right click route through this — see the matching
   * hookup in `MessageList`.
   */
  onMemberAction?: (
    member: GuildMember,
    x: number,
    y: number,
  ) => void;
}

/**
 * User sidebar for a guild. Renders one section per role with
 * <c>displaySeparately=true</c> (in role order, highest first),
 * followed by a catch-all "Members" section for everyone else
 * (typically @everyone).
 *
 * Each row shows the member's role colour on the username and
 * the role's icon (if any) next to the name. The role icon
 * comes pre-sanitized from the server (see
 * Chattr.Infrastructure.Services.SvgSanitizer) so we render it
 * via dangerouslySetInnerHTML without re-sanitising.
 *
 * Left- or right-clicking a row opens the page-level member
 * context menu at the click point. The cursor changes to a
 * pointer for any row that's actually targetable (not the
 * viewer, not the owner, not over-tier).
 */
export function UserList({
  members,
  roles,
  presences,
  showOffline,
  className,
  untargetableIds,
  viewerUserId,
  onMemberAction,
}: Props) {
  // Look up presence by userId. We can't assume the same
  // ordering or that every member has a presence row (the
  // presence endpoint is platform-wide, not guild-scoped).
  const presenceById = useMemo(() => {
    const map = new Map<number, UserPresence>();
    for (const p of presences) map.set(p.id, p);
    return map;
  }, [presences]);

  // Force a re-render every 15s so the online/offline dots stay
  // roughly current without us polling the server.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Partition members into "DisplaySeparately roles" (one
  // section each) and "members bucket" (everyone else). Roles
  // are already sorted highest-first from the server; we just
  // need to walk them in order and pick out which has members.
  //
  // Important: only roles with `displaySeparately=true` get
  // their own section. A role like `@everyone` is the default
  // tier — by design it does NOT get its own group, and its
  // members flow into the catch-all "Members" bucket. The
  // previous version pushed every role-with-members into
  // `out` and then re-pushed every non-displaySeparately
  // member into the bucket, which meant @everyone members
  // (the owner included) appeared twice — once under their
  // own section and once under "Members".
  const sections = useMemo(() => {
    const byRole = new Map<number, GuildMember[]>();
    for (const m of members) {
      const arr = byRole.get(m.roleId) ?? [];
      arr.push(m);
      byRole.set(m.roleId, arr);
    }
    const out: Array<{ role: Role; members: GuildMember[] }> = [];
    const unassigned: GuildMember[] = [];
    const displaySeparatelyIds = new Set(
      roles.filter((r) => r.displaySeparately).map((r) => r.id),
    );
    for (const role of roles) {
      if (!role.displaySeparately) continue; // skip — its members go to the bucket
      const list = byRole.get(role.id);
      if (list && list.length > 0) {
        out.push({ role, members: list });
      }
    }
    // Anything not on a DisplaySeparately role goes to the
    // catch-all Members bucket. This includes @everyone.
    for (const m of members) {
      if (!displaySeparatelyIds.has(m.roleId)) unassigned.push(m);
    }
    return { displaySeparately: out, others: unassigned };
  }, [members, roles]);

  // Single click handler shared by every row — kept here so
  // the row component doesn't have to re-create it. We bind
  // it to `onMouseDown` rather than `onClick` so the click
  // fires before the browser has a chance to start a text
  // selection. A text selection on the username (the only
  // visible content of the row) would otherwise consume the
  // click and surface the browser's "Copy / Paste" native
  // menu on the next right-click — the user perceives that
  // as "the context menu didn't open". `preventDefault` on
  // the mousedown also kills the selection outright.
  const onRowMouseDown = (
    member: GuildMember,
    e: ReactMouseEvent<HTMLLIElement>,
  ) => {
    if (!onMemberAction) return;
    if (e.button !== 0) return; // left button only
    e.preventDefault();
    onMemberAction(member, e.clientX, e.clientY);
  };

  const onRowContextMenu = (
    member: GuildMember,
    e: ReactMouseEvent<HTMLLIElement>,
  ) => {
    if (!onMemberAction) return;
    e.preventDefault(); // suppress the browser's native menu
    onMemberAction(member, e.clientX, e.clientY);
  };

  return (
    <aside
      className={clsx(
        "flex w-60 shrink-0 flex-col border-l border-white/[0.06] bg-[#0a0b0e]",
        className,
      )}
    >
      {/* No header — the section labels (Admin / Mod / Members)
          already tell the user what this column is. The old
          "Users (N)" line just duplicated the count every
          section header already carries. */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {sections.displaySeparately.map(({ role, members: ms }) => (
          <RoleSection
            key={role.id}
            label={role.name}
            color={role.color}
            iconSvg={role.iconSvg}
            members={ms}
            presenceById={presenceById}
            showOffline={showOffline}
            untargetableIds={untargetableIds}
            viewerUserId={viewerUserId}
            onRowMouseDown={onRowMouseDown}
            onRowContextMenu={onRowContextMenu}
          />
        ))}
        {sections.others.length > 0 && (
          <RoleSection
            // Fallback section for @everyone etc. No specific
            // role colour / icon — we use the muted default.
            label="Members"
            color={null}
            iconSvg={null}
            members={sections.others}
            presenceById={presenceById}
            showOffline={showOffline}
            untargetableIds={untargetableIds}
            viewerUserId={viewerUserId}
            onRowMouseDown={onRowMouseDown}
            onRowContextMenu={onRowContextMenu}
          />
        )}
      </div>
    </aside>
  );
}

interface RoleSectionProps {
  label: string;
  color: string | null;
  iconSvg: string | null;
  members: GuildMember[];
  presenceById: Map<number, UserPresence>;
  showOffline: boolean;
  untargetableIds?: Set<number>;
  viewerUserId?: number;
  onRowMouseDown: (member: GuildMember, e: ReactMouseEvent<HTMLLIElement>) => void;
  onRowContextMenu: (member: GuildMember, e: ReactMouseEvent<HTMLLIElement>) => void;
}

function RoleSection({
  label,
  color,
  iconSvg,
  members,
  presenceById,
  showOffline,
  untargetableIds,
  viewerUserId,
  onRowMouseDown,
  onRowContextMenu,
}: RoleSectionProps) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
        {iconSvg && (
          <span
            dangerouslySetInnerHTML={{ __html: iconSvg }}
            // Server has already sanitized (whitelisted
            // elements, stripped on*/script/javascript:/
            // foreignObject). 12px keeps the icon visually
            // balanced next to the small label.
            className="inline-grid h-3 w-3 place-items-center"
            style={color ? { color } : undefined}
            aria-hidden
          />
        )}
        <span style={color ? { color } : undefined}>{label}</span>
        <span className="text-white/25">— {members.length}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {members.map((m) => (
          <UserRow
            key={m.userId}
            member={m}
            presence={presenceById.get(m.userId) ?? null}
            showOffline={showOffline}
            // Owners are always untargetable (server refuses
            // to kick/ban them). The viewer is also excluded
            // — no point showing a menu whose only "action"
            // would be no-op.
            isClickable={
              !!untargetableIds &&
              viewerUserId !== undefined &&
              !untargetableIds.has(m.userId) &&
              m.userId !== viewerUserId
            }
            onRowMouseDown={onRowMouseDown}
            onRowContextMenu={onRowContextMenu}
          />
        ))}
      </ul>
    </div>
  );
}

function UserRow({
  member,
  presence,
  showOffline,
  isClickable,
  onRowMouseDown,
  onRowContextMenu,
}: {
  member: GuildMember;
  presence: UserPresence | null;
  showOffline: boolean;
  isClickable: boolean;
  onRowMouseDown: (member: GuildMember, e: ReactMouseEvent<HTMLLIElement>) => void;
  onRowContextMenu: (member: GuildMember, e: ReactMouseEvent<HTMLLIElement>) => void;
}) {
  const online = presence ? isOnline(presence) : false;
  if (!online && !showOffline) return null;

  const initial =
    (member.displayName || member.username).trim().charAt(0).toUpperCase() || "?";

  return (
    <li
      // Bind to onMouseDown rather than onClick so the click
      // fires before the browser starts a text selection —
      // see the matching note on `onRowMouseDown` in the
      // parent. We also suppress text selection with the
      // `select-none` class so a stray double-click on the
      // username doesn't leave a half-selected name behind.
      onMouseDown={
        isClickable
          ? (e) => onRowMouseDown(member, e)
          : undefined
      }
      onContextMenu={
        isClickable
          ? (e) => onRowContextMenu(member, e)
          : undefined
      }
      className={clsx(
        "flex select-none items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        isClickable
          ? "cursor-pointer hover:bg-white/[0.06]"
          : "hover:bg-white/[0.04]",
        online ? "" : "opacity-60",
      )}
    >
      <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[11px] font-semibold text-emerald-200/90">
        {initial}
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0b0e]",
            online ? "bg-emerald-400" : "bg-white/20",
          )}
          aria-label={online ? "online" : "offline"}
        />
      </span>
      {member.roleIconSvg && (
        <span
          dangerouslySetInnerHTML={{ __html: member.roleIconSvg }}
          className="h-3.5 w-3.5 shrink-0"
          style={member.roleColor ? { color: member.roleColor } : undefined}
          aria-hidden
        />
      )}
      <span
        className="truncate text-[13px]"
        style={member.roleColor ? { color: member.roleColor } : undefined}
      >
        {member.displayName}
      </span>
    </li>
  );
}
