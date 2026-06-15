using System.Security.Claims;
using Chattr.Core.DTOs.Presence;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Presence;

public static class PresenceHandlers
{
    private const int OfflineThresholdSeconds = 60;
    private const int ShowOfflineBelowAccounts = 1000;

    public static async Task<IResult> GetUsersWithPresence(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        _ = principal; // any authenticated user can see the user list
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var totalAccounts = await context.Users.CountAsync(ct);
        var showOffline = totalAccounts < ShowOfflineBelowAccounts;

        // Online = LastSeenAt within the last minute.
        var threshold = DateTime.UtcNow.AddSeconds(-OfflineThresholdSeconds);

        var query = context.Users.AsNoTracking().AsQueryable();
        if (!showOffline)
        {
            query = query.Where(u => u.LastSeenAt != null && u.LastSeenAt >= threshold);
        }

        var users = await query
            .OrderBy(u => u.Username)
            .Select(u => new UserPresenceDto
            {
                Id = u.Id,
                Username = u.Username,
                DisplayName = u.DisplayName.Length == 0 ? u.Username : u.DisplayName,
                AvatarUrl = u.AvatarUrl,
                LastSeenAt = u.LastSeenAt,
            })
            .ToListAsync(ct);

        return Results.Ok(new PresenceListDto
        {
            TotalAccounts = totalAccounts,
            ShowOffline = showOffline,
            Users = users,
        });
    }

    public static async Task<IResult> Heartbeat(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Results.Unauthorized();

        user.LastSeenAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
