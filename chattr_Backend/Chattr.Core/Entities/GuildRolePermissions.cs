namespace Chattr.Core.Entities;

public class GuildRolePermissions
{
    public Guid Id { get; set; }
    public GuildRole ReferredRole { get; set; } = new();
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

}