using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Infrastructure.Services;

/// <summary>
/// Permission checks for guild operations. Centralised so every guild
/// endpoint asks the same question the same way — a future tweak
/// (e.g. bumping admin powers, adding moderator checks) only has to
/// happen in one place.
/// </summary>
public static class GuildPermissionService
{
    /// <summary>
    /// True if <paramref name="userId"/> is the founding owner of
    /// <paramref name="guildId"/>. Owners get every permission by
    /// virtue of this flag alone — their role's permissions don't
    /// matter, they always pass. (The flag is what the DB stores
    /// "founder powers" under, so it survives even if a future
    /// migration ever changes how roles work.)
    /// </summary>
    public static Task<bool> IsGuildOwnerAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        return context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId && m.UserId == userId && m.IsOwner, ct);
    }

    /// <summary>
    /// True if <paramref name="userId"/> is a member of <paramref name="guildId"/>
    /// AND is either the owner or carries a role whose
    /// <c>IsAdministrator</c> permission is set. The @everyone role
    /// is seeded with IsAdministrator=false, so a regular member
    /// returns false here even though they're a member. Owners
    /// always return true via the IsOwner short-circuit.
    /// </summary>
    public static async Task<bool> IsGuildAdminAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        return await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
            })
            .AnyAsync(x => x.IsOwner || x.IsAdmin, ct);
    }

    /// <summary>
    /// True if <paramref name="userId"/> is a member of <paramref name="guildId"/> at all.
    /// </summary>
    public static async Task<bool> IsGuildMemberAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        return await context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId && m.UserId == userId, ct);
    }

    /// <summary>
    /// True if <paramref name="actorUserId"/> may manage
    /// (rename, recolor, reposition, delete, change permissions
    /// of) <paramref name="targetRoleId"/>. The rules:
    /// <list type="bullet">
    ///   <item>The guild owner can manage ANY role, including
    ///         <c>@everyone</c> (Position 0). This is the only
    ///         exception to the hierarchy rule.</item>
    ///   <item>Anyone with a role that has
    ///         <c>IsAdministrator</c> OR <c>CanManageRoles</c> can
    ///         manage roles strictly below their own in the
    ///         hierarchy (target.Position &lt; actor.Position).</item>
    ///   <item>No one below the target can touch it.</item>
    /// </list>
    /// Used by the role-management endpoints (PATCH, DELETE) and
    /// by the member-role-assign endpoint so a mid-tier admin
    /// can't accidentally bump someone up past their own level.
    /// </summary>
    public static async Task<bool> CanManageRoleAsync(
        AppDbContext context, int guildId, int actorUserId, int targetRoleId, CancellationToken ct = default)
    {
        // The owner is the universal bypass.
        if (await IsGuildOwnerAsync(context, guildId, actorUserId, ct)) return true;

        // Pull the actor's role and the target's role in one round-trip.
        // We need both because the comparison is "actor's permission
        // flags" vs "target's position". Joins on GuildId + RoleId
        // make sure we never read the wrong guild's data.
        var pair = await (
            from actor in context.GuildMembers.AsNoTracking()
            where actor.GuildId == guildId && actor.UserId == actorUserId
            join target in context.GuildRoles.AsNoTracking()
                on actor.GuildId equals target.GuildId
            where target.Id == targetRoleId
            select new
            {
                ActorPosition = actor.Role!.Position,
                ActorIsAdmin = actor.Role!.Permissions!.IsAdministrator,
                ActorCanManageRoles = actor.Role!.Permissions!.CanManageRoles,
                TargetPosition = target.Position,
            }
        ).FirstOrDefaultAsync(ct);

        if (pair is null) return false;

        // Owner was already handled above. Non-owners need at least
        // one of the two management-granting flags set, AND their
        // role must sit strictly above the target in the hierarchy.
        var canManage = pair.ActorIsAdmin || pair.ActorCanManageRoles;
        return canManage && pair.ActorPosition > pair.TargetPosition;
    }
}
