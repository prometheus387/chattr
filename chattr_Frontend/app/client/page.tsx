"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";

import { useAuth } from "@/contexts/auth-provider";
import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import type {
  Channel,
  DmMessage,
  DmSummary,
  GuildSummary,
  Message,
  PresenceList,
  UserPresence,
} from "@/types/client";
import { GuildSidebar } from "@/components/client/guild-sidebar";
import { ChannelSidebar, type SidebarMode } from "@/components/client/channel-sidebar";
import { MessageList } from "@/components/client/message-list";
import { MessageInput } from "@/components/client/message-input";
import { UserList } from "@/components/client/user-list";
import { FriendsList } from "@/components/client/friends-list";
import { DmMessageList } from "@/components/client/dm-message-list";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const HEARTBEAT_MS = 30_000;
const POLL_MESSAGES_MS = 5_000;
const POLL_PRESENCE_MS = 15_000;

/**
 * What's currently shown in the left/middle columns.
 * - `friends`: home icon is active, channel sidebar shows recent DMs.
 * - `guild`:   a specific guild is active, channel sidebar shows its
 *              channels and the guild header with the dropdown.
 */
type Scope =
  | { kind: "friends" }
  | { kind: "guild"; guildId: number };

interface SelectionState {
  scope: Scope;
  channelId: number | null;  // guild scope
  dmId: number | null;       // friends scope
}

function defaultScopeFromGuilds(guilds: GuildSummary[]): Scope {
  return guilds[0] ? { kind: "guild", guildId: guilds[0].id } : { kind: "friends" };
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function ClientPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-sm text-white/50">
          Loading…
        </div>
      }
    >
      <ClientPageInner />
    </Suspense>
  );
}

function ClientPageInner() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---- Data stores --------------------------------------------------------
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [channelsByGuild, setChannelsByGuild] = useState<Record<number, Channel[]>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<PresenceList | null>(null);
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);

  // ---- UI state -----------------------------------------------------------
  const [selection, setSelection] = useState<SelectionState>({
    scope: { kind: "friends" },
    channelId: null,
    dmId: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leavingGuild, setLeavingGuild] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [openingDm, setOpeningDm] = useState(false);

  /**
   * On screens below `md` we can only show one of the two side panels
   * (channel/DM list, or chat/friends). This state tracks which one.
   * - `channels` → navigation list (channels or recent DMs) is visible
   * - `chat`     → main content (conversation or friends list) is visible
   * On `md`+ the className visibility becomes a no-op and both render.
   */
  const [mobileView, setMobileView] = useState<"channels" | "chat">(
    "channels",
  );

  // Auto-switch the mobile view when the user picks / leaves a channel.
  useEffect(() => {
    // In friends mode, the Friends list is always useful in the
    // center, so default to 'chat' even when no DM is selected.
    if (selection.scope.kind === "friends") {
      setMobileView("chat");
      return;
    }
    // In guild mode, the empty state ("Pick a channel…") is boring, so
    // keep the channels list visible until a channel is chosen.
    setMobileView(selection.channelId != null ? "chat" : "channels");
  }, [selection.scope.kind, selection.channelId]);

  // ---- Auth gate ----------------------------------------------------------
  useEffect(() => {
    if (auth.status === "loading") return;
    if (auth.status !== "authenticated") {
      router.replace("/signin");
    }
  }, [auth.status, router]);

  // ---- Initial load: guilds + presence + dms + heartbeat -----------------
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;

    (async () => {
      try {
        // Heartbeat in the background; ignore failures. We don't want
        // a transient heartbeat blip to block the whole initial load.
        api.presence.heartbeat().catch(() => undefined);

        const [gs, ps, ds] = await Promise.all([
          api.guilds.list(),
          api.presence.list(),
          // The DM list can fail (e.g. 401 if the token is mid-rotation);
          // a missing list is fine — the user just sees "No DMs".
          api.dms.list().catch(() => [] as DmSummary[]),
        ]);
        if (cancelled) return;
        setGuilds(gs);
        setPresence(ps);
        setDms(ds);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          auth.signOut();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.status, auth]);

  // ---- Restore selection from URL ----------------------------------------
  useEffect(() => {
    if (guilds.length === 0) return;
    const rawScope = searchParams.get("scope"); // "friends" or undefined
    const urlGuild = Number(searchParams.get("g")) || null;
    const urlChannel = Number(searchParams.get("c")) || null;
    const urlDm = Number(searchParams.get("dm")) || null;

    // Pick a sensible default scope.
    let scope: Scope =
      rawScope === "friends"
        ? { kind: "friends" }
        : urlGuild && guilds.some((g) => g.id === urlGuild)
          ? { kind: "guild", guildId: urlGuild }
          : defaultScopeFromGuilds(guilds);

    setSelection((prev) => {
      const next: SelectionState = { ...prev, scope };
      if (scope.kind === "guild") {
        // Don't snap the user out of a DM they have open.
        if (urlChannel) next.channelId = urlChannel;
        next.dmId = null;
      } else {
        next.channelId = null;
        if (urlDm && dms.some((d) => d.id === urlDm)) next.dmId = urlDm;
      }
      return next;
    });
  }, [guilds, dms, searchParams]);

  // ---- Load channels when guild changes ----------------------------------
  useEffect(() => {
    if (selection.scope.kind !== "guild") return;
    const guildId = selection.scope.guildId;
    if (channelsByGuild[guildId]) return; // cached
    let cancelled = false;
    (async () => {
      try {
        const cs = await api.guilds.channels(guildId);
        if (cancelled) return;
        setChannelsByGuild((prev) => ({ ...prev, [guildId]: cs }));
        // Pick first channel automatically if none selected or if the
        // selected one isn't in this guild's list.
        setSelection((prev) => {
          if (prev.scope.kind !== "guild" || prev.scope.guildId !== guildId) return prev;
          if (prev.channelId && cs.some((c) => c.id === prev.channelId)) return prev;
          return { ...prev, channelId: cs[0]?.id ?? null };
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load channels.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.scope, channelsByGuild]);

  // ---- Reload DMs when entering friends mode (cheap; small payload) ------
  useEffect(() => {
    if (selection.scope.kind !== "friends") return;
    let cancelled = false;
    api.dms.list().then((list) => {
      if (!cancelled) setDms(list);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selection.scope]);

  // ---- Sync URL whenever selection changes --------------------------------
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const params = new URLSearchParams();
    if (selection.scope.kind === "friends") {
      params.set("scope", "friends");
      if (selection.dmId != null) params.set("dm", String(selection.dmId));
    } else {
      if (selection.scope.guildId != null) params.set("g", String(selection.scope.guildId));
      if (selection.channelId != null) params.set("c", String(selection.channelId));
    }
    const qs = params.toString();
    const url = qs ? `/client?${qs}` : "/client";
    router.replace(url, { scroll: false });
  }, [selection, router, auth.status]);

  // ---- Messages: load on channel change, then poll -----------------------
  const lastMessageStampRef = useRef<number>(0);
  useEffect(() => {
    if (selection.scope.kind !== "guild" || selection.channelId == null) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async (sinceMs?: number) => {
      try {
        const data = await api.channels.messages(selection.channelId!, sinceMs ? 200 : 50);
        if (cancelled) return;
        if (sinceMs) {
          setMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            const fresh = data.filter((m) => !have.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        } else {
          setMessages(data);
        }
        if (data.length > 0) {
          lastMessageStampRef.current = Math.max(
            lastMessageStampRef.current,
            new Date(data[data.length - 1].createdAt).getTime(),
          );
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) auth.signOut();
      }
    };
    void load();
    const id = setInterval(() => void load(lastMessageStampRef.current), POLL_MESSAGES_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selection, auth]);

  // ---- DM messages: load on dmId change, then poll -----------------------
  const lastDmStampRef = useRef<number>(0);
  useEffect(() => {
    if (selection.scope.kind !== "friends" || selection.dmId == null) {
      setDmMessages([]);
      return;
    }
    let cancelled = false;
    const load = async (sinceMs?: number) => {
      try {
        const data = await api.dms.messages(selection.dmId!, sinceMs ? 200 : 50);
        if (cancelled) return;
        if (sinceMs) {
          setDmMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            const fresh = data.filter((m) => !have.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        } else {
          setDmMessages(data);
        }
        if (data.length > 0) {
          lastDmStampRef.current = Math.max(
            lastDmStampRef.current,
            new Date(data[data.length - 1].createdAt).getTime(),
          );
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) auth.signOut();
      }
    };
    void load();
    const id = setInterval(() => void load(lastDmStampRef.current), POLL_MESSAGES_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selection, auth]);

  // ---- Presence polling + heartbeat ---------------------------------------
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const p = await api.presence.list();
        if (!cancelled) setPresence(p);
      } catch {
        // ignore
      }
    };
    const hb = async () => {
      try {
        await api.presence.heartbeat();
      } catch {
        // ignore
      }
    };
    const presenceId = setInterval(tick, POLL_PRESENCE_MS);
    const hbId = setInterval(hb, HEARTBEAT_MS);
    void hb();
    return () => {
      cancelled = true;
      clearInterval(presenceId);
      clearInterval(hbId);
    };
  }, [auth.status, auth]);

  // ---- Handlers -----------------------------------------------------------
  const onSelectHome = useCallback(() => {
    setSelection((prev) => ({ ...prev, scope: { kind: "friends" }, channelId: null }));
  }, []);

  const onSelectGuild = useCallback((guildId: number) => {
    setSelection((prev) => ({
      ...prev,
      scope: { kind: "guild", guildId },
      // If we don't have channels for this guild cached yet, we'll set
      // channelId in the loader effect. For now drop it.
      channelId: prev.scope.kind === "guild" && prev.scope.guildId === guildId
        ? prev.channelId
        : null,
      dmId: null,
    }));
  }, []);

  const onSelectChannel = useCallback((channelId: number) => {
    setSelection((prev) => ({ ...prev, channelId }));
  }, []);

  const onSelectDm = useCallback((dmId: number) => {
    setSelection((prev) => ({ ...prev, dmId }));
  }, []);

  const onSend = useCallback(
    async (content: string) => {
      if (selection.scope.kind !== "guild" || selection.channelId == null) return;
      try {
        const msg = await api.channels.send(selection.channelId, content);
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
        lastMessageStampRef.current = Math.max(
          lastMessageStampRef.current,
          new Date(msg.createdAt).getTime(),
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          auth.signOut();
          return;
        }
        throw err;
      }
    },
    [selection, auth],
  );

  const onSendDm = useCallback(
    async (content: string) => {
      if (selection.scope.kind !== "friends" || selection.dmId == null) return;
      try {
        const msg = await api.dms.send(selection.dmId, content);
        setDmMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
        lastDmStampRef.current = Math.max(
          lastDmStampRef.current,
          new Date(msg.createdAt).getTime(),
        );
        // Bump the DM to the top of the recent list (optimistic).
        setDms((prev) => {
          const existing = prev.find((d) => d.id === msg.dmChannelId);
          if (!existing) {
            // The DM list was empty when we entered; re-fetch it.
            api.dms.list().then(setDms).catch(() => undefined);
            return prev;
          }
          const bumped: DmSummary = {
            ...existing,
            lastMessageAt: msg.createdAt,
            lastMessagePreview: msg.content.slice(0, 80),
          };
          const without = prev.filter((d) => d.id !== msg.dmChannelId);
          return [bumped, ...without].sort((a, b) => {
            const aT = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
            const bT = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
            return bT - aT;
          });
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          auth.signOut();
          return;
        }
        throw err;
      }
    },
    [selection, auth],
  );

  const onLeaveGuild = useCallback(async () => {
    if (selection.scope.kind !== "guild") return;
    const guildId = selection.scope.guildId;
    if (leavingGuild) return;
    setLeavingGuild(true);
    setLeaveError(null);
    try {
      const ok = await api.guilds.leave(guildId);
      if (!ok) {
        setLeaveError("You're not a member of that guild.");
        return;
      }
      const remaining = guilds.filter((g) => g.id !== guildId);
      setGuilds(remaining);
      setChannelsByGuild((prev) => {
        const { [guildId]: _drop, ...rest } = prev;
        return rest;
      });
      const next = remaining[0] ?? null;
      setSelection((prev) => ({
        ...prev,
        scope: next ? { kind: "guild", guildId: next.id } : { kind: "friends" },
        channelId: null,
        dmId: null,
      }));
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 409
            ? "You're the only owner. Transfer ownership first."
            : err.message
          : "Could not leave guild.";
      setLeaveError(msg);
    } finally {
      setLeavingGuild(false);
    }
  }, [selection.scope, leavingGuild, guilds, auth]);

  /** Open (or create) a DM with `userId` and switch to it. */
  const onOpenDmWith = useCallback(
    async (userId: number) => {
      if (openingDm) return;
      setOpeningDm(true);
      try {
        const dmId = await api.dms.openWith(userId);
        // Re-fetch the DM list so the new (or refreshed) row shows up.
        const list = await api.dms.list().catch(() => null);
        if (list) setDms(list);
        setSelection({
          scope: { kind: "friends" },
          channelId: null,
          dmId,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          auth.signOut();
          return;
        }
        // Best-effort: surface a generic error to the user via the
        // empty-state hint inside the sidebar.
        setError(err instanceof Error ? err.message : "Could not open DM.");
      } finally {
        setOpeningDm(false);
      }
    },
    [openingDm, auth],
  );

  /** Mobile-only: go back to the channel/DM list. */
  const onBackToSidebar = useCallback(() => {
    setMobileView("channels");
  }, []);

  // ---- Derived ------------------------------------------------------------
  const activeGuild = useMemo(() => {
    if (selection.scope.kind !== "guild") return null;
    // Pull the guildId into a local — this re-narrows `selection.scope`
    // to the guild variant and the closure can read it safely.
    const guildId = selection.scope.guildId;
    return guilds.find((g) => g.id === guildId) ?? null;
  }, [guilds, selection.scope]);
  const activeChannels = useMemo(
    () =>
      selection.scope.kind === "guild"
        ? channelsByGuild[selection.scope.guildId] ?? []
        : [],
    [channelsByGuild, selection.scope],
  );
  const activeChannel = useMemo(
    () => activeChannels.find((c) => c.id === selection.channelId) ?? null,
    [activeChannels, selection.channelId],
  );
  const activeDm = useMemo(
    () => dms.find((d) => d.id === selection.dmId) ?? null,
    [dms, selection.dmId],
  );
  /** Best-effort presence object for the active DM's other participant. */
  const dmOtherPresence: UserPresence | null = useMemo(() => {
    if (!activeDm || !presence) return null;
    const u = presence.users.find((p) => p.id === activeDm.otherUserId);
    if (u) return u;
    // Fall back to a synthesized presence object from the DM summary.
    return {
      id: activeDm.otherUserId,
      username: activeDm.otherUsername,
      displayName: activeDm.otherDisplayName,
      avatarUrl: activeDm.otherAvatarUrl,
      lastSeenAt: activeDm.otherLastSeenAt,
    };
  }, [activeDm, presence]);

  // ---- Sidebar-mode construction ------------------------------------------
  const sidebarMode: SidebarMode =
    selection.scope.kind === "friends"
      ? {
          kind: "friends",
          dms,
          activeDmId: selection.dmId,
          onSelectDm,
          onStartNewDm: () => {
            // For MVP: just focus the friends list in the center, where
            // the "Message" buttons live. A real "new DM" modal would
            // go here.
            setSelection((prev) => ({ ...prev, dmId: null }));
          },
        }
      : {
          kind: "guild",
          channels: activeChannels,
          activeChannelId: selection.channelId,
          onSelectChannel,
          guildHeader: activeGuild
            ? { name: activeGuild.name, isOwner: activeGuild.isOwner }
            : null,
          onLeaveGuild,
          leavingGuild,
          leaveError,
        };

  // ---- Render -------------------------------------------------------------
  if (auth.status === "loading" || auth.status !== "authenticated") {
    return <FullPageCenter>Loading session…</FullPageCenter>;
  }

  if (loading) {
    return <FullPageCenter>Loading client…</FullPageCenter>;
  }

  if (error) {
    return (
      <FullPageCenter>
        <div className="text-rose-300/90">{error}</div>
      </FullPageCenter>
    );
  }

  if (guilds.length === 0 && selection.scope.kind === "guild") {
    // Edge case: no guilds at all. Auto-flip to friends.
    return <FullPageCenter>Switching to friends…</FullPageCenter>;
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full">
      <GuildSidebar
        guilds={guilds}
        activeGuildId={
          selection.scope.kind === "guild" ? selection.scope.guildId : null
        }
        onSelect={onSelectGuild}
        onHome={onSelectHome}
        homeActive={selection.scope.kind === "friends"}
        className="shrink-0"
      />
      <ChannelSidebar
        mode={sidebarMode}
        className={clsx(
          // On mobile: only show when we're in the 'channels' view.
          mobileView === "channels" ? "flex" : "hidden",
          // On md+: always show.
          "md:flex",
        )}
      />
      <main
        className={clsx(
          "flex min-w-0 flex-1 flex-col",
          // On mobile: only show when we're in the 'chat' view.
          mobileView === "chat" ? "flex" : "hidden",
          // On md+: always show.
          "md:flex",
        )}
      >
        {selection.scope.kind === "friends" ? (
          activeDm ? (
            <>
              <DmMessageList
                other={dmOtherPresence}
                messages={dmMessages}
                onBack={onBackToSidebar}
              />
              <MessageInput
                onSend={onSendDm}
                placeholder={`Message @${activeDm.otherUsername}`}
              />
            </>
          ) : (
            <FriendsList
              currentUserId={auth.user!.id}
              users={presence?.users ?? []}
              showOffline={presence?.showOffline ?? false}
              onMessage={onOpenDmWith}
              onBack={onBackToSidebar}
              busy={openingDm}
            />
          )
        ) : activeChannel ? (
          <>
            <ChannelHeader channel={activeChannel} onBack={onBackToSidebar} />
            <MessageList messages={messages} />
            <MessageInput
              onSend={onSend}
              placeholder={
                activeChannel ? `Message #${activeChannel.name}` : "Message"
              }
            />
          </>
        ) : (
          <FullPageCenter>
            <p className="text-[13px] text-white/40">
              Pick a channel from the left to start chatting.
            </p>
          </FullPageCenter>
        )}
      </main>
      {presence && (
        <UserList
          users={presence.users}
          showOffline={presence.showOffline}
          // Right-side user list is only visible on lg+ (1024px+).
          // On mobile/tablet the Friends list in the center covers the
          // same info.
          className="hidden lg:flex w-60 shrink-0"
        />
      )}
    </div>
  );
}

function FullPageCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center text-sm text-white/50">
      {children}
    </div>
  );
}

function ChannelHeader({ channel, onBack }: { channel: Channel; onBack?: () => void }) {
  return (
    <div
      className={clsx(
        "flex h-12 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#0a0b0e] px-4 text-[13.5px] font-semibold text-white/85",
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mr-1 grid h-8 w-8 place-items-center rounded text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
          aria-label="Back to channels"
          title="Back"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      <span className="text-white/40">#</span>
      <span>{channel.name}</span>
    </div>
  );
}
