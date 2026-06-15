"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { UserPresence } from "@/types/client";
import { isOnline } from "@/lib/presence";

interface Props {
  /** Current user id — used to hide the "Message yourself" button. */
  currentUserId: number;
  users: UserPresence[];
  showOffline: boolean;
  /** Called with the other user's id when the user clicks "Message". */
  onMessage: (otherUserId: number) => void;
  /** Mobile back button — only used on screens below `md`. */
  onBack?: () => void;
  busy?: boolean;
}

/**
 * The main-pane "Friends" view. Same data shape as the right-hand
 * <UserList>, but with a "Message" button on each row so the user can
 * open a DM straight from the list.
 */
export function FriendsList({
  currentUserId,
  users,
  showOffline,
  onMessage,
  onBack,
  busy,
}: Props) {
  // Re-render every 15s so the online/offline dots stay accurate
  // even without a presence-list poll.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const online = users.filter((u) => u.id !== currentUserId && isOnline(u));
  const offline = users.filter((u) => u.id !== currentUserId && !isOnline(u));

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#0a0b0e] px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mr-1 grid h-8 w-8 place-items-center rounded text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
            aria-label="Back to direct messages"
            title="Back"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <h1 className="text-[15px] font-semibold text-white/85">Friends</h1>
        <span className="ml-2 text-[12px] text-white/40">
          {users.filter((u) => u.id !== currentUserId).length} people
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {online.length > 0 && (
          <Group
            label="Online"
            users={online}
            onMessage={onMessage}
            busy={busy}
          />
        )}
        {showOffline && offline.length > 0 && (
          <Group
            label="Offline"
            users={offline}
            online={false}
            onMessage={onMessage}
            busy={busy}
          />
        )}
        {online.length === 0 && (!showOffline || offline.length === 0) && (
          <p className="text-[13px] text-white/40">
            No other users yet. Invite a friend to get started.
          </p>
        )}
      </div>
    </div>
  );
}

function Group({
  label,
  users,
  online = true,
  onMessage,
  busy,
}: {
  label: string;
  users: UserPresence[];
  online?: boolean;
  onMessage: (otherUserId: number) => void;
  busy?: boolean;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-white/40">
        {label} — {users.length}
      </h2>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => (
          <li key={u.id}>
            <UserCard user={u} online={online} onMessage={onMessage} busy={busy} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function UserCard({
  user,
  online,
  onMessage,
  busy,
}: {
  user: UserPresence;
  online: boolean;
  onMessage: (otherUserId: number) => void;
  busy?: boolean;
}) {
  const initial = (user.displayName || user.username).trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[14px] font-semibold text-emerald-200/90">
        {initial}
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0b0e]",
            online ? "bg-emerald-400" : "bg-white/20",
          )}
          aria-label={online ? "online" : "offline"}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-white/90">
          {user.displayName}
        </p>
        <p className="truncate text-[11.5px] text-white/40">@{user.username}</p>
      </div>
      <button
        type="button"
        onClick={() => onMessage(user.id)}
        disabled={busy}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/85 disabled:opacity-40"
        title={`Message ${user.displayName}`}
        aria-label={`Message ${user.displayName}`}
      >
        <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}
