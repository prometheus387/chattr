namespace Chattr.Core.Entities;

public class Guild
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? IconUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<GuildMember> Members { get; set; } = new();

    // Admin Fields / Platform Admin, not Guild Admin
    public bool IsLimited { get; set; } = false;
    public DateTime? LimitedUntil { get; set; }
    public bool IsPunished { get; set; } = false;

    // ---- Archive state -----------------------------------------------
    /// <summary>
    /// True when the owner has archived the guild. The
    /// archive flow keeps the data (channels, messages,
    /// roles, history) but evicts every non-owner member
    /// and revokes pending invites. New messages are
    /// rejected with 403 — only the owner retains
    /// write access. The owner can unarchive to bring
    /// everything back, or delete/burn for the nuclear
    /// option. The spec's intent is "soft-freeze for later
    /// revival", so the data is intentionally kept on disk
    /// during the archived state.
    /// </summary>
    public bool IsArchived { get; set; } = false;

    // ---- Vouch system -----------------------------------------------
    /// <summary>
    /// Cached count of vouches this guild has received. The
    /// vouches themselves are tracked in the
    /// <see cref="GuildVouch"/> table (so a user can't vouch
    /// twice); the count is the denormalised aggregate the
    /// dashboard / vouch-level calculation reads. We update
    /// this with a trigger-style increment in the
    /// POST/DELETE handlers rather than computing on read so
    /// the dashboard stays cheap.
    /// </summary>
    public int VouchCount { get; set; } = 0;

    /// <summary>
    /// Cached vouch tier, derived from <see cref="VouchCount"/>
    /// at write time:
    /// <list type="bullet">
    ///   <item>0 = none (0–2 vouches)</item>
    ///   <item>1 = established (3+)</item>
    ///   <item>2 = trusted (10+)</item>
    ///   <item>3 = distinguished (20+)</item>
    /// </list>
    /// Recomputed whenever a vouch is added or removed. The
    /// level controls which perks are available (vanity URL
    /// for level 3, etc).
    /// </summary>
    public int VouchLevel { get; set; } = 0;

    // ---- Vanity URL (vouch-level 3 only) -----------------------------
    /// <summary>
    /// Slug for a vanity invite URL: e.g. <c>chattr.cc/go/&lt;slug&gt;</c>.
    /// Only writable when <see cref="VouchLevel"/> >= 3.
    /// Uniqueness is enforced by a unique index. The slug
    /// is reserved for the guild's own use; normal user
    /// identities (usernames, display names) cannot collide
    /// because the path is on <c>/go/</c>, which is its own
    /// route segment.
    /// </summary>
    public string? VanitySlug { get; set; }
}

/// <summary>
/// A vouch cast by a <see cref="User"/> for a <see cref="Guild"/>.
/// A user can vouch for a given guild at most once (unique
/// index on GuildId+UserId). A vouch bumps the guild's
/// <see cref="Guild.VouchCount"/> and may bump the
/// <see cref="Guild.VouchLevel"/> if it crosses a tier.
/// </summary>
public class GuildVouch
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
