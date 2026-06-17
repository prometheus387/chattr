using Chattr.Core.Constants;

namespace Chattr.Core.DTOs.Guild;

/// <summary>Body for adding a vouch to a guild.</summary>
public class CreateVouchDto
{
    // Empty for now — a vouch is a binary "you vouch" with no
    // text. Keeping the DTO shape stable for future fields
    // (e.g. an optional reason / category).
}

/// <summary>
/// Vouch entry as exposed to the client. The User fields
/// mirror <see cref="Chattr.Core.DTOs.User.PublicUserDto"/>
/// (display name + avatar) so the dashboard can render the
/// list of vouches with the same shape as a member row.
/// </summary>
public class VouchDto
{
    public int Id { get; init; }
    public int GuildId { get; init; }
    public int UserId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public DateTime CreatedAt { get; init; }
}

/// <summary>Per-guild vouch stats + tier info, used by the
/// settings "Vouches" tab and the guild summary card.</summary>
public class VouchSummaryDto
{
    public int VouchCount { get; init; }
    public int VouchLevel { get; init; }
    /// <summary>True when the calling user has already vouched.</summary>
    public bool VouchedByMe { get; init; }
    /// <summary>The perks currently unlocked for the calling user
    /// (filtered by the guild's vouch level).</summary>
    public List<string> UnlockedPerks { get; init; } = new();
}

/// <summary>
/// Body for setting the vanity slug. Server enforces
/// <c>VouchLevel >= 3</c>.
/// </summary>
public class SetVanitySlugDto
{
    public string Slug { get; set; } = string.Empty;
}

/// <summary>
/// Vanity slug info returned by
/// <c>GET /api/guilds/{id}/vanity</c>. Lives on the guild
/// itself, only writable at vouch level 3.
/// </summary>
public class VanitySlugDto
{
    public string? Slug { get; init; }
    public int VouchLevel { get; init; }
    public string VanityUrl { get; init; } = string.Empty;
}

/// <summary>
/// Body for setting the caller's per-guild nickname. Empty
/// string clears it (back to the user's global display name).
/// </summary>
public class SetNicknameDto
{
    /// <summary>Max 32 chars; empty string clears.</summary>
    public string Nickname { get; set; } = string.Empty;
}

/// <summary>
/// Per-guild member view with the full role list (not just
/// the primary). The displayed role is the one with the
/// highest <see cref="RoleDto.Position"/>; the client uses
/// that for the sidebar header / username colour. The full
/// list is sent so the role-picker UI can show all roles
/// the member currently has (and offers all roles in the
/// guild to pick from).
/// </summary>
public class GuildMemberDetailDto
{
    public int UserId { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public string? Nickname { get; init; }
    public bool IsOwner { get; init; }

    /// <summary>The displayed role — the one with the highest
    /// <see cref="RoleDto.Position"/> across the union of
    /// primary and additional roles.</summary>
    public int? DisplayRoleId { get; init; }
    public string? DisplayRoleName { get; init; }
    public string? DisplayRoleColor { get; init; }
    public string? DisplayRoleIconSvg { get; init; }

    /// <summary>Full role set, including primary and any
    /// additional roles. Sorted by position (highest first).</summary>
    public List<int> RoleIds { get; init; } = new();

    public bool IsAdministrator { get; init; }
    public DateTime JoinedAt { get; init; }
}

/// <summary>
/// Body for the multi-role assignment endpoint. Accepts a
/// full replacement of the member's role set (not a delta)
/// so the handler is idempotent — re-sending the same list
/// yields the same final state. Use an empty list to clear
/// all roles; the primary role is always one of the
/// entries (it can't be empty, since the column is NOT NULL).
/// </summary>
public class SetMemberRolesDto
{
    public List<int> RoleIds { get; set; } = new();
}
