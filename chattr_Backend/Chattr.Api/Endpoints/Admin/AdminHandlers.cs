using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.Constants;
using Chattr.Core.DTOs.Admin;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Admin;

public static class AdminHandlers
{
    /// <summary>
    /// Lists every user on the platform with their role and
    /// presence. The admin dashboard renders this as a
    /// searchable / sortable table. Access is gated to Moderator
    /// and above (see <see cref="PlatformPermissionService"/>).
    /// </summary>
    public static async Task<IResult> ListUsers(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await PlatformPermissionService.IsAdminOrModeratorAsync(context, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        var users = await context.Users
            .AsNoTracking()
            .OrderBy(u => u.Id)
            .Select(u => new AdminUserDto
            {
                Id = u.Id,
                Username = u.Username,
                DisplayName = string.IsNullOrEmpty(u.DisplayName) ? u.Username : u.DisplayName,
                AvatarUrl = u.AvatarUrl,
                PlatformRole = u.PlatformRole,
                CreatedAt = u.CreatedAt,
                LastSeenAt = u.LastSeenAt,
            })
            .ToListAsync(ct);

        return Results.Ok(users);
    }

    /// <summary>
    /// Updates a user's platform role. The actor can grant any
    /// role strictly below their own — so:
    /// <list type="bullet">
    ///   <item>Admin can grant anyone Admin, Clique, Council,
    ///         Moderator, or User.</item>
    ///   <item>Clique can grant Council, Moderator, or User.</item>
    ///   <item>Council can grant Moderator or User.</item>
    ///   <item>Moderator can grant User only.</item>
    /// </list>
    /// We also enforce "the platform must always have at least
    /// one Admin" — trying to demote the last Admin returns 409.
    /// </summary>
    public static async Task<IResult> UpdateUserRole(
        int userId,
        UpdatePlatformRoleDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await PlatformPermissionService.IsAdminOrModeratorAsync(context, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        if (string.IsNullOrWhiteSpace(dto.Role) || !PlatformRoles.IsValidRole(dto.Role))
        {
            return Results.BadRequest(
                $"Invalid role '{dto.Role}'. Valid: User, Moderator, Council, Clique, Admin.");
        }

        var actorRole = await PlatformPermissionService.GetRoleAsync(context, actorId.Value, ct);
        if (!PlatformPermissionService.CanGrantRole(actorRole, dto.Role))
        {
            // Don't differentiate between "role invalid" and "you
            // can't grant that role" in the response — the actor
            // doesn't need to know how high the rank hierarchy
            // goes, just that they don't have access to it.
            return Results.Forbid();
        }

        var target = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (target is null) return Results.NotFound();

        // Last-Admin guard. If the target is currently Admin and
        // we're moving them to anything else, the platform would
        // be left with zero admins — refuse. The Admin can
        // promote someone else to Admin first and then demote
        // themselves.
        if (target.PlatformRole == PlatformRoles.Admin
            && dto.Role != PlatformRoles.Admin
            && !await HasOtherAdminAsync(context, target.Id, ct))
        {
            return Results.Conflict(
                "Cannot remove the last platform Admin. Promote another user to Admin first.");
        }

        target.PlatformRole = dto.Role;
        await context.SaveChangesAsync(ct);

        return Results.Ok(new AdminUserDto
        {
            Id = target.Id,
            Username = target.Username,
            DisplayName = string.IsNullOrEmpty(target.DisplayName) ? target.Username : target.DisplayName,
            AvatarUrl = target.AvatarUrl,
            PlatformRole = target.PlatformRole,
            CreatedAt = target.CreatedAt,
            LastSeenAt = target.LastSeenAt,
        });
    }

    /// <summary>
    /// Returns the dashboard's "at a glance" stats: total
    /// users, role distribution, total guilds/channels/messages,
    /// active users in the last 24h, and a per-day guild-growth
    /// series for the last 14 days. All counts are computed in
    /// one round-trip (the role distribution is a single
    /// GROUP BY; the rest are COUNT(*) over indexed tables).
    /// </summary>
    public static async Task<IResult> GetDashboard(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await PlatformPermissionService.IsAdminOrModeratorAsync(context, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        // Role distribution. GROUP BY one column → 5 rows max.
        // We hand-fill the dto on the C# side so we don't need a
        // DTO that mirrors the GROUP BY shape 1:1.
        var roleCounts = await context.Users
            .AsNoTracking()
            .GroupBy(u => u.PlatformRole)
            .Select(g => new { Role = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var distribution = new RoleDistributionDto
        {
            Admin = roleCounts.FirstOrDefault(r => r.Role == PlatformRoles.Admin)?.Count ?? 0,
            Clique = roleCounts.FirstOrDefault(r => r.Role == PlatformRoles.Clique)?.Count ?? 0,
            Council = roleCounts.FirstOrDefault(r => r.Role == PlatformRoles.Council)?.Count ?? 0,
            Moderator = roleCounts.FirstOrDefault(r => r.Role == PlatformRoles.Moderator)?.Count ?? 0,
            User = roleCounts.FirstOrDefault(r => r.Role == PlatformRoles.User)?.Count ?? 0,
        };

        var cutoff = DateTime.UtcNow.AddDays(-14);
        var perDay = await context.Guilds
            .AsNoTracking()
            .Where(g => g.CreatedAt >= cutoff)
            .GroupBy(g => g.CreatedAt.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var totalUsers = await context.Users.CountAsync(ct);
        var totalGuilds = await context.Guilds.CountAsync(ct);
        var totalChannels = await context.Channels.CountAsync(ct);
        var totalMessages = await context.Messages.CountAsync(ct);
        var totalDirectMessages = await context.DmMessages.CountAsync(ct);
        var activeCutoff = DateTime.UtcNow.AddHours(-24);
        var activeUsersLast24h = await context.Users
            .CountAsync(u => u.LastSeenAt != null && u.LastSeenAt >= activeCutoff, ct);

        return Results.Ok(new AdminDashboardDto
        {
            TotalUsers = totalUsers,
            TotalGuilds = totalGuilds,
            TotalChannels = totalChannels,
            TotalMessages = totalMessages,
            TotalDirectMessages = totalDirectMessages,
            ActiveUsersLast24h = activeUsersLast24h,
            RoleDistribution = distribution,
            GuildGrowthLast14Days = new GuildGrowthDto
            {
                Daily = perDay
                    .OrderBy(d => d.Date)
                    .Select(d => new DailyCountDto
                    {
                        Date = d.Date,
                        Count = d.Count,
                    })
                    .ToList(),
            },
        });
    }

    // ---- helpers ------------------------------------------------------------

    private static async Task<bool> HasOtherAdminAsync(
        AppDbContext context, int excludeUserId, CancellationToken ct)
    {
        // True iff there's at least one Admin user OTHER than the
        // one we're about to demote. Used by the "last admin"
        // guard above.
        return await context.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id != excludeUserId && u.PlatformRole == PlatformRoles.Admin, ct);
    }
}
