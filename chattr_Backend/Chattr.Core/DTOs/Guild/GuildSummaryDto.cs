namespace Chattr.Core.DTOs.Guild;

public sealed class GuildSummaryDto
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
}
