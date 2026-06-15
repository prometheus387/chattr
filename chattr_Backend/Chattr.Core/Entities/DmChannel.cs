namespace Chattr.Core.Entities;

/// <summary>
/// A 1-on-1 direct-message "channel" between two users. The user ids
/// are stored in canonical order (UserAId &lt; UserBId) so a composite
/// unique index dedupes naturally — opening a DM with someone you've
/// already DMed always returns the same row.
/// </summary>
public class DmChannel
{
    public int Id { get; set; }
    public int UserAId { get; set; }
    public User? UserA { get; set; }
    public int UserBId { get; set; }
    public User? UserB { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastMessageAt { get; set; }
}

public class DmMessage
{
    public int Id { get; set; }
    public int DmChannelId { get; set; }
    public DmChannel? DmChannel { get; set; }
    public int AuthorId { get; set; }
    public User? Author { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
}
