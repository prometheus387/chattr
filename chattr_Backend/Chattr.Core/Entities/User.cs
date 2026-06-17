using Chattr.Core.Constants;

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

    /// <summary>
    /// Platform-global role. Distinct from per-guild roles
    /// (<see cref="GuildRole"/>): platform roles are scoped to the
    /// whole instance (admin-dashboard access, future cross-guild
    /// moderation, ban tools). Stored as a string for forward
    /// compatibility — adding a new role in
    /// <see cref="PlatformRoles"/> doesn't require a schema change.
    /// </summary>
    public string PlatformRole { get; set; } = PlatformRoles.User;

    /// <summary>
    /// Inverse navigation of <see cref="GuildMember.User"/>. Lets us
    /// write LINQ like <c>user.GuildMembers.Where(...)</c> in the
    /// message handlers when we need to surface the author's
    /// per-guild role colour / icon next to their message. The
    /// relationship is configured with cascading deletes in
    /// <c>AppDbContext.OnModelCreating</c>, so a removed user
    /// automatically cleans up their memberships.
    /// </summary>
    public ICollection<GuildMember> GuildMembers { get; set; } = new List<GuildMember>();

    /// <summary>
    /// PGP public keys uploaded by this user. Phase 2 of
    /// the E2EE rewrite keeps one key per user (a
    /// re-upload replaces the existing row, effectively
    /// rotating the user's identity). Phase 3+ might
    /// allow multiple keys per user for multi-device
    /// support — at that point this becomes
    /// <c>List&lt;UserPgpKey&gt;</c> with a "primary"
    /// flag.
    /// </summary>
    public ICollection<UserPgpKey> PgpKeys { get; set; } = new List<UserPgpKey>();
}
