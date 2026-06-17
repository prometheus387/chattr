namespace Chattr.Core.DTOs.Live;

/// <summary>
/// Typed client surface of the <c>LiveHub</c>. Every
/// handler that mutates state (create guild, edit
/// message, kick member, etc.) ends with a call into
/// <c>LiveBroadcaster</c>, which routes to one of
/// these methods. The client receives the call,
/// updates its local store, and React re-renders.
///
/// <para>
/// Naming: server-to-client methods are <b>past-tense
/// nouns</b> (the event has happened) — <c>GuildCreated</c>,
/// <c>MessageDeleted</c>. The client-to-server methods
/// are <b>imperative verbs</b> — <c>JoinGuild</c>,
/// <c>LeaveChannel</c>. This split keeps the
/// signal-and-command sides unambiguous.
/// </para>
///
/// <para>
/// The interface lives in <c>Chattr.Core</c> so that
/// <c>Chattr.Infrastructure</c> (which holds the
/// <c>LiveBroadcaster</c> service) can reference the
/// payload types without taking a dependency on
/// <c>Chattr.Api</c>. The actual SignalR hub in
/// <c>Chattr.Api</c> implements this interface and is
/// the only place that depends on
/// <c>Microsoft.AspNetCore.SignalR</c>.
/// </para>
/// </summary>
public interface ILiveClient
{
    // ---- Guild --------------------------------------------------
    Task GuildCreated(GuildEventPayload payload);
    Task GuildUpdated(GuildEventPayload payload);
    Task GuildDeleted(GuildDeletedPayload payload);
    /// <summary>
    /// Pushed to the user's <c>user-{id}</c> group
    /// when they're added to a guild. Carries the
    /// full guild payload so the client renders it
    /// in the sidebar without an extra fetch and
    /// auto-joins the guild group on the hub.
    /// </summary>
    Task YouWereAddedToGuild(GuildEventPayload payload);
    /// <summary>
    /// Pushed to the user's <c>user-{id}</c> group
    /// when they're kicked or banned. Client removes
    /// the guild from the sidebar and unsubscribes
    /// from the guild group.
    /// </summary>
    Task YouWereRemovedFromGuild(GuildDeletedPayload payload);
    Task GuildArchived(GuildArchivePayload payload);
    Task VouchAdded(VouchPayload payload);
    Task VouchRemoved(VouchPayload payload);
    Task VanityUpdated(VanityPayload payload);

    // ---- Channels -----------------------------------------------
    Task ChannelCreated(ChannelEventPayload payload);
    Task ChannelUpdated(ChannelEventPayload payload);
    Task ChannelDeleted(ChannelDeletedPayload payload);
    Task ChannelsReordered(ChannelsReorderedPayload payload);

    // ---- Members -----------------------------------------------
    Task MemberJoined(MemberEventPayload payload);
    Task MemberLeft(MemberLeftPayload payload);
    Task MemberUpdated(MemberEventPayload payload);
    Task MemberBanned(MemberBannedPayload payload);
    Task MemberUnbanned(MemberBannedPayload payload);

    // ---- Messages (plain text channels) -----------------------
    Task MessageCreated(MessageEventPayload payload);
    Task MessageUpdated(MessageEventPayload payload);
    Task MessageDeleted(MessageDeletedPayload payload);

    // ---- Direct messages ---------------------------------------
    Task DmOpened(DmOpenedPayload payload);
    Task DmMessageCreated(DmMessageEventPayload payload);
    Task DmMessageDeleted(DmMessageDeletedPayload payload);

    // ---- Notifications -----------------------------------------
    Task NotificationCreated(NotificationEventPayload payload);
    Task NotificationRead(NotificationReadPayload payload);

    // ---- Presence ----------------------------------------------
    Task PresenceChanged(PresenceEventPayload payload);
}

public sealed class GuildEventPayload
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? IconUrl { get; set; }
    public int MemberCount { get; set; }
    public bool IsOwner { get; set; }
    public bool IsAdministrator { get; set; }
    public bool IsArchived { get; set; }
    public int VouchCount { get; set; }
    public int VouchLevel { get; set; }
    public string? VanitySlug { get; set; }
}

public sealed class GuildDeletedPayload
{
    public int GuildId { get; set; }
}

public sealed class GuildArchivePayload
{
    public int GuildId { get; set; }
    public bool IsArchived { get; set; }
}

public sealed class VouchPayload
{
    public int GuildId { get; set; }
    public int UserId { get; set; }
    public int VouchCount { get; set; }
    public int VouchLevel { get; set; }
}

public sealed class VanityPayload
{
    public int GuildId { get; set; }
    public string? Slug { get; set; }
}

public sealed class ChannelEventPayload
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Category { get; set; }
    public int Position { get; set; }
    public string? Kind { get; set; }
}

public sealed class ChannelDeletedPayload
{
    public int GuildId { get; set; }
    public int ChannelId { get; set; }
}

public sealed class ChannelsReorderedPayload
{
    public int GuildId { get; set; }
    public List<int> ChannelIds { get; set; } = new();
}

public sealed class MemberEventPayload
{
    public int GuildId { get; set; }
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? Nickname { get; set; }
    public int? RoleId { get; set; }
    public string? RoleName { get; set; }
    public string? RoleColor { get; set; }
    public string? RoleIconSvg { get; set; }
    public bool IsOwner { get; set; }
    public bool IsAdministrator { get; set; }
    public string JoinedAt { get; set; } = string.Empty;
}

public sealed class MemberLeftPayload
{
    public int GuildId { get; set; }
    public int UserId { get; set; }
}

public sealed class MemberBannedPayload
{
    public int GuildId { get; set; }
    public int UserId { get; set; }
    public string? Reason { get; set; }
}

public sealed class MessageEventPayload
{
    public int Id { get; set; }
    public int ChannelId { get; set; }
    public int AuthorId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public int? EditedAtUnix { get; set; }
    public int CreatedAtUnix { get; set; }
    public bool IsDeleted { get; set; }
    public string? AuthorRoleColor { get; set; }
    public string? AuthorRoleIconSvg { get; set; }
    public int? AuthorRoleId { get; set; }
    public string? AuthorRoleName { get; set; }
}

public sealed class MessageDeletedPayload
{
    public int ChannelId { get; set; }
    public int MessageId { get; set; }
}

public sealed class DmOpenedPayload
{
    public int Id { get; set; }
    public int OtherUserId { get; set; }
    public string OtherUsername { get; set; } = string.Empty;
    public string OtherDisplayName { get; set; } = string.Empty;
    public string? LastMessagePreview { get; set; }
    public string? LastMessageAt { get; set; }
}

public sealed class DmMessageEventPayload
{
    public int Id { get; set; }
    public int DmId { get; set; }
    public int SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
}

public sealed class DmMessageDeletedPayload
{
    public int DmId { get; set; }
    public int MessageId { get; set; }
}

public sealed class NotificationEventPayload
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Body { get; set; }
    public string? Link { get; set; }
    public int? GuildId { get; set; }
    public int? ChannelId { get; set; }
    public int? ActorUserId { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}

public sealed class NotificationReadPayload
{
    public int NotificationId { get; set; }
}

public sealed class PresenceEventPayload
{
    public int UserId { get; set; }
    public bool IsOnline { get; set; }
    public string? LastSeenAt { get; set; }
}
