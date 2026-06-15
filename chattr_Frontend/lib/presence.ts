"use client";

import type { UserPresence } from "@/types/client";

/** A user is "online" iff we have a recent heartbeat (last 60 s). */
export function isOnline(u: UserPresence, now: number = Date.now()): boolean {
  if (!u.lastSeenAt) return false;
  const last = new Date(u.lastSeenAt).getTime();
  return now - last < 60_000;
}
