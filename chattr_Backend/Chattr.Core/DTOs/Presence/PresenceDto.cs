namespace Chattr.Core.DTOs.Presence;

/// <summary>
/// One user entry in the user sidebar. We send a stable id, the
/// display/username, an optional avatar, and a last-seen timestamp so
/// the client can decide online/offline on its own.
/// </summary>
public sealed class UserPresenceDto
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public DateTime? LastSeenAt { get; init; }
}

public sealed class PresenceListDto
{
    public int TotalAccounts { get; init; }
    /// <summary>True when there are fewer than 1000 accounts, i.e. the
    /// sidebar should show offline users too.</summary>
    public bool ShowOffline { get; init; }
    public List<UserPresenceDto> Users { get; init; } = new();
}
