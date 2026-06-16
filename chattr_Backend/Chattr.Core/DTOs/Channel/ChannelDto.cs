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

/// <summary>
/// Payload for <c>POST /api/guilds/{id}/channels</c>. The guild
/// id is taken from the URL, not the body. <c>Position</c> is
/// optional — the server appends the new channel to the end of its
/// category if you don't supply one.
/// </summary>
public class CreateChannelDto
{
    public string Name { get; set; } = string.Empty;
    public string? Category { get; set; }
    public ChannelKindDto Kind { get; set; } = ChannelKindDto.Text;
    public int? Position { get; set; }
}

/// <summary>
/// Patch payload for <c>PATCH /api/guilds/{id}/channels/{channelId}</c>.
/// Every field is optional; nulls are left as-is.
/// </summary>
public class UpdateChannelDto
{
    public string? Name { get; set; }
    public string? Category { get; set; }
    public int? Position { get; set; }
}
