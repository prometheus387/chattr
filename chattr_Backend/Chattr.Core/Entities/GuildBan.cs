namespace Chattr.Core.Entities;

/// <summary>
/// Per-guild ban record. A user on this list is forbidden from
/// joining the guild again — the invite-accept endpoint rejects
/// any join attempt while a row exists, and a fresh invite
/// doesn't bypass it. The user's existing <c>GuildMember</c>
/// row, if any, is removed by the ban endpoint in the same
/// transaction so we never end up in a state where the user is
/// both a member and banned.
///
/// A ban does not delete the user's messages or role
/// assignments — that would be a destructive action we'd
/// need consent for. A future "purge on ban" workflow can
/// flip a column on this table; for now, "ban" = "remove from
/// guild + remember so they can't rejoin".
/// </summary>
public class GuildBan
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public int BannedById { get; set; }
    public User? BannedBy { get; set; }
    public DateTime BannedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Optional human-readable reason. Free-form; shown in the
    /// bans list and (eventually) surfaced to the user on a
    /// failed rejoin. Capped at 500 chars on write.
    /// </summary>
    public string? Reason { get; set; }
}
