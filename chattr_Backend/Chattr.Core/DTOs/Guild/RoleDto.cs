using Chattr.Core.DTOs.Guild;

namespace Chattr.Core.DTOs.Guild;

/// <summary>
/// Detailed role view: the role's identity, presentation, and
/// permission flags. Returned by GET/POST/PATCH on
/// <c>/api/guilds/{id}/roles</c>. Sent as a single round-trip so
/// the settings UI can render a role table without N+1 calls.
/// </summary>
public class RoleDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Color { get; init; } = string.Empty;
    public int Position { get; init; }
    public bool DisplaySeparately { get; init; }
    /// <summary>Server-stored inline SVG icon. Sanitized on write. Used in user sidebar + message author labels.</summary>
    public string? IconSvg { get; init; }
    public RolePermissionsDto Permissions { get; init; } = new();
}

public class RolePermissionsDto
{
    public bool IsAdministrator { get; set; }
    public bool CanManageRoles { get; set; }
    public bool CanCreateInvite { get; set; }
    public bool CanManageChannels { get; set; }
    public bool CanDeleteMessages { get; set; }
    public bool CanBanMembers { get; set; }
    public bool CanKickMembers { get; set; }
    public bool CanMuteMembers { get; set; }
    public bool CanDeafenMembers { get; set; }
    public bool CanTimeoutMembers { get; set; }
    public bool CanChangeOwnNickname { get; set; }
    public bool CanChangeNickName { get; set; }
    public bool BypassSlowmode { get; set; }
}

/// <summary>Payload for creating a new role. Permissions are optional and default to "no powers".</summary>
public class CreateRoleDto
{
    public string Name { get; set; } = string.Empty;
    public string? Color { get; set; }
    public bool DisplaySeparately { get; set; }
    public RolePermissionsDto? Permissions { get; set; }
}

/// <summary>
/// Patch payload for an existing role. Every field is optional;
/// nulls are left as-is. To clear a permission flag explicitly,
/// include the permissions object with that flag set to false.
/// </summary>
public class UpdateRoleDto
{
    public string? Name { get; set; }
    public string? Color { get; set; }
    public bool? DisplaySeparately { get; set; }
    /// <summary>Absolute new position. Other roles are renumbered with gaps of 10.</summary>
    public int? Position { get; set; }
    /// <summary>Raw inline-SVG string. Sanitized server-side; null/empty clears the icon.</summary>
    public string? IconSvg { get; set; }
    public RolePermissionsDto? Permissions { get; set; }
}

/// <summary>Body for "give member X role Y".</summary>
public class AssignMemberRoleDto
{
    public int RoleId { get; set; }
}
