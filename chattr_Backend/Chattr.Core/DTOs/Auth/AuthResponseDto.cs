using Chattr.Core.DTOs.User;

namespace Chattr.Core.DTOs.Auth;

public sealed class AuthResponseDto
{
    public string Token { get; init; } = string.Empty;
    public DateTime ExpiresAt { get; init; }
    public PublicUserDto User { get; init; } = null!;
}
