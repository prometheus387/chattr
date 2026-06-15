namespace Chattr.Core.DTOs.Channel;

public enum ChannelKindDto
{
    Text = 0,
    Voice = 1,
}

public sealed class ChannelDto
{
    public int Id { get; init; }
    public int GuildId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Category { get; init; }
    public ChannelKindDto Kind { get; init; } = ChannelKindDto.Text;
    public int Position { get; init; }
}
