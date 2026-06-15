namespace Chattr.Domain.Services;

public interface ICapService
{
    bool IsEnabled { get; }
    Task<(bool Success, string? Error)> VerifyAsync(string token, string? clientIp, CancellationToken ct = default);
}

/// <summary>
/// Issues signed JWTs for authenticated users. The interface only depends on
/// primitive identity values so the Domain layer stays free of Core entities.
/// </summary>
public interface IJwtTokenService
{
    (string Token, DateTime ExpiresAt) IssueToken(int userId, string username);
}
