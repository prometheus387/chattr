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
  GuildMember,
  GuildSummary,
  Message,
  PresenceList,
  Role,
  UserPresence,
} from "@/types/client";
import {
  seedLiveGuilds,
  useLiveGuilds,
} from "@/lib/store/liveStore";
import { LiveProvider } from "@/lib/crypto/LiveProvider";
import type { GuildEventPayload } from "@/lib/crypto/live";
import { GuildSidebar } from "@/components/client/guild-sidebar";
import { ChannelSidebar, type SidebarMode } from "@/components/client/channel-sidebar";
import { MessageList } from "@/components/client/message-list";
import { MessageInput } from "@/components/client/message-input";
import { UserList } from "@/components/client/user-list";
import { FriendsList } from "@/components/client/friends-list";
import { DmMessageList } from "@/components/client/dm-message-list";
import { CreateGuildModal } from "@/components/client/create-guild-modal";
import { GuildSettingsModal } from "@/components/client/guild-settings-modal";
import { InviteModal } from "@/components/client/invite-modal";
import { MemberContextMenu } from "@/components/client/guild-settings/member-context-menu";
import { ChannelContextMenu } from "@/components/client/channel-context-menu";
import { ChannelEditModal, DeleteChannelConfirm } from "@/components/client/channel-modals";
import { DmContextMenu } from "@/components/client/dm-context-menu";

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
  // The guild list lives in the live store (singleton) so
  // that SignalR events — GuildDeleted, YouWereRemovedFromGuild,
  // YouWereAddedToGuild — update the sidebar without a
  // manual setState round-trip. The page-level component
  // here seeds the store from the initial REST snapshot
  // (see the "Initial load" effect below).
  const liveGuilds = useLiveGuilds();
  // `GuildSummary` and `GuildEventPayload` are
  // structurally identical (same fields, same casing in
  // the JSON wire — the broadcaster hands us the same
  // shape REST would). Map with a single assertion at the
  // boundary so consumers don't have to repeat the cast.
  const guilds: GuildSummary[] = liveGuilds as GuildSummary[];
  const [channelsByGuild, setChannelsByGuild] = useState<Record<number, Channel[]>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<PresenceList | null>(null);
  // Per-guild member + role caches, keyed by guild id. We keep
  // them separate from the channels cache because they change
  // more often (people join/leave, role colours get tweaked)
  // and the user sidebar needs to refresh on a different
  // cadence than the channel tree.
  const [membersByGuild, setMembersByGuild] = useState<Record<number, GuildMember[]>>({});
  const [rolesByGuild, setRolesByGuild] = useState<Record<number, Role[]>>({});
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
  const [createGuildOpen, setCreateGuildOpen] = useState(false);
  const [settingsGuildId, setSettingsGuildId] = useState<number | null>(null);
  // Set when the user clicks "Invite people" in the guild
  // header. The InviteModal handles its own data fetching
  // — we just hold the anchor so the modal knows which
  // guild to mint an invite for.
  const [inviteModalGuildId, setInviteModalGuildId] = useState<number | null>(null);
  // Channel-level context menu / modals. Same pattern as
  // the member menu: one anchor at a time, edit + delete
  // driven by `canManageChannels` from the active guild.
  const [channelMenu, setChannelMenu] = useState<
    | { channel: Channel; x: number; y: number }
    | null
  >(null);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null);
  const [channelOpError, setChannelOpError] = useState<string | null>(null);
  // Per-DM context menu (Hide from list). Lives at the page
  // level so the sidebar / modal state is consistent with
  // the other context menus we already host here.
  const [dmMenu, setDmMenu] = useState<
    | { dm: DmSummary; x: number; y: number }
    | null
  >(null);
  // Per-guild context-menu anchor for member actions (kick,
  // ban, assign role). Lives here — not inside `MessageList` /
  // `UserList` — so only one menu can be open at a time, and
  // the data it needs (guild summary, roles, permissions)
  // already lives at the page level.
  const [memberMenu, setMemberMenu] = useState<
    | { member: GuildMember; x: number; y: number }
    | null
  >(null);
  // Counter the menu uses to ask the page to re-fetch its
  // member / role caches after a successful kick/ban/assign.
  const [memberReloadTick, setMemberReloadTick] = useState(0);

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
        // Seed the live store. After this, `useLiveGuilds()`
        // returns the same data and stays in sync with
        // subsequent SignalR events. LiveProvider will
        // JoinGuild for each one on connect, so the
        // sidebar pills light up immediately.
        seedLiveGuilds(gs as GuildEventPayload[]);
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
  // Tracks whether Effect A has had a chance to read the URL yet.
  // Effect B ("selection → URL") must not run before this is true,
  // otherwise it would overwrite a deep-linked URL (e.g. /client?g=7)
  // with the default `selection.scope = friends` before the deep link
  // has been applied. See the matching check in the URL-sync effect
  // further down.
  const urlHydratedRef = useRef(false);
  // The most recent URL query string we have already turned into a
  // selection (Effect A) or written back from a selection (Effect B).
  // We use it to break the Effect A → Effect B → Effect A loop that
  // happens because both effects create new object refs every time
  // they run, even when the values are unchanged.
  const lastSyncedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (guilds.length === 0) return;
    const urlStr = searchParams.toString();
    if (urlStr === lastSyncedUrlRef.current) return; // already in sync
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
      // No-op when the URL-derived state already matches `prev`. This
      // keeps the selection ref stable, so Effect B doesn't fire and
      // re-write the URL — that's the other half of the render loop.
      const sameScope =
        prev.scope.kind === next.scope.kind &&
        (prev.scope.kind !== "guild" ||
          prev.scope.guildId === (next.scope as { kind: "guild"; guildId: number }).guildId);
      if (
        sameScope &&
        prev.channelId === next.channelId &&
        prev.dmId === next.dmId
      ) {
        return prev;
      }
      return next;
    });

    // Mark the URL as processed from this point on. Effect B can now
    // safely start syncing selection → URL.
    urlHydratedRef.current = true;
    lastSyncedUrlRef.current = urlStr;
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

  // ---- Load members + roles when guild changes --------------------------
  // Drives the right-hand user sidebar. Both are cached by
  // guild id, same pattern as the channel list, so flipping
  // back to a guild you've visited before is instant. We also
  // re-fetch on `memberReloadTick` so kicks / bans performed
  // from the per-guild context menu propagate without forcing
  // the user to switch guilds.
  useEffect(() => {
    if (selection.scope.kind !== "guild") return;
    const guildId = selection.scope.guildId;
    // `memberReloadTick > 0` means an action from the per-guild
    // context menu just landed (kick / ban / assign). The cache
    // may now be stale, so bypass it and re-fetch. Tick 0 is
    // the initial mount — for that we honour the cache.
    const bypassCache = memberReloadTick > 0;
    if (!bypassCache && membersByGuild[guildId] && rolesByGuild[guildId]) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [members, roles] = await Promise.all([
          api.guildMembers.list(guildId),
          api.guildRoles.list(guildId),
        ]);
        if (cancelled) return;
        setMembersByGuild((prev) => ({ ...prev, [guildId]: members }));
        setRolesByGuild((prev) => ({ ...prev, [guildId]: roles }));
      } catch (err) {
        if (cancelled) return;
        // Non-fatal — the user sidebar will just show "no
        // members yet" until the next load. Logged in
        // dev tools if anyone cares.
        console.warn("Failed to load guild members/roles:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.scope, membersByGuild, rolesByGuild, memberReloadTick]);

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
    // Don't write to the URL until Effect A has had a chance to apply
    // any deep-link (?g=, ?c=, ?dm=). Otherwise the first auth tick
    // would clobber /client?g=7 with /client?scope=friends before the
    // guild id is read back out of the URL.
    if (!urlHydratedRef.current) return;
    const params = new URLSearchParams();
    if (selection.scope.kind === "friends") {
      params.set("scope", "friends");
      if (selection.dmId != null) params.set("dm", String(selection.dmId));
    } else {
      if (selection.scope.guildId != null) params.set("g", String(selection.scope.guildId));
      if (selection.channelId != null) params.set("c", String(selection.channelId));
    }
    const qs = params.toString();
    // Skip the router.replace when the URL already matches the selection.
    // Without this, Effect A's setSelection always returns a new object
    // (so selection ref changes), Effect B fires, calls router.replace,
    // searchParams changes, Effect A fires again — render loop.
    if (qs === lastSyncedUrlRef.current) return;
    lastSyncedUrlRef.current = qs;
    const url = qs ? `/client?${qs}` : "/client";
    router.replace(url, { scroll: false });
  }, [selection, router, auth.status]);

  // ---- Auto-switch scope when the active guild disappears ---------------
  // Fires when a `YouWereRemovedFromGuild`, `GuildDeleted`, or
  // (for archived guilds) `GuildArchived` event drops the
  // guild from the live store while the user has it open. We
  // pick the next available guild — or fall back to friends
  // when the user has no guilds left — and reset the
  // channel/DM selection so the channel sidebar has to
  // re-fetch.
  useEffect(() => {
    if (selection.scope.kind !== "guild") return;
    const activeId = selection.scope.guildId;
    if (guilds.some((g) => g.id === activeId)) return;
    const next = guilds[0] ?? null;
    setSelection((prev) => {
      if (prev.scope.kind !== "guild" || prev.scope.guildId === activeId) {
        return {
          ...prev,
          scope: next
            ? { kind: "guild", guildId: next.id }
            : { kind: "friends" },
          channelId: null,
          dmId: null,
        };
      }
      return prev;
    });
  }, [guilds, selection.scope]);

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
      // The backend fires `YouWereRemovedFromGuild` on the
      // user's SignalR group, which `subscribeLive` routes
      // into the live store — the guild disappears from the
      // sidebar automatically. We just have to drop the
      // cached channel list and pick the next scope.
      setChannelsByGuild((prev) => {
        const { [guildId]: _drop, ...rest } = prev;
        return rest;
      });
      const remaining = guilds.filter((g) => g.id !== guildId);
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

  /**
   * Switch the selection to the newly-created guild and let
   * the existing channel-loader effect pick up the seeded
   * channels. Called by `CreateGuildModal` on success.
   *
   * <para>
   * The backend broadcasts `GuildCreated` to the creator's
   * user group on the live hub, which the live store turns
   * into a sidebar row automatically — no manual insert
   * here.
   * </para>
   */
  const onGuildCreated = useCallback(
    (guild: GuildSummary) => {
      setSelection({
        scope: { kind: "guild", guildId: guild.id },
        channelId: null,
        dmId: null,
      });
    },
    [],
  );

  /**
   * No-op on the page level. The backend fires `GuildUpdated`
   * to the guild's SignalR group on rename / re-icon, and
   * the live store applies it to every connected client's
   * sidebar pill, channel-sidebar header, and activeGuild
   * reference automatically. Called by `GuildSettingsModal`
   * on a successful rename; we keep the callback so the
   * modal's contract doesn't change.
   */
  const onGuildUpdated = useCallback((_guild: GuildSummary) => {
    // Intentionally empty — see the doc-comment above.
  }, []);

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

  /** Open the per-guild member context menu at the given client coords. */
  const openMemberMenu = useCallback((member: GuildMember, x: number, y: number) => {
    setMemberMenu({ member, x, y });
  }, []);

  const closeMemberMenu = useCallback(() => {
    setMemberMenu(null);
  }, []);

  /**
   * Called by the context menu after a successful action so the
   * page's member / role caches re-fetch. Incrementing the tick
   * also closes the menu (the action handler does that), so
   * the only thing left to do here is bust the cache.
   */
  const onMemberMenuChanged = useCallback(() => {
    setMemberReloadTick((t) => t + 1);
  }, []);

  /** Open the invite modal for the active guild (no-op if none). */
  const onOpenInvite = useCallback(() => {
    if (selection.scope.kind !== "guild") return;
    setInviteModalGuildId(selection.scope.guildId);
  }, [selection.scope]);

  const onCloseInvite = useCallback(() => {
    setInviteModalGuildId(null);
  }, []);

  /** Open the channel context menu at the click point. */
  const openChannelContextMenu = useCallback(
    (channel: Channel, x: number, y: number) => {
      setChannelMenu({ channel, x, y });
    },
    [],
  );

  const closeChannelMenu = useCallback(() => {
    setChannelMenu(null);
  }, []);

  /** Open the DM context menu at the click point. */
  const openDmContextMenu = useCallback(
    (dm: DmSummary, x: number, y: number) => {
      setDmMenu({ dm, x, y });
    },
    [],
  );

  const closeDmMenu = useCallback(() => {
    setDmMenu(null);
  }, []);

  /**
   * "Hide from list" — filters the DM out of the local
   * `dms` cache. The conversation is still alive on the
   * server; the row will re-appear on the next list refresh
   * if a new message arrives, or if the user navigates away
   * and back. A real "delete conversation" would need a
   * server endpoint that also clears the other user's view,
   * which is a bigger design call.
   */
  const onHideDm = useCallback(
    (dmId: number) => {
      setDms((prev) => prev.filter((d) => d.id !== dmId));
      setSelection((prev) => {
        if (prev.scope.kind !== "friends") return prev;
        if (prev.dmId !== dmId) return prev;
        return { ...prev, dmId: null };
      });
    },
    [],
  );

  /**
   * Drag-and-drop reorder. We don't try to splice the
   * change into the local cache in-place — the server's
   * renumbering is straightforward (every other channel
   * gets bumped by 10) and the alternative is a class of
   * bugs where the client cache disagrees with the server.
   * On success we re-fetch the channel list for the
   * affected guild.
   */
  const onChannelReorder = useCallback(
    async (
      dragged: Channel,
      target: Channel,
      position: "before" | "after",
    ) => {
      // The server expects an *absolute* target position.
      // We compute a sensible one from the local cache so
      // the row lands at the new spot without us having to
      // re-fetch first. If the new position would be
      // negative or out of range, the server's
      // RenumberPositionsAsync clamps it for us.
      const list = channelsByGuild[dragged.guildId] ?? [];
      const targetIndex = list.findIndex((c) => c.id === target.id);
      if (targetIndex < 0) return;
      const insertAt = position === "before" ? targetIndex : targetIndex + 1;
      try {
        await api.guildChannels.update(dragged.guildId, dragged.id, {
          position: insertAt,
        });
        // Re-fetch so the cached list matches the server.
        const fresh = await api.guilds.channels(dragged.guildId);
        setChannelsByGuild((prev) => ({
          ...prev,
          [dragged.guildId]: fresh,
        }));
      } catch (err) {
        setChannelOpError(
          err instanceof ApiError
            ? err.status === 403
              ? "You don't have permission to reorder channels here."
              : err.message || "Could not reorder channel."
            : "Network error.",
        );
      }
    },
    [channelsByGuild],
  );

  /** Apply a server-issued channel update (rename, recategorise). */
  const onChannelSaved = useCallback((updated: Channel) => {
    setChannelsByGuild((prev) => {
      const list = prev[updated.guildId] ?? [];
      return {
        ...prev,
        [updated.guildId]: list.map((c) => (c.id === updated.id ? updated : c)),
      };
    });
    setEditingChannel(null);
  }, []);

  /** Delete a channel. Server returns 204; we filter the
   *  row out of the local cache so the sidebar updates
   *  immediately. If the deleted channel was the active
   *  one, we drop the user back to "no channel selected". */
  const onChannelDelete = useCallback(
    async (channel: Channel) => {
      setChannelOpError(null);
      try {
        await api.guildChannels.delete(channel.guildId, channel.id);
        setChannelsByGuild((prev) => {
          const list = prev[channel.guildId] ?? [];
          return {
            ...prev,
            [channel.guildId]: list.filter((c) => c.id !== channel.id),
          };
        });
        setDeletingChannel(null);
        setSelection((prev) => {
          if (selection.scope.kind !== "guild") return prev;
          if (selection.channelId !== channel.id) return prev;
          return { ...prev, channelId: null };
        });
      } catch (err) {
        setChannelOpError(
          err instanceof ApiError
            ? err.status === 403
              ? "You don't have permission to delete this channel."
              : err.status === 404
                ? "Channel no longer exists."
                : err.message || "Could not delete channel."
              : "Network error.",
        );
      }
    },
    [selection],
  );

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

  /**
   * Members and roles of the active guild, lifted out of the
   * per-guild cache so the chat / user-list can read them
   * without knowing about the cache layout.
   */
  const activeMembers = useMemo<GuildMember[]>(
    () =>
      selection.scope.kind === "guild"
        ? membersByGuild[selection.scope.guildId] ?? []
        : [],
    [membersByGuild, selection.scope],
  );
  const activeRoles = useMemo<Role[]>(
    () =>
      selection.scope.kind === "guild"
        ? rolesByGuild[selection.scope.guildId] ?? []
        : [],
    [rolesByGuild, selection.scope],
  );

  /**
   * Resolve the viewer's own role + position so we can decide
   * who they're allowed to kick / ban. Mirror of the logic in
   * the settings modal's members tab — the page-level
   * computation lets `MessageList` and `UserList` share the
   * same hierarchy view without each re-deriving it.
   */
  const viewerMember = useMemo(
    () => activeMembers.find((m) => m.userId === auth.user?.id) ?? null,
    [activeMembers, auth.user?.id],
  );
  const viewerRole = useMemo(
    () =>
      viewerMember
        ? activeRoles.find((r) => r.id === viewerMember.roleId) ?? null
        : null,
    [viewerMember, activeRoles],
  );
  const viewerIsAdmin =
    !!viewerRole?.permissions.isAdministrator ||
    activeGuild?.isAdministrator === true;
  const viewerCanMoveAnyone =
    activeGuild?.isOwner === true || viewerIsAdmin;
  const viewerPosition = viewerRole?.position ?? 0;

  /**
   * Members the viewer is NOT allowed to kick / ban. Owners
   * always qualify. Without the universal-bypass flag (owner
   * / admin), anyone at-or-above the viewer's tier is off
   * limits — the server enforces the same rule, the client
   * just hides the buttons so the user doesn't see 403s.
   */
  const untargetableIds = useMemo(() => {
    const out = new Set<number>();
    if (!activeGuild) return out;
    for (const m of activeMembers) {
      if (m.isOwner) {
        out.add(m.userId);
        continue;
      }
      if (viewerCanMoveAnyone) continue;
      const mRole = activeRoles.find((r) => r.id === m.roleId);
      if (!mRole) continue;
      if (mRole.position >= viewerPosition) out.add(m.userId);
    }
    return out;
  }, [activeGuild, activeMembers, activeRoles, viewerCanMoveAnyone, viewerPosition]);

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
          onDmContextMenu: openDmContextMenu,
        }
      : {
          kind: "guild",
          channels: activeChannels,
          activeChannelId: selection.channelId,
          onSelectChannel,
          guildHeader: activeGuild
            ? {
                name: activeGuild.name,
                isOwner: activeGuild.isOwner,
                isAdministrator: activeGuild.isAdministrator,
                canManageRoles: activeGuild.canManageRoles,
                canManageChannels: activeGuild.canManageChannels,
                canCreateInvite: activeGuild.canCreateInvite,
              }
            : null,
          onLeaveGuild,
          onInvite: onOpenInvite,
          onOpenSettings: () => {
            // Defense in depth: only open the settings modal if the
            // user holds at least one management flag. The server
            // re-checks every mutation regardless, but a member
            // without any power shouldn't even see the dialog.
            if (!activeGuild) return;
            if (
              activeGuild.isAdministrator ||
              activeGuild.canManageRoles ||
              activeGuild.canManageChannels
            ) {
              setSettingsGuildId(activeGuild.id);
            }
          },
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

  // Mount the live-hub provider only after the REST
  // snapshot has seeded the store and we have a token.
  // Wrapping earlier would race with the seed: a GuildUpdated
  // arriving in the millisecond between SignalR connect and
  // `seedLiveGuilds` would be overwritten by the snapshot.
  // Guarding on `auth.token` keeps the provider from trying
  // to connect during the loading states above (an empty
  // token makes SignalR's access-token factory return "" and
  // the backend rejects the negotiation with a 401).
  return (
    <LiveProvider token={auth.token ?? ""}>
      <div className="flex h-[calc(100vh-4rem)] w-full">
        <GuildSidebar
          guilds={guilds}
          activeGuildId={
            selection.scope.kind === "guild" ? selection.scope.guildId : null
          }
          onSelect={onSelectGuild}
          onHome={onSelectHome}
          homeActive={selection.scope.kind === "friends"}
          onCreate={() => setCreateGuildOpen(true)}
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
        onChannelContextMenu={openChannelContextMenu}
        onChannelReorder={
          activeGuild?.canManageChannels
            ? (dragged, target, position) =>
                void onChannelReorder(dragged, target, position)
            : undefined
        }
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
            // `key={activeDm.id}` so React remounts MessageInput
            // (and resets its internal state) on every DM switch.
            // The remount also drives the focus-on-mount effect
            // inside MessageInput, so the user lands in the
            // freshly-opened conversation ready to type.
            <>
              <DmMessageList
                other={dmOtherPresence}
                messages={dmMessages}
                onBack={onBackToSidebar}
              />
              <MessageInput
                key={`dm-${activeDm.id}`}
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
          // Same trick on the channel side: the `key` forces a
          // remount on channel switch, which keeps the focus
          // behaviour consistent with the DM flow.
          <>
            <ChannelHeader channel={activeChannel} onBack={onBackToSidebar} />
            <MessageList
              messages={messages}
              members={activeMembers}
              roles={activeRoles}
              untargetableIds={untargetableIds}
              viewerUserId={auth.user?.id ?? -1}
              viewer={{
                canAssign:
                  !!activeGuild?.isAdministrator ||
                  !!activeGuild?.canManageRoles,
                canKick: !!activeGuild?.canKickMembers,
                canBan: !!activeGuild?.canBanMembers,
              }}
              onMemberAction={openMemberMenu}
            />
            <MessageInput
              key={`channel-${activeChannel.id}`}
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
      {presence && selection.scope.kind === "guild" && (
        <UserList
          members={membersByGuild[selection.scope.guildId] ?? []}
          roles={rolesByGuild[selection.scope.guildId] ?? []}
          presences={presence.users}
          showOffline={presence.showOffline}
          // Per-guild moderation: clicking a member (left or
          // right) opens the page-level context menu. We pass
          // the same permission view as the chat and settings
          // modal use, so a member who's hidden in one place
          // is hidden everywhere.
          untargetableIds={untargetableIds}
          viewerUserId={auth.user?.id ?? -1}
          viewer={{
            canAssign:
              !!activeGuild?.isAdministrator ||
              !!activeGuild?.canManageRoles,
            canKick: !!activeGuild?.canKickMembers,
            canBan: !!activeGuild?.canBanMembers,
          }}
          onMemberAction={openMemberMenu}
          // Right-side user list is only visible on lg+ (1024px+).
          // On mobile/tablet the Friends list in the center covers the
          // same info.
          className="hidden lg:flex w-60 shrink-0"
        />
      )}
      <CreateGuildModal
        open={createGuildOpen}
        onClose={() => setCreateGuildOpen(false)}
        onCreated={onGuildCreated}
      />
      <GuildSettingsModal
        open={settingsGuildId !== null}
        guild={
          settingsGuildId === null
            ? null
            : guilds.find((g) => g.id === settingsGuildId) ?? null
        }
        onClose={() => setSettingsGuildId(null)}
        onUpdated={onGuildUpdated}
      />
      {inviteModalGuildId !== null
        ? (() => {
            const inviteGuild = guilds.find(
              (g) => g.id === inviteModalGuildId,
            );
            if (!inviteGuild) return null;
            return (
              <InviteModal
                open
                guild={inviteGuild}
                onClose={onCloseInvite}
              />
            );
          })()
        : null}
      {channelMenu && activeGuild ? (
        <ChannelContextMenu
          position={{ x: channelMenu.x, y: channelMenu.y }}
          channel={channelMenu.channel}
          canManage={activeGuild.canManageChannels}
          onClose={closeChannelMenu}
          onEdit={() => setEditingChannel(channelMenu.channel)}
          onDelete={() => setDeletingChannel(channelMenu.channel)}
        />
      ) : null}
      {dmMenu ? (
        <DmContextMenu
          position={{ x: dmMenu.x, y: dmMenu.y }}
          dm={dmMenu.dm}
          onClose={closeDmMenu}
          onHide={() => onHideDm(dmMenu.dm.id)}
        />
      ) : null}
      {editingChannel ? (
        <ChannelEditModal
          open
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSaved={onChannelSaved}
        />
      ) : null}
      {deletingChannel ? (
        <DeleteChannelConfirm
          channel={deletingChannel}
          busy={false}
          onCancel={() => setDeletingChannel(null)}
          onConfirm={() => {
            setDeletingChannel(null);
            void onChannelDelete(deletingChannel);
          }}
        />
      ) : null}
      {channelOpError ? (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[80] max-w-[360px] rounded-lg border border-rose-400/30 bg-rose-400/[0.10] px-4 py-3 text-[12.5px] text-rose-200/95 shadow-2xl shadow-black/40 backdrop-blur"
        >
          {channelOpError}
        </div>
      ) : null}
      {memberMenu && activeGuild ? (
        <MemberContextMenu
          position={{ x: memberMenu.x, y: memberMenu.y }}
          member={memberMenu.member}
          guild={activeGuild}
          roles={activeRoles}
          untargetableIds={untargetableIds}
          viewerUserId={auth.user?.id ?? -1}
          viewer={{
            canAssign:
              !!activeGuild.isAdministrator || !!activeGuild.canManageRoles,
            canKick: !!activeGuild.canKickMembers,
            canBan: !!activeGuild.canBanMembers,
          }}
          onClose={closeMemberMenu}
          onChanged={onMemberMenuChanged}
        />
      ) : null}
      </div>
    </LiveProvider>
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
