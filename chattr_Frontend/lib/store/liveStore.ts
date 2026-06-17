"use client";

/**
 * Zustand-style live store. Holds every event-driven
 * piece of UI state: the user's guilds, per-guild
 * channel lists, per-guild member lists, per-channel
 * message lists, DMs, notifications, presence.
 *
 * <para>
 * The store is a module-level singleton. The
 * <c>useLiveStore</c> hook returns a selector-bound
 * view; the live-event dispatcher (see
 * <c>lib/crypto/live.ts</c>) mutates the store
 * directly. Components don't subscribe manually —
 * the <c>useLiveStore</c> hook re-renders on
 * relevant changes.
 * </para>
 *
 * <para>
 * Maps are used for keyed collections (channels by
 * guild, members by guild, messages by channel)
 * because the alternative — flat arrays filtered on
 * every render — gets quadratic in the worst case.
 * Maps give us O(1) lookups and stable references
 * (mutating a value re-renders only the components
 * reading that value, not the whole list).
 * </para>
 *
 * <para>
 * Note: this is a hand-rolled minimal store, not
 * zustand proper. We don't have zustand in the
 * dependencies yet; the API is compatible (selector
 * hook, setState) so swapping to zustand later is a
 * one-liner if we want devtools / middleware.
 * </para>
 */

import { useEffect, useState } from "react";

import type {
  ChannelEventPayload,
  DmMessageEventPayload,
  DmOpenedPayload,
  MemberEventPayload,
  MessageEventPayload,
  NotificationEventPayload,
} from "@/lib/crypto/live";

// ---- State shape ------------------------------------------------

export interface PresenceEntry {
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface NotificationEntry extends NotificationEventPayload {
  read?: boolean;
}

export interface LiveState {
  /** All guilds the user is in. Keyed by guild id. */
  guilds: Map<number, import("@/lib/crypto/live").GuildEventPayload>;
  /** Per-guild channel list (already sorted by position). */
  channelsByGuild: Map<number, ChannelEventPayload[]>;
  /** Per-guild member list. */
  membersByGuild: Map<number, MemberEventPayload[]>;
  /** Per-channel message list. */
  messagesByChannel: Map<number, MessageEventPayload[]>;
  /** Direct-message channel list. */
  dms: DmOpenedPayload[];
  /** Per-DM message list. */
  dmMessages: Map<number, DmMessageEventPayload[]>;
  /** Notifications, newest first. */
  notifications: NotificationEntry[];
  /** Per-user presence. */
  presence: Map<number, PresenceEntry>;
  /** True after the initial connect (so the UI can
   *  distinguish "no data" from "haven't connected yet"). */
  connected: boolean;
  /** True after the first reconnect attempt. The UI
   *  can show a banner while disconnected. */
  reconnecting: boolean;
}

const initialState: LiveState = {
  guilds: new Map(),
  channelsByGuild: new Map(),
  membersByGuild: new Map(),
  messagesByChannel: new Map(),
  dms: [],
  dmMessages: new Map(),
  notifications: [],
  presence: new Map(),
  connected: false,
  reconnecting: false,
};

// ---- Singleton store --------------------------------------------

let state: LiveState = initialState;
const subscribers = new Set<() => void>();

export const useLiveStore = {
  getState: () => state,
  setState: (
    partial: Partial<LiveState> | ((s: LiveState) => Partial<LiveState>),
  ) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
    subscribers.forEach((cb) => cb());
  },
  subscribe: (cb: () => void) => {
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
  },
};

// React hook. Re-renders when the selected slice
// changes (reference equality). For maps we treat
// re-creations as new (zustand-style), so reading a
// map requires the consumer to do `useLiveStore(s => s.guilds.get(id))` to
// pick out the specific value.
export function useLiveSelector<T>(
  selector: (state: LiveState) => T,
): T {
  const [value, setValue] = useState(() => selector(state));
  useEffect(() => {
    const unsubscribe = useLiveStore.subscribe(() => {
      const next = selector(useLiveStore.getState());
      setValue((prev) => (Object.is(prev, next) ? prev : next));
      return undefined; // useEffect cleanup ignores the value
    });
    // Re-check after subscribe — the state may have
    // changed between our initialState capture and
    // the effect running.
    const current = selector(useLiveStore.getState());
    if (!Object.is(value, current)) {
      setValue(current);
    }
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

// ---- Convenience hooks -----------------------------------------
// Most components want a specific slice, not the
// whole store. These wrap useLiveSelector for the
// common cases.

export function useLiveGuilds(): import("@/lib/crypto/live").GuildEventPayload[] {
  return useLiveSelector((s) => Array.from(s.guilds.values()));
}

export function useLiveGuild(guildId: number | null):
  | import("@/lib/crypto/live").GuildEventPayload
  | undefined {
  return useLiveSelector((s) => (guildId == null ? undefined : s.guilds.get(guildId)));
}

export function useLiveChannels(guildId: number | null): ChannelEventPayload[] {
  return useLiveSelector((s) =>
    guildId == null ? [] : s.channelsByGuild.get(guildId) ?? [],
  );
}

export function useLiveMembers(guildId: number | null): MemberEventPayload[] {
  return useLiveSelector((s) =>
    guildId == null ? [] : s.membersByGuild.get(guildId) ?? [],
  );
}

export function useLiveMessages(channelId: number | null): MessageEventPayload[] {
  return useLiveSelector((s) =>
    channelId == null ? [] : s.messagesByChannel.get(channelId) ?? [],
  );
}

export function useLiveDms(): DmOpenedPayload[] {
  return useLiveSelector((s) => s.dms);
}

export function useLiveDmMessages(dmId: number | null): DmMessageEventPayload[] {
  return useLiveSelector((s) =>
    dmId == null ? [] : s.dmMessages.get(dmId) ?? [],
  );
}

export function useLiveNotifications(): NotificationEntry[] {
  return useLiveSelector((s) => s.notifications);
}

export function useLivePresence(userId: number | null): PresenceEntry | undefined {
  return useLiveSelector((s) =>
    userId == null ? undefined : s.presence.get(userId),
  );
}

export function useLiveConnected(): boolean {
  return useLiveSelector((s) => s.connected);
}

/**
 * Reset the store to its initial state. Used on
 * sign-out (or sign-in-as-different-user) so a stale
 * tenant doesn't bleed across sessions. The caller
 * is responsible for tearing down the SignalR
 * connection (see <c>closeLiveConnection</c>).
 */
export function resetLiveStore(): void {
  state = initialState;
  subscribers.forEach((cb) => cb());
}

export function setConnected(connected: boolean, reconnecting = false): void {
  useLiveStore.setState({ connected, reconnecting });
}
