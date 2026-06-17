using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Api.Realtime;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Guilds;

/// <summary>
/// Owner-only destructive operations on a guild. These live
/// in their own handler file (separate from
/// <see cref="GuildExtensionsHandlers"/>) so the spec's
/// "destructive owner actions" stay grouped and easy to
/// reason about. None of these are reversible:
/// <list type="bullet">
///   <item>Archive keeps data; Unarchive reverts.</item>
///   <item>Delete nukes the guild via the FK cascade.</item>
///   <item>Burn nukes the guild via explicit child-row
///         deletion, ordered so the "burn" feels more
///         intentional — same end state as Delete, but
///         the spec calls for explicit cleanup rather
///         than relying on the cascade.</item>
/// </list>
/// </summary>
public static class GuildAdminHandlers
{
    /// <summary>
    /// POST /api/guilds/{id}/archive — owner-only. Sets
    /// <c>IsArchived=true</c>, evicts every non-owner
    /// member, and revokes all pending invites. The owner
    /// stays as a member so they can later unarchive.
    /// Idempotent: re-archiving an already-archived guild
    /// returns 204 without re-doing the eviction.
    /// </summary>
    public static async Task<IResult> Archive(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        LiveBroadcaster live,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }
        var guild = await context.Guilds.FirstOrDefaultAsync(g => g.Id == guildId, ct);
        if (guild is null) return Results.NotFound();
        if (guild.IsArchived) return Results.NoContent();

        // Evict non-owner members. The m:n side-channel
        // (GuildMemberRole) cascades via the FK on
        // GuildMemberId so we don't need to manually clear
        // the additional-roles join rows.
        var evicted = await context.GuildMembers
            .Where(m => m.GuildId == guildId && !m.IsOwner)
            .ToListAsync(ct);
        var evictedUserIds = evicted.Select(m => m.UserId).ToList();
        context.GuildMembers.RemoveRange(evicted);

        // Revoke pending invites. We hard-delete (rather
        // than soft-deleting via UseCount) so the codes are
        // gone for good — an archived guild shouldn't
        // accumulate stale codes that unarchive could
        // accidentally re-issue.
        var invites = await context.GuildInvites
            .Where(i => i.GuildId == guildId)
            .ToListAsync(ct);
        context.GuildInvites.RemoveRange(invites);

        guild.IsArchived = true;
        await context.SaveChangesAsync(ct);

        // Live broadcast (fire-and-forget so the owner's
        // response doesn't block on SignalR dispatch):
        //   1. GuildArchived → every connected member's
        //      sidebar updates the "archived" flag.
        //   2. For each evicted user → YouWereRemovedFromGuild
        //      so their sidebar drops the guild without
        //      needing a reload.
        _ = Task.WhenAll(
            live.GuildArchived(guildId, isArchived: true),
            Task.WhenAll(evictedUserIds.Select(uid =>
                live.YouWereRemovedFromGuild(uid, guildId))));

        return Results.NoContent();
    }

    /// <summary>
    /// POST /api/guilds/{id}/unarchive — owner-only. Flips
    /// <c>IsArchived</c> back to false. The owner is the
    /// only member at this point; they re-invite people
    /// through fresh invites. Idempotent: re-unarchiving
    /// is a 204.
    /// </summary>
    public static async Task<IResult> Unarchive(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        LiveBroadcaster live,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }
        var guild = await context.Guilds.FirstOrDefaultAsync(g => g.Id == guildId, ct);
        if (guild is null) return Results.NotFound();
        if (!guild.IsArchived) return Results.NoContent();
        guild.IsArchived = false;
        await context.SaveChangesAsync(ct);

        // Live broadcast (fire-and-forget): every connected
        // member's sidebar flips the archived flag off.
        // No membership changed in this operation, so no
        // YouWereRemovedFromGuild is needed.
        _ = live.GuildArchived(guildId, isArchived: false);

        return Results.NoContent();
    }

    /// <summary>
    /// DELETE /api/guilds/{id} — owner-only. Hard delete
    /// the guild. The FK cascade wipes the children:
    /// members, channels, messages, roles, role
    /// permissions, invites, vouches. Useful when the
    /// owner wants the data gone but trusts the DB's
    /// cascade ordering.
    /// </summary>
    public static async Task<IResult> Delete(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        LiveBroadcaster live,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }
        var guild = await context.Guilds.FirstOrDefaultAsync(g => g.Id == guildId, ct);
        if (guild is null) return Results.NotFound();
        context.Guilds.Remove(guild);
        await context.SaveChangesAsync(ct);

        // Live broadcast (fire-and-forget): the owner's
        // sidebar drops the guild and every member (whoever
        // was still in it at delete time) does too.
        _ = live.GuildDeleted(guildId, ownerUserId: userId.Value);

        return Results.NoContent();
    }

    /// <summary>
    /// POST /api/guilds/{id}/burn — owner-only. The
    /// "nuclear" option. We <c>RemoveRange</c> each child
    /// table explicitly (messages of every channel,
    /// channels, role permissions, roles, members,
    /// additional-role join rows, invites, vouches) and
    /// then the guild. The end state is the same as
    /// Delete (every row is gone), but the explicit
    /// walk-through is what the spec calls for: it leaves
    /// no room for "did the cascade actually fire?" doubt
    /// during a post-mortem.
    /// </summary>
    public static async Task<IResult> Burn(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        LiveBroadcaster live,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }
        var guild = await context.Guilds.FirstOrDefaultAsync(g => g.Id == guildId, ct);
        if (guild is null) return Results.NotFound();

        // Messages — one round-trip per channel? No, do it
        // as a bulk SQL: delete from Messages where
        // ChannelId in (channels of this guild). EF can't
        // express that directly through the model without a
        // subquery, so we delete via the channels query
        // explicitly. We do it as RemoveRange over each
        // channel's messages — small extra round-trip for
        // data we're about to drop, acceptable.
        var channelIds = await context.Channels
            .Where(c => c.GuildId == guildId)
            .Select(c => c.Id)
            .ToListAsync(ct);
        if (channelIds.Count > 0)
        {
            var messages = await context.Messages
                .Where(m => channelIds.Contains(m.ChannelId))
                .ToListAsync(ct);
            context.Messages.RemoveRange(messages);
        }
        var channels = await context.Channels
            .Where(c => c.GuildId == guildId)
            .ToListAsync(ct);
        context.Channels.RemoveRange(channels);

        // Roles: their permission rows (GuildRolePermissions)
        // cascade on role deletion (HasOne with
        // .OnDelete(Cascade)), and the additional-role
        // join rows (GuildMemberRole) cascade too, so we
        // only need to delete the GuildRole rows directly.
        var roles = await context.GuildRoles
            .Where(r => r.GuildId == guildId)
            .ToListAsync(ct);
        context.GuildRoles.RemoveRange(roles);

        // Members: the owner included. We're nuking the
        // guild, the owner flag goes with the row.
        var members = await context.GuildMembers
            .Where(m => m.GuildId == guildId)
            .ToListAsync(ct);
        context.GuildMembers.RemoveRange(members);

        // Invites + vouches — both reference the guild by
        // id. Cascade would catch them but doing it
        // explicitly is what "burn" means.
        var invites = await context.GuildInvites
            .Where(i => i.GuildId == guildId)
            .ToListAsync(ct);
        context.GuildInvites.RemoveRange(invites);
        var vouches = await context.GuildVouches
            .Where(v => v.GuildId == guildId)
            .ToListAsync(ct);
        context.GuildVouches.RemoveRange(vouches);

        // Finally the guild itself.
        context.Guilds.Remove(guild);
        await context.SaveChangesAsync(ct);

        // Live broadcast (fire-and-forget): same wire-shape
        // as Delete — owner + every still-connected member
        // sees the guild vanish from their sidebar.
        _ = live.GuildDeleted(guildId, ownerUserId: userId.Value);

        return Results.NoContent();
    }
}
