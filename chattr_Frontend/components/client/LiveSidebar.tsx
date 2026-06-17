"use client";

/**
 * Example integration of the live store into a
 * sidebar. The <c>LiveSidebar</c> subscribes to the
 * user's guild list and the channel list for the
 * currently-active guild. Any guild created, channel
 * added, member joined, etc. — anywhere on the
 * platform — lands on this sidebar and the right
 * pane re-renders without a refresh.
 *
 * <para>
 * The component is a reference implementation. The
 * existing client page (which the sibling agent
 * built) can either swap its existing data fetch for
 * <c>useLiveGuilds()</c> + <c>useLiveChannels(...)</c>,
 * or leave the existing path and just add the
 * <c>LiveProvider</c> above the tree to pick up the
 * streaming updates on top of the existing snapshot
 * data.
 * </para>
 */

import { useEffect, useState } from "react";

import {
  useLiveChannels,
  useLiveDms,
  useLiveGuilds,
  useLiveNotifications,
} from "@/lib/store/liveStore";

interface Props {
  activeGuildId: number | null;
  onSelectGuild: (id: number) => void;
  onSelectChannel: (id: number) => void;
}

export function LiveSidebar({
  activeGuildId,
  onSelectGuild,
  onSelectChannel,
}: Props) {
  // These hooks subscribe to the relevant slices
  // of the live store. Any event from the hub
  // (guild created, channel added, etc.) causes the
  // corresponding useLiveSelector to re-evaluate,
  // and React re-renders the affected component
  // subtree.
  const guilds = useLiveGuilds();
  const channels = useLiveChannels(activeGuildId);
  const dms = useLiveDms();
  const notifications = useLiveNotifications();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(notifications.filter((n) => !n.read).length);
  }, [notifications]);

  return (
    <aside className="flex h-full w-60 flex-col border-r border-white/5 bg-[#0a0b0e] text-sm">
      <div className="px-3 py-2 text-default-500 text-xs uppercase tracking-wide">
        Guilds
      </div>
      <ul className="flex-1 overflow-y-auto">
        {guilds.map((g) => (
          <li key={g.id}>
            <button
              onClick={() => onSelectGuild(g.id)}
              className={
                "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 " +
                (g.id === activeGuildId ? "bg-white/10" : "")
              }
            >
              <span className="flex-1 truncate">{g.name}</span>
              {g.isArchived ? (
                <span className="text-default-500 text-xs">[archived]</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      {activeGuildId != null ? (
        <>
          <div className="mt-2 px-3 py-2 text-default-500 text-xs uppercase tracking-wide">
            Channels
          </div>
          <ul className="flex-1 overflow-y-auto">
            {channels.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelectChannel(c.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
                >
                  <span className="text-default-600">#</span>
                  <span className="flex-1 truncate">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-2 px-3 py-2 text-default-500 text-xs uppercase tracking-wide">
        DMs
      </div>
      <ul className="flex-shrink overflow-y-auto">
        {dms.slice(0, 8).map((d) => (
          <li key={d.id}>
            <button
              onClick={() => onSelectChannel(d.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
            >
              <span className="flex-1 truncate">{d.otherDisplayName}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-between border-t border-white/5 px-3 py-2">
        <span className="text-default-500 text-xs">Notifications</span>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-primary-500 px-2 text-xs">
            {unreadCount}
          </span>
        ) : null}
      </div>
    </aside>
  );
}
