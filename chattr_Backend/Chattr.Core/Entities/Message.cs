namespace Chattr.Core.Entities;

public class Message
{
    public int Id { get; set; }
    public int ChannelId { get; set; }
    public Channel? Channel { get; set; }
    public int AuthorId { get; set; }
    public User? Author { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }

    /// <summary>
    /// Soft-delete timestamp. When non-null, the message has been
    /// removed by its author or a moderator — we keep the row so
    /// thread structure stays intact (no orphan replies), and
    /// expose it to the client with the content cleared so it can
    /// render a "Message deleted" placeholder. Hard-deletes (e.g.
    /// a guild owner wiping the channel) live at the channel
    /// level instead.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// True when the message was edited. We stamp the post-edit
    /// content into <see cref="Content"/> and bump
    /// <see cref="EditedAt"/>; this flag is just a cheap signal
    /// for the client (so it doesn't have to compare timestamps
    /// or send nullability info) to render the "(edited)" badge.
    /// </summary>
    public bool IsEdited { get; set; }
}
