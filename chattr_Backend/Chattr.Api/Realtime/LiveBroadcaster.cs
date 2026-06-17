using Chattr.Api.Hubs;
using Chattr.Core.DTOs.Live;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace Chattr.Api.Realtime;

/// <summary>
/// Service that handlers inject to broadcast
/// live-update events to connected clients. Wraps
/// <c>IHubContext&lt;LiveHub, ILiveClient&gt;</c> so the
/// call site doesn't have to plumb the hub context
/// through every endpoint signature.
///
/// <para>
/// Group layout:
/// <list type="bullet">
///   <item><c>user-{userId}</c> — user-scoped events
///         (DMs, notifications, presence).</item>
///   <item><c>guild-{guildId}</c> — guild-scoped events
///         (channels, members, messages, vouches).</item>
/// </list>
/// </para>
/// </summary>
public sealed class LiveBroadcaster
{
    private readonly IHubContext<LiveHub, ILiveClient> _hub;
    private readonly ILogger<LiveBroadcaster> _logger;

    public LiveBroadcaster(
        IHubContext<LiveHub, ILiveClient> hub,
        ILogger<LiveBroadcaster> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public Task AddToUserGroup(string connectionId, int userId)
        => _hub.Groups.AddToGroupAsync(connectionId, UserGroup(userId));
    public Task RemoveFromUserGroup(string connectionId, int userId)
        => _hub.Groups.RemoveFromGroupAsync(connectionId, UserGroup(userId));
    public Task AddToGuildGroup(string connectionId, int guildId)
        => _hub.Groups.AddToGroupAsync(connectionId, GuildGroup(guildId));
    public Task RemoveFromGuildGroup(string connectionId, int guildId)
        => _hub.Groups.RemoveFromGroupAsync(connectionId, GuildGroup(guildId));

    public static string UserGroup(int userId) => $"user-{userId}";
    public static string GuildGroup(int guildId) => $"guild-{guildId}";

    // ---- Guild --------------------------------------------------
    public Task GuildCreated(GuildEventPayload p, int ownerUserId)
        => _hub.Clients.Group(UserGroup(ownerUserId)).GuildCreated(p);

    public Task GuildUpdated(int guildId, GuildEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).GuildUpdated(p);

    public Task GuildDeleted(int guildId, int ownerUserId)
    {
        var payload = new GuildDeletedPayload { GuildId = guildId };
        return Task.WhenAll(
            _hub.Clients.Group(GuildGroup(guildId)).GuildDeleted(payload),
            _hub.Clients.Group(UserGroup(ownerUserId)).GuildDeleted(payload));
    }

    /// <summary>
    /// Pushed to <c>user-{newUserId}</c> when the
    /// user is added to a guild (via the admin
    /// endpoint, an invite-accept, or self-join).
    /// The full guild payload lets the client
    /// render the new guild in the sidebar without
    /// an extra fetch.
    /// </summary>
    public Task YouWereAddedToGuild(int userId, GuildEventPayload p)
        => _hub.Clients.Group(UserGroup(userId)).YouWereAddedToGuild(p);

    public Task YouWereRemovedFromGuild(int userId, int guildId)
        => _hub.Clients.Group(UserGroup(userId))
            .YouWereRemovedFromGuild(new GuildDeletedPayload { GuildId = guildId });

    public Task GuildArchived(int guildId, bool isArchived)
    {
        var payload = new GuildArchivePayload { GuildId = guildId, IsArchived = isArchived };
        return _hub.Clients.Group(GuildGroup(guildId)).GuildArchived(payload);
    }

    public Task VouchAdded(int guildId, VouchPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).VouchAdded(p);
    public Task VouchRemoved(int guildId, VouchPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).VouchRemoved(p);
    public Task VanityUpdated(int guildId, VanityPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).VanityUpdated(p);

    // ---- Channels -----------------------------------------------
    public Task ChannelCreated(int guildId, ChannelEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).ChannelCreated(p);
    public Task ChannelUpdated(int guildId, ChannelEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).ChannelUpdated(p);
    public Task ChannelDeleted(int guildId, int channelId)
        => _hub.Clients.Group(GuildGroup(guildId))
            .ChannelDeleted(new ChannelDeletedPayload { GuildId = guildId, ChannelId = channelId });
    public Task ChannelsReordered(int guildId, List<int> channelIds)
        => _hub.Clients.Group(GuildGroup(guildId))
            .ChannelsReordered(new ChannelsReorderedPayload { GuildId = guildId, ChannelIds = channelIds });

    // ---- Members -----------------------------------------------
    public Task MemberJoined(int guildId, MemberEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).MemberJoined(p);
    public Task MemberLeft(int guildId, int userId)
        => _hub.Clients.Group(GuildGroup(guildId))
            .MemberLeft(new MemberLeftPayload { GuildId = guildId, UserId = userId });
    public Task MemberUpdated(int guildId, MemberEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).MemberUpdated(p);
    public Task MemberBanned(int guildId, int userId, string? reason)
        => Task.WhenAll(
            _hub.Clients.Group(GuildGroup(guildId))
                .MemberBanned(new MemberBannedPayload { GuildId = guildId, UserId = userId, Reason = reason }),
            _hub.Clients.Group(UserGroup(userId))
                .MemberBanned(new MemberBannedPayload { GuildId = guildId, UserId = userId, Reason = reason }));
    public Task MemberUnbanned(int guildId, int userId)
        => _hub.Clients.Group(GuildGroup(guildId))
            .MemberUnbanned(new MemberBannedPayload { GuildId = guildId, UserId = userId });

    // ---- Messages -----------------------------------------------
    public Task MessageCreated(int guildId, MessageEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).MessageCreated(p);
    public Task MessageUpdated(int guildId, MessageEventPayload p)
        => _hub.Clients.Group(GuildGroup(guildId)).MessageUpdated(p);
    public Task MessageDeleted(int guildId, int channelId, int messageId)
        => _hub.Clients.Group(GuildGroup(guildId))
            .MessageDeleted(new MessageDeletedPayload { ChannelId = channelId, MessageId = messageId });

    // ---- DMs ---------------------------------------------------
    public Task DmOpened(int userIdA, int userIdB, DmOpenedPayload p)
        => Task.WhenAll(
            _hub.Clients.Group(UserGroup(userIdA)).DmOpened(p),
            _hub.Clients.Group(UserGroup(userIdB)).DmOpened(p));
    public Task DmMessageCreated(int dmId, int userIdA, int userIdB, DmMessageEventPayload p)
        => Task.WhenAll(
            _hub.Clients.Group(UserGroup(userIdA)).DmMessageCreated(p),
            _hub.Clients.Group(UserGroup(userIdB)).DmMessageCreated(p));
    public Task DmMessageDeleted(int dmId, int userIdA, int userIdB, int messageId)
        => Task.WhenAll(
            _hub.Clients.Group(UserGroup(userIdA))
                .DmMessageDeleted(new DmMessageDeletedPayload { DmId = dmId, MessageId = messageId }),
            _hub.Clients.Group(UserGroup(userIdB))
                .DmMessageDeleted(new DmMessageDeletedPayload { DmId = dmId, MessageId = messageId }));

    // ---- Notifications -----------------------------------------
    public Task NotificationCreated(int userId, NotificationEventPayload p)
        => _hub.Clients.Group(UserGroup(userId)).NotificationCreated(p);
    public Task NotificationRead(int userId, int notificationId)
        => _hub.Clients.Group(UserGroup(userId))
            .NotificationRead(new NotificationReadPayload { NotificationId = notificationId });

    // ---- Presence ----------------------------------------------
    public Task PresenceChanged(PresenceEventPayload p)
        => _hub.Clients.All.PresenceChanged(p);
}
