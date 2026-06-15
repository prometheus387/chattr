"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Channel, ChannelKind, DmSummary } from "@/types/client";
import { GuildHeader } from "@/components/client/guild-header";

export type SidebarMode =
  | { kind: "guild"; guildHeader: GuildHeaderInfo | null; channels: Channel[]; activeChannelId: number | null; onSelectChannel: (id: number) => void; onLeaveGuild: () => void; leavingGuild: boolean; leaveError: string | null }
  | { kind: "friends"; dms: DmSummary[]; activeDmId: number | null; onSelectDm: (id: number) => void; onStartNewDm: () => void };

interface GuildHeaderInfo {
  name: string;
  isOwner: boolean;
}

interface Props {
  mode: SidebarMode;
  className?: string;
}

const DEFAULT_OPEN_CATEGORIES: ReadonlySet<string> = new Set();

export function ChannelSidebar({ mode, className }: Props) {
  if (mode.kind === "friends") {
    return (
      <FriendsSidebar
        dms={mode.dms}
        activeDmId={mode.activeDmId}
        onSelectDm={mode.onSelectDm}
        onStartNewDm={mode.onStartNewDm}
        className={className}
      />
    );
  }
  return (
    <GuildSidebarBody
      channels={mode.channels}
      activeChannelId={mode.activeChannelId}
      onSelectChannel={mode.onSelectChannel}
      guildHeader={mode.guildHeader}
      onLeaveGuild={mode.onLeaveGuild}
      leavingGuild={mode.leavingGuild}
      leaveError={mode.leaveError}
      className={className}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Friends (DM list) sidebar                                                 */
/* -------------------------------------------------------------------------- */

function FriendsSidebar({
  dms,
  activeDmId,
  onSelectDm,
  onStartNewDm,
  className,
}: {
  dms: DmSummary[];
  activeDmId: number | null;
  onSelectDm: (id: number) => void;
  onStartNewDm: () => void;
  className?: string;
}) {
  return (
    <aside
      className={clsx(
        "flex flex-col border-r border-white/[0.06] bg-[#0a0b0e]",
        // Full-width on mobile (single-panel mode), fixed 240px on md+.
        "w-full md:w-60 md:shrink-0",
        className,
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
        <span className="text-[15px] font-semibold text-white">Direct messages</span>
        <button
          type="button"
          onClick={onStartNewDm}
          title="New direct message"
          aria-label="Start a new direct message"
          className="grid h-7 w-7 place-items-center rounded text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {dms.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-white/40">
            No conversations yet. Open a profile from the user list and
            tap “Message” to start a DM.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {dms.map((d) => (
              <li key={d.id}>
                <DmRow
                  dm={d}
                  active={d.id === activeDmId}
                  onClick={() => onSelectDm(d.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}

function DmRow({
  dm,
  active,
  onClick,
}: {
  dm: DmSummary;
  active: boolean;
  onClick: () => void;
}) {
  const initial = (dm.otherDisplayName || dm.otherUsername).trim().charAt(0).toUpperCase() || "?";
  const preview = dm.lastMessagePreview ?? "No messages yet";
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
        active
          ? "bg-white/[0.07] text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90",
      )}
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[12px] font-semibold text-emerald-200/90">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[13.5px] font-medium">
            {dm.otherDisplayName}
          </span>
        </span>
        <span className="block truncate text-[11.5px] text-white/45">
          {preview}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Guild (channel list) sidebar                                              */
/* -------------------------------------------------------------------------- */

interface GuildBodyProps {
  channels: Channel[];
  activeChannelId: number | null;
  onSelectChannel: (id: number) => void;
  guildHeader: GuildHeaderInfo | null;
  onLeaveGuild: () => void;
  leavingGuild: boolean;
  leaveError: string | null;
  className?: string;
}

function bucketByCategory(channels: Channel[]): { name: string; channels: Channel[] }[] {
  const map = new Map<string, Channel[]>();
  for (const c of channels) {
    const key = c.category ?? "(uncategorized)";
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([name, channels]) => ({ name, channels }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function GuildSidebarBody({
  channels,
  activeChannelId,
  onSelectChannel,
  guildHeader,
  onLeaveGuild,
  leavingGuild,
  leaveError,
  className,
}: GuildBodyProps) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(DEFAULT_OPEN_CATEGORIES),
  );

  const toggle = (name: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const buckets = bucketByCategory(channels);

  return (
    <aside
      className={clsx(
        "flex flex-col border-r border-white/[0.06] bg-[#0a0b0e]",
        "w-full md:w-60 md:shrink-0",
        className,
      )}
    >
      {guildHeader ? (
        <GuildHeader
          guildName={guildHeader.name}
          isOwner={guildHeader.isOwner}
          busy={leavingGuild}
          errorMessage={leaveError}
          onLeave={onLeaveGuild}
        />
      ) : (
        <div className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-white/40">
          Channels
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {buckets.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-white/40">No channels yet.</p>
        )}
        {buckets.map((bucket) => {
          const open = openCategories.has(bucket.name);
          return (
            <div key={bucket.name} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(bucket.name)}
                className="group flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10.5px] font-semibold uppercase tracking-wider text-white/40 transition-colors hover:text-white/65"
                aria-expanded={open}
              >
                <Chevron open={open} />
                <span className="flex-1 truncate">{bucket.name}</span>
                <span className="text-white/30 group-hover:text-white/50">
                  {bucket.channels.length}
                </span>
              </button>
              {open && (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {bucket.channels.map((c) => (
                    <li key={c.id}>
                      <ChannelButton
                        channel={c}
                        active={c.id === activeChannelId}
                        onClick={() => onSelectChannel(c.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={11}
      height={11}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("transition-transform duration-150", open ? "rotate-90" : "rotate-0")}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ChannelButton({
  channel,
  active,
  onClick,
}: {
  channel: Channel;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13.5px] transition-colors",
        active
          ? "bg-white/[0.07] text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white/90",
      )}
    >
      <ChannelIcon kind={channel.kind} />
      <span className="truncate">{channel.name}</span>
    </button>
  );
}

function ChannelIcon({ kind }: { kind: ChannelKind }) {
  if (kind === "Voice") {
    return (
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/45">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-white/45">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
