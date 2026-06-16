"use client";

import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";

import { useAuth } from "@/contexts/auth-provider";
import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type {
  Channel,
  GuildMember,
  GuildSummary,
  Role,
} from "@/types/client";
import { OverviewTab } from "./guild-settings/overview-tab";
import { RolesTab } from "./guild-settings/roles-tab";
import { ChannelsTab } from "./guild-settings/channels-tab";
import { MembersTab } from "./guild-settings/members-tab";

/**
 * Which section of the settings dialog is currently active.
 * - `overview`  : guild name, icon, leave/delete — IsAdministrator only
 * - `roles`     : role CRUD — IsAdministrator OR CanManageRoles
 * - `channels`  : channel CRUD — IsAdministrator OR CanManageChannels
 * - `members`   : member role assignment — IsAdministrator OR CanManageRoles
 *
 * The active tab is initialised to the first one the user has
 * permission to see; if they only have one (e.g. only CanManageChannels)
 * the sidebar shows just that entry and there's nothing to switch to.
 */
export type SettingsTab = "overview" | "roles" | "channels" | "members";

const TAB_LABELS: Record<SettingsTab, string> = {
  overview: "Overview",
  roles: "Roles",
  channels: "Channels",
  members: "Members",
};

const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  overview: "Guild identity, icon, and destructive actions.",
  roles: "Define who can do what. Owners can manage any role.",
  channels: "Create, rename, or delete channels in this guild.",
  members: "Assign roles to the people in this guild.",
};

interface Props {
  open: boolean;
  guild: GuildSummary | null;
  onClose: () => void;
  /**
   * Called with the freshly updated guild. The parent should update
   * its local copy (sidebar label, current-guild header, etc.) so
   * the rename takes effect everywhere immediately.
   */
  onUpdated: (guild: GuildSummary) => void;
}

/**
 * Discord-style guild settings dialog. Almost fullscreen — a
 * centred card with a left tab list and a scrollable content
 * panel. Visibility of every tab is gated by the per-guild
 * permission flags the parent passes in via `guild`, so a member
 * with `CanManageChannels` only sees the Channels tab, while an
 * admin sees all four.
 *
 * Permission gate for opening the modal: the parent must only
 * render it for users with at least one of the per-guild manage
 * flags. The server re-checks permissions on every mutation
 * regardless, so a stale modal opened by a user who was just
 * demoted will surface the 403 as an inline error rather than
 * corrupting state.
 */
export function GuildSettingsModal({ open, guild, onClose, onUpdated }: Props) {
  // ---- Available tabs ---------------------------------------------------
  // `useMemo` keeps the array reference stable across renders that
  // don't actually change the permissions. Without it, this would
  // be a new array on every render and the effect below — which
  // watches `availableTabs` to reset the active tab on open —
  // would fire after every `setTab` click and snap the user back
  // to the first tab. (That's the bug where the tabs were
  // unclickable on the first iteration.)
  const availableTabs = useMemo<SettingsTab[]>(() => {
    const out: SettingsTab[] = [];
    if (guild?.isAdministrator) out.push("overview");
    if (guild?.isAdministrator || guild?.canManageRoles) out.push("roles");
    if (guild?.canManageChannels) out.push("channels");
    if (guild?.isAdministrator || guild?.canManageRoles) out.push("members");
    return out;
  }, [guild?.id, guild?.isAdministrator, guild?.canManageRoles, guild?.canManageChannels]);

  const [tab, setTab] = useState<SettingsTab>("overview");

  // Reset the active tab every time the modal opens, and pick
  // the first one the user actually has permission to see. We
  // intentionally key this on `open` and the tab list contents
  // (not the reference) so the effect doesn't fire when the
  // user simply switches tabs.
  useEffect(() => {
    if (!open) return;
    setTab(availableTabs[0] ?? "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availableTabs.join("|"), guild?.id]);

  // ---- Data caches ------------------------------------------------------
  // We pull roles / members / channels once when the modal opens
  // and pass them into the tab components. The tab components
  // own their own per-mutation state (loading spinners, errors)
  // and bubble "data changed" callbacks up so we can re-fetch.
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [members, setMembers] = useState<GuildMember[] | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // The role the current viewer is sitting on, used by the
  // Roles tab to disable edit / delete on that row. We
  // resolve it from the cached members list — same source
  // the Members tab uses — so the answer is consistent
  // across both views. If the cache hasn't loaded yet (e.g.
  // the user just opened the modal), this is `null` and the
  // Roles tab treats every row as editable; the cache will
  // land a moment later and re-render.
  // (The actual computation lives in <Content> so the
  // resolution stays close to the JSX that consumes it.)

  // Bumped by tab components after a mutation so the next render
  // re-pulls the affected list. Cheaper than re-fetching on every
  // keystroke, more robust than trying to keep the cache in sync
  // from the tab.
  const [reloadTick, setReloadTick] = useState(0);
  const bumpReload = () => setReloadTick((t) => t + 1);

  useEffect(() => {
    if (!open || !guild) return;
    let cancelled = false;
    setDataError(null);
    (async () => {
      try {
        // Roles + members are required for the Roles / Members tabs;
        // channels are required for the Channels tab. We pull them
        // in parallel — three small round-trips, all fast.
        const wantRoles = guild.isAdministrator || guild.canManageRoles;
        const wantMembers = guild.isAdministrator || guild.canManageRoles;
        const wantChannels = guild.canManageChannels;

        const [r, m, c] = await Promise.all([
          wantRoles ? api.guildRoles.list(guild.id) : Promise.resolve(null as Role[] | null),
          wantMembers ? api.guildMembers.list(guild.id) : Promise.resolve(null as GuildMember[] | null),
          wantChannels ? api.guildChannels.list(guild.id) : Promise.resolve(null as Channel[] | null),
        ]);
        if (cancelled) return;
        setRoles(r);
        setMembers(m);
        setChannels(c);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return;
        setDataError(
          err instanceof Error ? err.message : "Failed to load guild data.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, guild, reloadTick]);

  // ---- Close-on-escape (don't interrupt in-flight saves) ---------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !guild) return null;

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Empty-state: the user is a member but holds zero manage-perms.
  // The parent should already be guarding this, but be defensive:
  // render an explanatory empty state instead of a useless dialog.
  if (availableTabs.length === 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={onBackdropMouseDown}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      >
        <div className="auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 p-6 shadow-2xl shadow-black/70">
          <h2 className="text-[18px] font-semibold tracking-tight text-white">
            No settings available
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
            You don't hold any management permissions in{" "}
            <span className="text-white/70">{guild.name}</span>. Ask an admin
            to grant you a role with manage rights to make changes here.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 text-[12.5px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="auth-card-enter flex h-[min(90vh,820px)] w-full max-w-[1100px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d11]/95 shadow-2xl shadow-black/70">
        <Sidebar
          guildName={guild.name}
          tabs={availableTabs}
          active={tab}
          onSelect={setTab}
        />
        <Content
          tab={tab}
          guild={guild}
          roles={roles}
          members={members}
          channels={channels}
          dataError={dataError}
          onUpdated={onUpdated}
          onDataChanged={bumpReload}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar                                                                   */
/* -------------------------------------------------------------------------- */

function Sidebar({
  guildName,
  tabs,
  active,
  onSelect,
}: {
  guildName: string;
  tabs: SettingsTab[];
  active: SettingsTab;
  onSelect: (t: SettingsTab) => void;
}) {
  const titleId = useId();
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/[0.06] bg-[#08090c]/80">
      <div className="border-b border-white/[0.06] px-4 py-4">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
          Guild settings
        </div>
        <h2
          id={titleId}
          className="mt-1 truncate text-[14.5px] font-semibold text-white"
          title={guildName}
        >
          {guildName}
        </h2>
      </div>
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Settings tabs">
        <ul className="flex flex-col gap-0.5">
          {tabs.map((t) => (
            <li key={t}>
              <button
                type="button"
                role="tab"
                aria-selected={active === t}
                onClick={() => onSelect(t)}
                className={clsx(
                  "flex w-full items-center rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                  active === t
                    ? "bg-white/[0.08] text-white"
                    : "text-white/65 hover:bg-white/[0.04] hover:text-white/90",
                )}
              >
                <span className="truncate">{TAB_LABELS[t]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Content panel                                                             */
/* -------------------------------------------------------------------------- */

function Content({
  tab,
  guild,
  roles,
  members,
  channels,
  dataError,
  onUpdated,
  onDataChanged,
  onClose,
}: {
  tab: SettingsTab;
  guild: GuildSummary;
  roles: Role[] | null;
  members: GuildMember[] | null;
  channels: Channel[] | null;
  dataError: string | null;
  onUpdated: (g: GuildSummary) => void;
  onDataChanged: () => void;
  onClose: () => void;
}) {
  // The current viewer's role id, resolved here (rather than
  // in the parent) so the Roles tab can disable edit / delete
  // on the row they themselves occupy. The server enforces
  // the same rule; this just gives the user a clear disabled
  // state instead of a 400 mid-click.
  const auth = useAuth();
  const currentUserRoleId = useMemo<number | null>(() => {
    if (!members) return null;
    const me = members.find((m) => m.userId === auth.user?.id);
    return me ? me.roleId : null;
  }, [members, auth.user?.id]);

  return (
    <section
      className="flex min-w-0 flex-1 flex-col"
      role="tabpanel"
      aria-label={TAB_LABELS[tab]}
    >
      <Header tab={tab} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-8 py-7">
        {dataError ? (
          <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-[12.5px] text-rose-200/90">
            {dataError}
          </div>
        ) : null}
        {tab === "overview" ? (
          <OverviewTab guild={guild} onUpdated={onUpdated} />
        ) : tab === "roles" ? (
          <RolesTab
            guild={guild}
            roles={roles}
            // The role the current user is sitting on, so
            // the row can mark itself non-editable. The
            // server enforces the same rule (see
            // RoleHandlers.UpdateRole / DeleteRole) but a
            // disabled button is better UX than a 400.
            currentUserRoleId={currentUserRoleId}
            onDataChanged={onDataChanged}
          />
        ) : tab === "channels" ? (
          <ChannelsTab
            guild={guild}
            channels={channels}
            onDataChanged={onDataChanged}
          />
        ) : (
          <MembersTab
            guild={guild}
            members={members}
            roles={roles}
            onDataChanged={onDataChanged}
          />
        )}
      </div>
    </section>
  );
}

function Header({ tab, onClose }: { tab: SettingsTab; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.06] px-8 py-5">
      <div>
        <h3 className="text-[18px] font-semibold tracking-tight text-white">
          {TAB_LABELS[tab]}
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/45">
          {TAB_DESCRIPTIONS[tab]}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close settings"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </header>
  );
}
