namespace Chattr.Core.Entities;

public enum ChannelKind
{
    Text = 0,
    Voice = 1,
}

/// <summary>
/// A channel belongs to a guild. Channels are grouped into categories for
/// display in the sidebar; categories are simple strings (free-form) so
/// guild owners can name them however they like ("Text Channels", "Voice",
/// "Memes", ...).
/// </summary>
public class Channel
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Category { get; set; }
    public ChannelKind Kind { get; set; } = ChannelKind.Text;
    public int Position { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
