namespace Chattr.Domain.Services;

public interface ICapService
{
    bool IsEnabled { get; }
    Task<(bool Success, string? Error)> VerifyAsync(string token, string? clientIp, CancellationToken ct = default);
}