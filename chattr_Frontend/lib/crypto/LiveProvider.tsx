"use client";

/**
 * LiveProvider — top-level wrapper that opens the
 * SignalR connection to <c>/hubs/live</c> when the
 * user signs in, subscribes every event into the
 * Zustand store, and tears the connection down on
 * sign-out.
 *
 * <para>
 * Mount once, near the root of the authenticated app
 * (next to the auth provider). Components inside the
 * tree can call <c>useLiveGuilds()</c> /
 * <c>useLiveChannels(guildId)</c> etc. and re-render
 * automatically when events arrive.
 * </para>
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import {
  closeLiveConnection,
  getLiveConnection,
  joinGuild,
  subscribeLive,
} from "@/lib/crypto/live";
import { setConnected, useLiveStore } from "@/lib/store/liveStore";
import { api } from "@/lib/api";

interface LiveContextValue {
  /** The current auth token. Components that need
   *  to drive additional hub calls (e.g. on channel
   *  enter) can read this; the typical path is the
   *  auto-subscribe on mount. */
  token: string;
}

const Context = createContext<LiveContextValue | null>(null);

/**
 * Hook: read the live context. Throws if used outside
 * a <c>LiveProvider</c> — same shape as the rest of
 * the crypto stores, gives a clear "this is a wiring
 * bug" error rather than silently returning null.
 */
export function useLiveContext(): LiveContextValue {
  const v = useContext(Context);
  if (!v) throw new Error("useLiveContext must be used inside <LiveProvider>.");
  return v;
}

/**
 * The list of guilds the user is in (used to auto-join
 * each guild's broadcast group on connect).
 */
async function fetchMyGuildIds(): Promise<number[]> {
  try {
    const list = await api.guilds.list();
    return list.map((g) => g.id);
  } catch {
    return [];
  }
}

export function LiveProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const value = useMemo<LiveContextValue>(() => ({ token }), [token]);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;

    void (async () => {
      try {
        const conn = await getLiveConnection(token);
        if (cancelled) return;

        // Wire every event into the store.
        teardown = subscribeLive(conn);

        // Mark the connection state so the UI can
        // show a "reconnecting…" banner if it drops.
        setConnected(true, false);

        // Auto-join each guild's group. We pull the
        // list from the REST endpoint, then call
        // JoinGuild for each. Idempotent on the server.
        // Parallel join: SignalR's invoke is async and
        // each round-trip is ~5ms locally, so for 30
        // guilds sequential = 150ms, parallel = ~10ms.
        // The hub's JoinGuild is also cheap (single
        // group-add), so we can fire all of them at
        // once without overwhelming it.
        const guildIds = await fetchMyGuildIds();
        await Promise.all(
          guildIds.map((id) => joinGuild(conn, id).catch(() => {}))
        );

        conn.onreconnecting(() => setConnected(false, true));
        conn.onreconnected(() => setConnected(true, false));
        conn.onclose(() => setConnected(false, false));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to open live hub:", err);
        if (!cancelled) setConnected(false, false);
      }
    })();

    return () => {
      cancelled = true;
      if (teardown) teardown();
      void closeLiveConnection();
      setConnected(false, false);
    };
  }, [token]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
