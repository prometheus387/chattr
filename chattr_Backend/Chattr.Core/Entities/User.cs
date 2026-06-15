namespace Chattr.Core.Entities;

public class User
{
    /// <summary>
    /// Database-assigned auto-increment identifier. The value is exposed
    /// in URLs (e.g. <c>/i/42</c>) and JWTs, so it's a plain integer.
    /// </summary>
    public int Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string SecurityQuestion { get; set; } = string.Empty;
    public string SecurityAnswer { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Updated on every authenticated request via the presence heartbeat
    /// endpoint. Used by the user sidebar to render online/offline dots.
    /// </summary>
    public DateTime? LastSeenAt { get; set; }
}
