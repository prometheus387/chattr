"use client";

/**
 * SignalR client for the live-update hub
 * (<c>/hubs/live</c>). The hub broadcasts all non-chat
 * events: guilds, channels, members, plain-text
 * messages, DMs, notifications, presence.
 *
 * <para>
 * This is a separate connection from the E2EE chat
 * hub (<c>lib/crypto/signalr.ts</c>, mounted at
 * <c>/hubs/e2ee-chat</c>). Two connections is
 * wasteful in bytes but lets the chat hub stay
 * scoped to a single channel group per session
 * while the live hub fans out to all guilds and
 * user-scoped groups. SignalR is designed for this
 * — connections are cheap.
 * </para>
 *
 * <para>
 * The event handlers here just dispatch into the
 * Zustand store (see <c>liveStore.ts</c>). Components
 * read the store with selector hooks, React
 * re-renders, no manual subscription bookkeeping.
 * </para>
 */

import * as signalR from "@microsoft/signalr";

import { useLiveStore, type LiveState } from "@/lib/store/liveStore";

let cachedConnection: signalR.HubConnection | null = null;
let cachedToken: string | null = null;

/**
 * Wire-shape mirroring the server's <c>ILiveClient</c>
 * (each method corresponds to one <c>ILiveClient</c>
 * entry). Field names are camelCased — the server's
 * <c>System.Text.Json</c> defaults produce this shape.
 */
export interface GuildEventPayload {
  id: number;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  isOwner: boolean;
  isAdministrator: boolean;
  isArchived: boolean;
  vouchCount: number;
  vouchLevel: number;
  vanitySlug: string | null;
  // Per-viewer permission flags. Mirrors the server's
  // EffectiveGuildPermissions — populated by the live
  // broadcaster for the *specific* recipient so the
  // sidebar / settings modal can render permission-gated
  // affordances straight from the cached event.
  canManageChannels: boolean;
  canManageRoles: boolean;
  canKickMembers: boolean;
  canBanMembers: boolean;
  canCreateInvite: boolean;
}
export interface GuildDeletedPayload {
  guildId: number;
}
export interface GuildArchivePayload {
  guildId: number;
  isArchived: boolean;
}
export interface VouchPayload {
  guildId: number;
  userId: number;
  vouchCount: number;
  vouchLevel: number;
}
export interface VanityPayload {
  guildId: number;
  slug: string | null;
}
export interface ChannelEventPayload {
  id: number;
  guildId: number;
  name: string;
  category: string | null;
  position: number;
  kind: string | null;
}
export interface ChannelDeletedPayload {
  guildId: number;
  channelId: number;
}
export interface ChannelsReorderedPayload {
  guildId: number;
  channelIds: number[];
}
export interface MemberEventPayload {
  guildId: number;
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  nickname: string | null;
  roleId: number | null;
  roleName: string | null;
  roleColor: string | null;
  roleIconSvg: string | null;
  isOwner: boolean;
  isAdministrator: boolean;
  joinedAt: string;
}
export interface MemberLeftPayload {
  guildId: number;
  userId: number;
}
export interface MemberBannedPayload {
  guildId: number;
  userId: number;
  reason: string | null;
}
export interface MessageEventPayload {
  id: number;
  channelId: number;
  authorId: number;
  authorName: string;
  content: string;
  editedAtUnix: number | null;
  createdAtUnix: number;
  isDeleted: boolean;
  authorRoleColor: string | null;
  authorRoleIconSvg: string | null;
  authorRoleId: number | null;
  authorRoleName: string | null;
}
export interface MessageDeletedPayload {
  channelId: number;
  messageId: number;
}
export interface DmOpenedPayload {
  id: number;
  otherUserId: number;
  otherUsername: string;
  otherDisplayName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}
export interface DmMessageEventPayload {
  id: number;
  dmId: number;
  senderId: number;
  senderName: string;
  content: string;
  createdAt: string;
}
export interface DmMessageDeletedPayload {
  dmId: number;
  messageId: number;
}
export interface NotificationEventPayload {
  id: number;
  userId: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  guildId: number | null;
  channelId: number | null;
  actorUserId: number | null;
  createdAt: string;
}
export interface NotificationReadPayload {
  notificationId: number;
}
export interface PresenceEventPayload {
  userId: number;
  isOnline: boolean;
  lastSeenAt: string | null;
}

/**
 * Get-or-create the live-hub connection for this tab.
 * Re-uses the same per-tab singleton across re-renders
 * and across HMR reloads in dev.
 */
export async function getLiveConnection(
  token: string,
): Promise<signalR.HubConnection> {
  if (cachedConnection && cachedToken === token) {
    if (cachedConnection.state === signalR.HubConnectionState.Connected)
      return cachedConnection;
    if (cachedConnection.state === signalR.HubConnectionState.Connecting) {
      await cachedConnection.start();
      return cachedConnection;
    }
  }
  if (cachedConnection) {
    try { await cachedConnection.stop(); } catch { /* best effort */ }
    cachedConnection = null;
  }

  cachedConnection = new signalR.HubConnectionBuilder()
    .withUrl("/hubs/live", {
      accessTokenFactory: () => token,
    })
    .withAutomaticReconnect({
      // Same backoff as the chat hub.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nextRetryDelayInMilliseconds: (ctx: any) => {
        const delays = [0, 2000, 5000, 10000, 30000];
        return delays[ctx.previousRetryCount] ?? 30000;
      },
    })
    .configureLogging(signalR.LogLevel.Warning)
    .build();
  cachedToken = token;
  await cachedConnection.start();
  return cachedConnection;
}

export async function closeLiveConnection(): Promise<void> {
  if (!cachedConnection) return;
  try { await cachedConnection.stop(); } catch { /* ignore */ }
  cachedConnection = null;
  cachedToken = null;
}

/**
 * Join a guild's broadcast group. Idempotent on the
 * server side. Call this when the user opens a
 * guild in the sidebar so they start receiving
 * channel / member / message updates.
 */
export async function joinGuild(
  conn: signalR.HubConnection,
  guildId: number,
): Promise<void> {
  await conn.invoke("JoinGuild", guildId);
}

export async function leaveGuild(
  conn: signalR.HubConnection,
  guildId: number,
): Promise<void> {
  await conn.invoke("LeaveGuild", guildId);
}

/**
 * Wire every event from the live hub into the Zustand
 * store. Returns a teardown function the caller
 * should call on unmount.
 *
 * <para>
 * This is the single source of truth for "what does
 * the client do when an event arrives?". The store
 * updates, components re-render. We never call
 * <c>setState</c> from event handlers — every update
 * is a pure function of (current state, event).
 * </para>
 */
export function subscribeLive(
  conn: signalR.HubConnection,
): () => void {
  // We capture the store at subscription time and
  // apply events to it. The store itself is a
  // module-level singleton (see liveStore.ts), so
  // any component reading from it will see the
  // updates on the next render.
  const apply = (mutator: (state: LiveState) => Partial<LiveState> | void) =>
    useLiveStore.setState((s) => (mutator(s) as Partial<LiveState>) || {});

  const subs: Array<() => void> = [];

  // ---- Guild ----
  subs.push(on(conn, "GuildCreated", (p: GuildEventPayload) => {
    apply((s) => ({ guilds: new Map(s.guilds).set(p.id, p) }));
  }));
  subs.push(on(conn, "GuildUpdated", (p: GuildEventPayload) => {
    apply((s) => ({ guilds: new Map(s.guilds).set(p.id, p) }));
  }));
  subs.push(on(conn, "GuildDeleted", (p: GuildDeletedPayload) => {
    apply((s) => {
      const next = new Map(s.guilds);
      next.delete(p.guildId);
      // Drop any cached channels/members for this
      // guild too — they're stale.
      const channelsByGuild = new Map(s.channelsByGuild);
      channelsByGuild.delete(p.guildId);
      const membersByGuild = new Map(s.membersByGuild);
      membersByGuild.delete(p.guildId);
      return { guilds: next, channelsByGuild, membersByGuild };
    });
  }));
  subs.push(on(conn, "YouWereAddedToGuild", (p: GuildEventPayload) => {
    // The user just got added to a guild (e.g. a
    // platform admin dropped them in). Add it to
    // their sidebar immediately AND ask the hub to
    // start pushing guild-group events for it. The
    // hub's JoinGuild is idempotent so a duplicate
    // call (e.g. we already auto-joined it on
    // connect) is a no-op.
    apply((s) => ({ guilds: new Map(s.guilds).set(p.id, p) }));
    void getLiveConnection(cachedToken ?? "").then((conn) =>
      joinGuild(conn, p.id).catch(() => undefined),
    );
  }));
  subs.push(on(conn, "YouWereRemovedFromGuild", (p: GuildDeletedPayload) => {
    apply((s) => {
      const next = new Map(s.guilds);
      next.delete(p.guildId);
      const channelsByGuild = new Map(s.channelsByGuild);
      channelsByGuild.delete(p.guildId);
      const membersByGuild = new Map(s.membersByGuild);
      membersByGuild.delete(p.guildId);
      return { guilds: next, channelsByGuild, membersByGuild };
    });
    // Drop the hub subscription too. Best-effort —
    // we don't block the UI on it.
    void getLiveConnection(cachedToken ?? "").then((conn) =>
      leaveGuild(conn, p.guildId).catch(() => undefined),
    );
  }));
  subs.push(on(conn, "GuildArchived", (p: GuildArchivePayload) => {
    apply((s) => {
      const g = s.guilds.get(p.guildId);
      if (!g) return {};
      const updated = { ...g, isArchived: p.isArchived };
      return { guilds: new Map(s.guilds).set(p.guildId, updated) };
    });
  }));
  subs.push(on(conn, "VouchAdded", (p: VouchPayload) => {
    apply((s) => {
      const g = s.guilds.get(p.guildId);
      if (!g) return {};
      return {
        guilds: new Map(s.guilds).set(p.guildId, {
          ...g, vouchCount: p.vouchCount, vouchLevel: p.vouchLevel,
        }),
      };
    });
  }));
  subs.push(on(conn, "VouchRemoved", (p: VouchPayload) => {
    apply((s) => {
      const g = s.guilds.get(p.guildId);
      if (!g) return {};
      return {
        guilds: new Map(s.guilds).set(p.guildId, {
          ...g, vouchCount: p.vouchCount, vouchLevel: p.vouchLevel,
        }),
      };
    });
  }));
  subs.push(on(conn, "VanityUpdated", (p: VanityPayload) => {
    apply((s) => {
      const g = s.guilds.get(p.guildId);
      if (!g) return {};
      return { guilds: new Map(s.guilds).set(p.guildId, { ...g, vanitySlug: p.slug }) };
    });
  }));

  // ---- Channels ----
  subs.push(on(conn, "ChannelCreated", (p: ChannelEventPayload) => {
    apply((s) => {
      const list = s.channelsByGuild.get(p.guildId) ?? [];
      const next = [...list.filter((c) => c.id !== p.id), p]
        .sort((a, b) => a.position - b.position);
      return {
        channelsByGuild: new Map(s.channelsByGuild).set(p.guildId, next),
      };
    });
  }));
  subs.push(on(conn, "ChannelUpdated", (p: ChannelEventPayload) => {
    apply((s) => {
      const list = s.channelsByGuild.get(p.guildId) ?? [];
      const next = list.map((c) => (c.id === p.id ? p : c));
      return { channelsByGuild: new Map(s.channelsByGuild).set(p.guildId, next) };
    });
  }));
  subs.push(on(conn, "ChannelDeleted", (p: ChannelDeletedPayload) => {
    apply((s) => {
      const list = s.channelsByGuild.get(p.guildId) ?? [];
      const next = list.filter((c) => c.id !== p.channelId);
      return { channelsByGuild: new Map(s.channelsByGuild).set(p.guildId, next) };
    });
  }));
  subs.push(on(conn, "ChannelsReordered", (p: ChannelsReorderedPayload) => {
    apply((s) => {
      const list = s.channelsByGuild.get(p.guildId) ?? [];
      const byId = new Map(list.map((c) => [c.id, c]));
      const next = p.channelIds
        .map((id, idx) => {
          const c = byId.get(id);
          if (!c) return null;
          return { ...c, position: idx };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      return { channelsByGuild: new Map(s.channelsByGuild).set(p.guildId, next) };
    });
  }));

  // ---- Members ----
  subs.push(on(conn, "MemberJoined", (p: MemberEventPayload) => {
    apply((s) => {
      const list = s.membersByGuild.get(p.guildId) ?? [];
      const next = [...list.filter((m) => m.userId !== p.userId), p];
      return { membersByGuild: new Map(s.membersByGuild).set(p.guildId, next) };
    });
  }));
  subs.push(on(conn, "MemberLeft", (p: MemberLeftPayload) => {
    apply((s) => {
      const list = s.membersByGuild.get(p.guildId) ?? [];
      const next = list.filter((m) => m.userId !== p.userId);
      return { membersByGuild: new Map(s.membersByGuild).set(p.guildId, next) };
    });
  }));
  subs.push(on(conn, "MemberUpdated", (p: MemberEventPayload) => {
    apply((s) => {
      const list = s.membersByGuild.get(p.guildId) ?? [];
      const next = list.map((m) => (m.userId === p.userId ? p : m));
      return { membersByGuild: new Map(s.membersByGuild).set(p.guildId, next) };
    });
  }));
  subs.push(on(conn, "MemberBanned", (p: MemberBannedPayload) => {
    apply((s) => {
      const list = s.membersByGuild.get(p.guildId) ?? [];
      const next = list.filter((m) => m.userId !== p.userId);
      const guild = s.guilds.get(p.guildId);
      return {
        membersByGuild: new Map(s.membersByGuild).set(p.guildId, next),
        guilds: guild
          ? new Map(s.guilds).set(p.guildId, {
              ...guild,
              memberCount: Math.max(0, guild.memberCount - 1),
            })
          : s.guilds,
      };
    });
  }));
  subs.push(on(conn, "MemberUnbanned", (p: MemberBannedPayload) => {
    // Unban doesn't auto-rejoin; the user has to
    // re-accept an invite. We just clear any cached
    // member row in case the client had it.
    apply((s) => {
      const list = s.membersByGuild.get(p.guildId) ?? [];
      const next = list.filter((m) => m.userId !== p.userId);
      return { membersByGuild: new Map(s.membersByGuild).set(p.guildId, next) };
    });
  }));

  // ---- Messages (plain text channels) ----
  subs.push(on(conn, "MessageCreated", (p: MessageEventPayload) => {
    apply((s) => {
      const list = s.messagesByChannel.get(p.channelId) ?? [];
      // De-dup by id: optimistic insert may have
      // added the message already.
      if (list.some((m) => m.id === p.id)) return {};
      const next = [...list, p];
      return { messagesByChannel: new Map(s.messagesByChannel).set(p.channelId, next) };
    });
  }));
  subs.push(on(conn, "MessageUpdated", (p: MessageEventPayload) => {
    apply((s) => {
      const list = s.messagesByChannel.get(p.channelId) ?? [];
      const next = list.map((m) => (m.id === p.id ? p : m));
      return { messagesByChannel: new Map(s.messagesByChannel).set(p.channelId, next) };
    });
  }));
  subs.push(on(conn, "MessageDeleted", (p: MessageDeletedPayload) => {
    apply((s) => {
      const list = s.messagesByChannel.get(p.channelId) ?? [];
      const next = list.filter((m) => m.id !== p.messageId);
      return { messagesByChannel: new Map(s.messagesByChannel).set(p.channelId, next) };
    });
  }));

  // ---- DMs ----
  subs.push(on(conn, "DmOpened", (p: DmOpenedPayload) => {
    apply((s) => {
      const idx = s.dms.findIndex((d) => d.id === p.id);
      const next = idx >= 0
        ? s.dms.map((d) => (d.id === p.id ? p : d))
        : [p, ...s.dms];
      return { dms: next };
    });
  }));
  subs.push(on(conn, "DmMessageCreated", (p: DmMessageEventPayload) => {
    apply((s) => {
      const list = s.dmMessages.get(p.dmId) ?? [];
      if (list.some((m) => m.id === p.id)) return {};
      const next = [...list, p];
      return { dmMessages: new Map(s.dmMessages).set(p.dmId, next) };
    });
  }));
  subs.push(on(conn, "DmMessageDeleted", (p: DmMessageDeletedPayload) => {
    apply((s) => {
      const list = s.dmMessages.get(p.dmId) ?? [];
      const next = list.filter((m) => m.id !== p.messageId);
      return { dmMessages: new Map(s.dmMessages).set(p.dmId, next) };
    });
  }));

  // ---- Notifications ----
  subs.push(on(conn, "NotificationCreated", (p: NotificationEventPayload) => {
    apply((s) => ({ notifications: [p, ...s.notifications] }));
  }));
  subs.push(on(conn, "NotificationRead", (p: NotificationReadPayload) => {
    apply((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === p.notificationId ? { ...n, /* mark as read */ read: true } : n),
    }));
  }));

  // ---- Presence ----
  subs.push(on(conn, "PresenceChanged", (p: PresenceEventPayload) => {
    apply((s) => {
      const next = new Map(s.presence);
      next.set(p.userId, {
        isOnline: p.isOnline,
        lastSeenAt: p.lastSeenAt,
      });
      return { presence: next };
    });
  }));

  return () => subs.forEach((u) => u());
}

function on<T>(
  conn: signalR.HubConnection,
  event: string,
  handler: (payload: T) => void,
): () => void {
  conn.on(event, handler);
  return () => {
    conn.off(event, handler);
  };
}
