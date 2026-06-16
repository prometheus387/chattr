using Chattr.Core.Constants;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Infrastructure.Services;

/// <summary>
/// Permission checks for platform-global operations (admin
/// dashboard, cross-guild moderation tools, user search, etc.).
/// Mirrors <see cref="GuildPermissionService"/> but for the
/// platform-tier role system.
/// </summary>
public static class PlatformPermissionService
{
    /// <summary>
    /// Returns the platform role of <paramref name="userId"/>, or
    /// <see cref="PlatformRoles.User"/> if the user is unknown.
    /// "Unknown" is treated as User (no powers) for safety — a
    /// deleted user with a still-valid JWT in flight shouldn't
    /// accidentally inherit moderator powers.
    /// </summary>
    public static async Task<string> GetRoleAsync(
        AppDbContext context, int userId, CancellationToken ct = default)
    {
        return await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.PlatformRole)
            .FirstOrDefaultAsync(ct) ?? PlatformRoles.User;
    }

    /// <summary>
    /// True if <paramref name="userId"/> is a Moderator or above
    /// (i.e. has access to the admin dashboard). Used as the
    /// gate for <c>/api/admin/*</c>.
    /// </summary>
    public static async Task<bool> IsAdminOrModeratorAsync(
        AppDbContext context, int userId, CancellationToken ct = default)
    {
        var role = await GetRoleAsync(context, userId, ct);
        return PlatformRoles.IsDashboardRole(role);
    }

    /// <summary>
    /// True if <paramref name="userId"/> is the platform Admin.
    /// Used for the few ops that only the Admin can do (granting
    /// Admin to others, deleting the platform's last Admin).
    /// </summary>
    public static async Task<bool> IsPlatformAdminAsync(
        AppDbContext context, int userId, CancellationToken ct = default)
    {
        var role = await GetRoleAsync(context, userId, ct);
        return role == PlatformRoles.Admin;
    }

    /// <summary>
    /// True if an actor with the given role can grant the new
    /// role to another user. The rule: actor's rank must be
    /// &gt;= the new role's rank. This means Admin can grant
    /// Admin (so the first admin can promote others to admin),
    /// Clique can grant Clique, etc. — but a Moderator can only
    /// grant strictly below themselves (User). The boundary is
    /// inclusive: you can hand out your own level, not just
    /// below.
    /// </summary>
    public static bool CanGrantRole(string actorRole, string newRole)
    {
        if (!PlatformRoles.IsValidRole(newRole)) return false;
        return PlatformRoles.RankOf(actorRole) >= PlatformRoles.RankOf(newRole);
    }
}
