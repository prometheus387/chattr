"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { UserPresence } from "@/types/client";
import { isOnline } from "@/lib/presence";

interface Props {
  users: UserPresence[];
  showOffline: boolean;
  className?: string;
}

export function UserList({ users, showOffline, className }: Props) {
  // The presence list can be polled; rather than re-rendering on every
  // tick we just compute online/offline at render time using the same
  // 60 s threshold the server uses.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const online = users.filter((u) => isOnline(u));
  const offline = users.filter((u) => !isOnline(u));

  return (
    <aside
      className={clsx(
        "flex w-60 shrink-0 flex-col border-l border-white/[0.06] bg-[#0a0b0e]",
        className,
      )}
    >
      <div className="px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-white/40">
        Users ({users.length})
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {online.length > 0 && (
          <UserGroup label="Online" users={online} online />
        )}
        {showOffline && offline.length > 0 && (
          <UserGroup label="Offline" users={offline} online={false} />
        )}
      </div>
    </aside>
  );
}

function UserGroup({
  label,
  users,
  online,
}: {
  label: string;
  users: UserPresence[];
  online: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
        {label} — {users.length}
      </div>
      <ul className="flex flex-col gap-0.5">
        {users.map((u) => (
          <UserRow key={u.id} user={u} online={online} />
        ))}
      </ul>
    </div>
  );
}

function UserRow({ user, online }: { user: UserPresence; online: boolean }) {
  const initial = (user.displayName || user.username).trim().charAt(0).toUpperCase() || "?";
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]">
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
      <span
        className={clsx(
          "truncate text-[13px]",
          online ? "text-white/85" : "text-white/45",
        )}
      >
        {user.displayName}
      </span>
    </li>
  );
}
