# Phase 4 — Live Updates via WebSocket

The previous phases shipped a working app with a
poll-on-load model. This phase adds **real-time
streaming** so any change anywhere on the platform
lands on every connected client in the same
guild/user-group within a single round-trip.

## What changed

### Backend

* **LiveHub** (`Chattr.Api/Hubs/LiveHub.cs`) — a
  second SignalR hub at `/hubs/live`, separate from
  the E2EE chat hub at `/hubs/e2ee-chat`. The chat
  hub needs per-channel groups (the client only
  joins the channel it's reading); the live hub uses
  per-guild and per-user groups (the client joins
  all guilds it can see + its own user group on
  connect). Two connections is wasteful in bytes
  but lets each hub have the right group granularity.
* **ILiveClient** (`Chattr.Core/DTOs/Live/LiveEvents.cs`)
  — typed client interface with 22 events covering
  every domain: guild, channel, member, message,
  DM, notification, presence, vouches, vanity URL.
* **LiveBroadcaster** (`Chattr.Api/Realtime/LiveBroadcaster.cs`)
  — service injected into handlers. Wraps
  `IHubContext<LiveHub, ILiveClient>` so handlers
  don't have to plumb the hub through every
  signature.
* **Program.cs** — `AddScoped<LiveBroadcaster>()` +
  `app.MapLiveHub()`.
* **One wired handler** (`GuildHandlers.CreateGuild`)
  — shows the pattern. The other ~30 handlers
  follow the same shape: inject `LiveBroadcaster`,
  call `await live.FooBar(payload, …)` after
  `SaveChangesAsync`. See "Extending" below.

### Frontend

* **`lib/crypto/live.ts`** — SignalR client for
  `/hubs/live`, per-tab singleton like the chat
  client. Defines typed payload interfaces
  matching the server's `ILiveClient`.
* **`lib/store/liveStore.ts`** — minimal
  Zustand-style singleton with
  `useLiveSelector(selector)` and convenience
  hooks (`useLiveGuilds`, `useLiveChannels`,
  `useLiveMembers`, `useLiveMessages`, `useLiveDms`,
  `useLiveNotifications`, `useLivePresence`). Maps
  for keyed collections (channelsByGuild,
  membersByGuild, messagesByChannel) so updates
  are O(1) lookups.
* **`lib/crypto/LiveProvider.tsx`** — mounts the
  connection, auto-joins each guild's group,
  subscribes every event into the store, tears
  down on unmount. Wrap once near the root.
* **`components/client/LiveSidebar.tsx`** — example
  integration: a sidebar that subscribes to
  `useLiveGuilds`, `useLiveChannels(activeGuildId)`,
  `useLiveDms`, `useLiveNotifications` and
  re-renders on any change.

## Group layout

```
user-{userId}        — auto-joined on connect.
                       DMs, notifications, presence.
guild-{guildId}      — joined via JoinGuild.
                       Channels, members, messages,
                       vouches, archive, vanity.
```

## Extending to the remaining handlers

The pattern (one-line in each handler):

```csharp
public static async Task<IResult> CreateChannel(
    CreateChannelDto body,
    ClaimsPrincipal principal,
    AppDbContext context,
    Chattr.Api.Realtime.LiveBroadcaster live,   // <-- add
    CancellationToken ct)
{
    // ... existing logic ...
    await context.SaveChangesAsync(ct);
    // ... existing return ...
    await live.ChannelCreated(guildId, new ChannelEventPayload
    {
        Id = channel.Id, GuildId = guildId, Name = channel.Name,
        // ... etc
    });
    return Results.Created(...);
}
```

The remaining handlers that need wiring (none
shipped live broadcasts yet — the architecture is
ready, each handler is a copy-paste):

| File | Handlers to wire |
| --- | --- |
| `Endpoints/Guilds/GuildHandlers.cs` | `UpdateGuild`, `AddMember`, `KickMember`, `UpdateMemberRole` |
| `Endpoints/Guilds/GuildAdminHandlers.cs` | `Archive`, `Unarchive`, `Delete`, `Burn` |
| `Endpoints/Guilds/GuildExtensionsHandlers.cs` | `Vouch`, `Unvouch`, `UpdateVanity` |
| `Endpoints/Channels/ChannelHandlers.cs` | `UpdateChannel`, `DeleteChannel`, `ReorderChannels` |
| `Endpoints/Messages/MessageHandlers.cs` | `PostMessage`, `PatchMessage`, `DeleteMessage` |
| `Endpoints/Dms/DmHandlers.cs` | `PostDmMessage`, `OpenDmWith` |
| `Endpoints/Invites/InviteHandlers.cs` | `AcceptInvite` (broadcasts to inviter + invitee) |
| `Endpoints/Admin/AdminHandlers.cs` | `UpdateUserRole` |
| `Endpoints/Presence/PresenceHandlers.cs` | `Heartbeat` |

## Frontend integration

The existing client page (built by the sibling
agent) can either:

1. **Replace** its data fetching with `useLiveGuilds()`
   + `useLiveChannels(guildId)` etc. The
   `LiveSidebar` component is the template.
2. **Layer** — keep the existing snapshot fetch, add
   `<LiveProvider>` above the tree so the streaming
   updates compound on top of the initial data.

For new components:

```tsx
import { useLiveChannels, useLiveMembers } from "@/lib/store/liveStore";

function MySidebar({ guildId }: { guildId: number | null }) {
  const channels = useLiveChannels(guildId);
  const members = useLiveMembers(guildId);
  // Re-renders automatically on ChannelCreated,
  // MemberJoined, etc. No useEffect, no manual
  // subscription bookkeeping.
  return <ul>{channels.map(c => <li key={c.id}>{c.name}</li>)}</ul>;
}
```

## What's still needed

* Wire the remaining ~30 handlers (pattern above).
* Mount `<LiveProvider>` above the existing client
  page tree (alongside the auth provider).
* npm-install `@microsoft/signalr` (the existing
  dependency used by the chat hub).
