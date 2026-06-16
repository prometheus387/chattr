namespace Chattr.Core.DTOs.User;

/// <summary>
/// Public-facing user representation. Never exposes the password hash
/// or the security answer.
/// </summary>
public sealed class PublicUserDto
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public DateTime CreatedAt { get; init; }
    /// <summary>
    /// Platform-global role. Distinct from per-guild roles
    /// (which travel with the user into each guild). Drives
    /// access to the admin dashboard and platform-wide
    /// moderation tools.
    /// </summary>
    public string PlatformRole { get; init; } = "User";
}
