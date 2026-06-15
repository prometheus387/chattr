namespace Chattr.Core.DTOs.User;

/// <summary>
/// Public-facing user representation. Never exposes the password hash
/// or the security answer.
/// </summary>
public sealed class PublicUserDto
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public DateTime CreatedAt { get; init; }
}
