namespace Chattr.Core.Entities;

/// <summary>
/// Per-role permission flags. Each role has exactly one
/// permissions record (1:1). Defaults are intentionally strict:
/// new roles have nothing by default so the owner has to opt
/// in. The exception is the "everyone gets the right to do
/// basic things on their own content" rule baked into
/// <see cref="CanEditOwnMessage"/> / <see cref="CanDeleteOwnMessage"/>
/// — those default to true so that even a vanilla @everyone
/// role can manage their own messages.
/// </summary>
public class GuildRolePermissions
{
    public int Id { get; set; }
    public int RoleId { get; set; }
    public GuildRole? Role { get; set; }

    // ---- Top-level admin flag ---------------------------------------
    public bool IsAdministrator { get; set; } = false;

    // ---- Moderation -------------------------------------------------
    public bool CanDeleteMessages { get; set; } = false;
    public bool CanManageChannels { get; set; } = false;
    public bool BypassSlowmode { get; set; } = false;
    public bool CanBanMembers { get; set; } = false;
    public bool CanKickMembers { get; set; } = false;
    public bool CanDeafenMembers { get; set; } = false;
    public bool CanMuteMembers { get; set; } = false;
    public bool CanTimeoutMembers { get; set; } = false;

    // ---- Channel / message visibility + posting --------------------
    /// <summary>
    /// Lets the holder post in channels. Default true so
    /// vanilla @everyone isn't read-only by accident — a
    /// server owner can always flip this off for muted roles.
    /// </summary>
    public bool CanSendMessage { get; set; } = true;

    /// <summary>
    /// Lets the holder edit their own messages. Default true.
    /// </summary>
    public bool CanEditOwnMessage { get; set; } = true;

    /// <summary>
    /// Lets the holder delete their own messages. Default
    /// true — even @everyone should be able to clean up
    /// their own typos. Mod-level deletes go through
    /// <see cref="CanDeleteMessages"/>.
    /// </summary>
    public bool CanDeleteOwnMessage { get; set; } = true;

    /// <summary>
    /// Lets the holder read channel history. Default true.
    /// A muted role might have posting off but still wants
    /// to read; only an explicit "silenced" server would
    /// turn this off.
    /// </summary>
    public bool ViewChatHistory { get; set; } = true;

    // ---- Voice / live ----------------------------------------------
    public bool CanConnectToVoice { get; set; } = true;
    public bool CanActivateCamera { get; set; } = true;
    public bool CanActivateLivestream { get; set; } = false;

    // ---- Guild-based identity ---------------------------------------
    public bool CanChangeOwnNickname { get; set; } = true;
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
