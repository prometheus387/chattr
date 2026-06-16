namespace Chattr.Core.Entities;

public class GuildRolePermissions
{
    public int Id { get; set; }
    public int RoleId { get; set; }
    public GuildRole? Role { get; set; }

    public bool IsAdministrator { get; set; } = false;

    // Moderational Permissions
    public bool CanDeleteMessages { get; set; } = false;
    public bool CanManageChannels { get; set; } = false;
    public bool BypassSlowmode { get; set; } = false;
    public bool CanBanMembers { get; set; } = false;
    public bool CanKickMembers { get; set; } = false;
    public bool CanDeafenMembers { get; set; } = false;
    public bool CanMuteMembers { get; set; } = false;
    public bool CanTimeoutMembers { get; set; } = false;

    // Guild Based Permissions
    public bool CanChangeOwnNickname { get; set; } = false;
    public bool CanChangeNickName { get; set; } = false;

    /// <summary>
    /// Lets the holder assign roles to other members — but only
    /// roles strictly below their own in the hierarchy AND only roles
    /// whose permission flags don't exceed the assigner's own.
    /// </summary>
    public bool CanManageRoles { get; set; } = false;

    /// <summary>
    /// Lets the holder create invite links for the guild.
    /// </summary>
    public bool CanCreateInvite { get; set; } = false;
}
