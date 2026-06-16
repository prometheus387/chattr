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
    public DateTime CreatedAt { get; init; }
}

/// <summary>
/// A guild member with their role and permission flags, so the admin
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
