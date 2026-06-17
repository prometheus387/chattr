using Chattr.Core.DTOs.User;

namespace Chattr.Core.DTOs.Guild;

/// <summary>
/// Patch payload for renaming a guild. Only the fields you send get
/// applied — nulls are left as-is. The current API only exposes
/// <c>name</c>, but the wrapper leaves room for icon-url later.
/// </summary>
public class UpdateGuildDto
{
    public string? Name { get; set; }
    public string? IconUrl { get; set; }
}

/// <summary>
/// Detail view of a guild. Includes the role of the current user so
/// the client can decide whether to surface the settings UI.
/// </summary>
public class GuildDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? IconUrl { get; init; }
    public int MemberCount { get; init; }
    public bool IsOwner { get; init; }
    /// <summary>True iff the requesting user has a role with IsAdministrator.</summary>
    public bool IsAdministrator { get; init; }
    /// <summary>True iff the requesting user has a role with CanManageChannels.</summary>
    public bool CanManageChannels { get; init; }
    /// <summary>True iff the requesting user has a role with CanManageRoles.</summary>
    public bool CanManageRoles { get; init; }
    /// <summary>True iff the requesting user can kick other members.</summary>
    public bool CanKickMembers { get; init; }
    /// <summary>True iff the requesting user can ban other members.</summary>
    public bool CanBanMembers { get; init; }
    /// <summary>
    /// True iff the requesting user can create invite links.
    /// Drives the "Invite people" entry in the guild header
    /// dropdown.
    /// </summary>
    public bool CanCreateInvite { get; init; }
    /// <summary>
    /// Owner-archive flag. When true, the guild's channels /
    /// messages / roles are frozen for everyone except the
    /// owner; new joins via invite codes are rejected with
    /// 410. The settings UI surfaces this as a banner so
    /// the owner knows the guild isn't accepting new
    /// activity.
    /// </summary>
    public bool IsArchived { get; init; }
    public DateTime CreatedAt { get; init; }
}

/// <summary>
/// <summary>A guild member with their role and permission flags, so the admin
/// UI can render a list without an extra round-trip per user.
/// </summary>
public class GuildMemberDto
{
    public int UserId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public int RoleId { get; init; }
    public string RoleName { get; init; } = string.Empty;
    public string RoleColor { get; init; } = string.Empty;
    /// <summary>Sanitized inline-SVG role icon. Null when the role has no icon.</summary>
    public string? RoleIconSvg { get; init; }
    public bool IsOwner { get; init; }
    public bool IsAdministrator { get; init; }
    public DateTime JoinedAt { get; init; }
}

/// <summary>
/// Body for <c>POST /api/guilds/{id}/members</c>. The actor picks
/// an existing platform user and a role in the guild; the server
/// creates the <c>GuildMember</c> row with <c>IsOwner=false</c>.
/// Owner promotion is a separate transfer-ownership flow.
/// </summary>
public class AddMemberDto
{
    public int UserId { get; set; }
    public int RoleId { get; set; }
}

/// <summary>
/// Body for <c>POST /api/guilds/{id}/bans</c>. The user is removed
/// from the guild if they're still a member and a <c>GuildBan</c>
/// row is created (or refreshed if one already exists). Reason is
/// optional and capped at 500 chars on the server.
/// </summary>
public class BanMemberDto
{
    public int UserId { get; set; }
    public string? Reason { get; set; }
}

/// <summary>
/// Read-side view of an active ban. Returned by
/// <c>GET /api/guilds/{id}/bans</c> and the POST handler's
/// response so the client can show "who banned whom when".
/// </summary>
public class GuildBanDto
{
    public int Id { get; init; }
    public int UserId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public int BannedById { get; init; }
    public string BannedByUsername { get; init; } = string.Empty;
    public DateTime BannedAt { get; init; }
    public string? Reason { get; init; }
}
