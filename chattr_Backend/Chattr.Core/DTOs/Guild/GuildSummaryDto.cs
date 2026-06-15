namespace Chattr.Core.DTOs.Guild;

public sealed class GuildSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? IconUrl { get; init; }
    public int MemberCount { get; init; }
    public bool IsOwner { get; init; }
}
