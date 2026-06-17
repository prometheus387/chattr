using Chattr.Core.Constants;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Infrastructure.Services;

/// <summary>
/// Permission checks for guild operations. Centralised so every
/// guild endpoint asks the same question the same way.
///
/// The role system is a primary role (GuildMember.RoleId) plus
/// an m:n side-channel (GuildMember.AdditionalRoles via
/// GuildMemberRole). The displayed role in the UI is whichever
/// across the union of both has the highest
/// <see cref="GuildRole.Position"/>. Permission resolution:
/// <list type="bullet">
///   <item>The guild owner (IsOwner=true) has every permission
///         unconditionally — universal bypass, no role lookup.</item>
///   <item>For everyone else, "does this member have permission
///         X?" is "does ANY of their roles (primary or
///         additional) have flag X set?".</item>
///   <item>Hierarchy checks ("can role X manage role Y?") still
///         compare positions: actor's max-position &gt; target's
///         position, AND actor's set has the management flag.</item>
/// </list>
/// </summary>
public static class GuildPermissionService
{
    /// <summary>True if the caller is the founding owner.</summary>
    public static Task<bool> IsGuildOwnerAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        return context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId && m.UserId == userId && m.IsOwner, ct);
    }

    /// <summary>True if the caller is a member at all.</summary>
    public static async Task<bool> IsGuildMemberAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        return await context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId && m.UserId == userId, ct);
    }

    /// <summary>Owner OR any-role-IsAdministrator.</summary>
    public static async Task<bool> IsGuildAdminAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        return await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator
                    || m.AdditionalRoles.Any(ar => ar.Role!.Permissions!.IsAdministrator),
            })
            .AnyAsync(x => x.IsOwner || x.IsAdmin, ct);
    }

    /// <summary>Per-flag checks. Each is owner-bypass + any-role-set. </summary>
    public static Task<bool> CanManageChannelsAsync(AppDbContext c, int g, int u, CancellationToken ct = default) =>
        HasFlagAsync(c, g, u, p => p.CanManageChannels, ct);

    public static Task<bool> CanManageRolesAsync(AppDbContext c, int g, int u, CancellationToken ct = default) =>
        HasFlagAsync(c, g, u, p => p.CanManageRoles, ct);

    public static Task<bool> CanKickMembersAsync(AppDbContext c, int g, int u, CancellationToken ct = default) =>
        HasFlagAsync(c, g, u, p => p.CanKickMembers, ct);

    public static Task<bool> CanBanMembersAsync(AppDbContext c, int g, int u, CancellationToken ct = default) =>
        HasFlagAsync(c, g, u, p => p.CanBanMembers, ct);

    /// <summary>
    /// True if the actor carries a specific role in any of
    /// their role sets (primary or additional). "Do I have
    /// role X at all?" — distinct from
    /// <see cref="CanManageRoleAsync"/>.
    /// </summary>
    public static async Task<bool> IsActorOnRoleAsync(
        AppDbContext context, int guildId, int userId, int roleId, CancellationToken ct = default)
    {
        return await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                OnPrimary = m.RoleId == roleId,
                OnAdditional = m.AdditionalRoles.Any(ar => ar.RoleId == roleId),
            })
            .AnyAsync(x => x.OnPrimary || x.OnAdditional, ct);
    }

    /// <summary>
    /// True if the actor can manage
    /// <paramref name="targetRoleId"/>. Owner bypass;
    /// otherwise requires (IsAdmin || CanManageRoles) AND a
    /// role strictly higher in position than the target.
    /// </summary>
    public static async Task<bool> CanManageRoleAsync(
        AppDbContext context, int guildId, int actorUserId, int targetRoleId, CancellationToken ct = default)
    {
        if (await IsGuildOwnerAsync(context, guildId, actorUserId, ct)) return true;

        var pair = await (
            from actor in context.GuildMembers.AsNoTracking()
            where actor.GuildId == guildId && actor.UserId == actorUserId
            join target in context.GuildRoles.AsNoTracking()
                on actor.GuildId equals target.GuildId
            where target.Id == targetRoleId
            select new
            {
                // Max position across primary + additional. EF
                // doesn't allow MAX over a conditional across
                // two paths in a single select, so we project
                // the candidate values and max in C#.
                PrimaryPosition = actor.Role!.Position,
                MaxAdditionalPosition = actor.AdditionalRoles.Max(ar => (int?)ar.Role!.Position) ?? 0,
                ActorCanManage = actor.Role!.Permissions!.IsAdministrator
                    || actor.Role!.Permissions!.CanManageRoles
                    || actor.AdditionalRoles.Any(ar =>
                        ar.Role!.Permissions!.IsAdministrator ||
                        ar.Role!.Permissions!.CanManageRoles),
                TargetPosition = target.Position,
            }
        ).FirstOrDefaultAsync(ct);

        if (pair is null) return false;
        var actorMax = Math.Max(pair.PrimaryPosition, pair.MaxAdditionalPosition);
        return pair.ActorCanManage && actorMax > pair.TargetPosition;
    }

    /// <summary>
    /// Pulls the actor's role set (primary + additional) in one
    /// round-trip. Returns the empty list when the actor isn't
    /// a member. Used by endpoints that need to check multiple
    /// flags against the same caller.
    /// </summary>
    public static async Task<List<RolePermissionProjection>> GetActorRolePermissionsAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        var rows = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                Primary = new
                {
                    m.RoleId,
                    m.Role!.Position,
                    P = m.Role!.Permissions!,
                },
                Additional = m.AdditionalRoles
                    .Select(ar => new
                    {
                        ar.RoleId,
                        ar.Role!.Position,
                        P = ar.Role!.Permissions!,
                    })
                    .ToList(),
            })
            .FirstOrDefaultAsync(ct);
        if (rows is null) return new List<RolePermissionProjection>();
        var list = new List<RolePermissionProjection>
        {
            new() { RoleId = rows.Primary.RoleId, Position = rows.Primary.Position, Permissions = rows.Primary.P },
        };
        list.AddRange(rows.Additional.Select(a => new RolePermissionProjection
        {
            RoleId = a.RoleId, Position = a.Position, Permissions = a.P,
        }));
        return list;
    }

    /// <summary>
    /// Top-level actor permission view: the IsOwner flag and
    /// the list of role-permission projections. Built in one
    /// round-trip so the message / channel endpoints can decide
    /// edit/delete/etc. without N queries.
    /// </summary>
    public static async Task<ActorPermissionView?> GetActorViewAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct = default)
    {
        var row = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                m.IsOwner,
                Primary = new
                {
                    m.RoleId,
                    m.Role!.Position,
                    P = m.Role!.Permissions!,
                },
                Additional = m.AdditionalRoles
                    .Select(ar => new
                    {
                        ar.RoleId,
                        ar.Role!.Position,
                        P = ar.Role!.Permissions!,
                    })
                    .ToList(),
            })
            .FirstOrDefaultAsync(ct);
        if (row is null) return null;
        var list = new List<RolePermissionProjection>
        {
            new() { RoleId = row.Primary.RoleId, Position = row.Primary.Position, Permissions = row.Primary.P },
        };
        list.AddRange(row.Additional.Select(a => new RolePermissionProjection
        {
            RoleId = a.RoleId, Position = a.Position, Permissions = a.P,
        }));
        return new ActorPermissionView
        {
            IsOwner = row.IsOwner,
            Roles = list,
        };
    }

    // ---- Internals ---------------------------------------------------

    private static async Task<bool> HasFlagAsync(
        AppDbContext context, int guildId, int userId,
        Func<GuildRolePermissions, bool> flag, CancellationToken ct)
    {
        if (await IsGuildOwnerAsync(context, guildId, userId, ct)) return true;
        return await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                OnPrimary = flag(m.Role!.Permissions!),
                OnAdditional = m.AdditionalRoles.Any(ar => flag(ar.Role!.Permissions!)),
            })
            .AnyAsync(x => x.OnPrimary || x.OnAdditional, ct);
    }
}

/// <summary>
/// Per-role permission projection used by the message / channel
/// endpoints. Decoupled from <see cref="GuildRolePermissions"/>
/// so the endpoints can hold a list of these without dragging
/// the full entity graph into memory.
/// </summary>
public class RolePermissionProjection
{
    public int RoleId { get; set; }
    public int Position { get; set; }
    public GuildRolePermissions Permissions { get; set; } = new();
}

/// <summary>
/// Lightweight actor-side permission summary: the IsOwner flag
/// and the list of role-permission projections. Built by
/// <see cref="GuildPermissionService.GetActorViewAsync"/>.
/// </summary>
public class ActorPermissionView
{
    public bool IsOwner { get; set; }
    public List<RolePermissionProjection> Roles { get; set; } = new();

    /// <summary>The id of the member's highest-position role, or
    /// null if they have none. Used by the UI to render the
    /// "displayed" role (the role whose name shows in the
    /// sidebar section header, whose colour tints the
    /// username, etc).</summary>
    public int? HighestPositionRoleId
    {
        get
        {
            if (Roles.Count == 0) return null;
            return Roles.OrderByDescending(r => r.Position).First().RoleId;
        }
    }

    /// <summary>"Any role has this flag?" — Owner-bypass included.</summary>
    public bool Has(Func<GuildRolePermissions, bool> flag) =>
        IsOwner || Roles.Any(r => flag(r.Permissions));
}
