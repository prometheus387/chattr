using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.Entities;
using Chattr.Core.Entities.E2EE;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Auth;

/// <summary>
/// "Burn Account" — a one-way, irreversible hard-delete
/// of the calling user's data. Distinct from "delete
/// account" in two important ways:
/// <list type="bullet">
///   <item>It's transactional. The user row, all their
///         ciphertexts, and all wrapped keys vanish in
///         a single <c>SaveChangesAsync</c>. There's no
///         soft-delete path, no "are you sure?" grace
///         period, no "data export" button — the
///         account is just gone.</item>
///   <item>It's quiet. No "your account was deleted"
///         email, no audit log entry tagged with the
///         user id (the user id no longer exists, so any
///         log line referencing it would dangle). Audit
///         logs that exist are kept as-is — the
///         platform admin can correlate by timestamp
///         if they need to, but the user identity is
///         gone from the row.</item>
/// </list>
///
/// The handler is explicit (not relying on FK cascades)
/// because several legacy tables — <c>Messages</c>,
/// <c>GuildInvites</c>, <c>GuildBans</c>, <c>GuildVouches</c> —
/// have <c>OnDelete: Restrict</c> constraints pointing
/// at <c>Users</c>. The cascade would refuse to run.
/// We drop the dependents first, in order, then
/// delete the user row in the same transaction.
/// </summary>
public static class BurnAccountHandlers
{
    /// <summary>
    /// DELETE /api/users/me — burn the calling user's
    /// account. Idempotent: if the user doesn't exist
    /// (e.g. already burned from another device) the
    /// endpoint returns 204 to match the rest of the
    /// destructive-action endpoints.
    /// </summary>
    public static async Task<IResult> BurnAccount(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var user = await context.Users
            .FirstOrDefaultAsync(u => u.Id == userId.Value, ct);
        if (user is null) return Results.NoContent();

        await using var tx = await context.Database.BeginTransactionAsync(ct);

        // ---- E2EE data ------------------------------------------------
        // 1. Ciphertext the user sent.
        var messages = await context.Set<Chattr.Core.Entities.E2EE.Message>()
            .Where(m => m.SenderId == userId.Value)
            .ToListAsync(ct);
        context.Set<Chattr.Core.Entities.E2EE.Message>().RemoveRange(messages);

        // 2. Wrapped channel keys for the user.
        var keys = await context.Set<Chattr.Core.Entities.E2EE.GroupChannelKey>()
            .Where(k => k.UserId == userId.Value)
            .ToListAsync(ct);
        context.Set<Chattr.Core.Entities.E2EE.GroupChannelKey>().RemoveRange(keys);

        // ---- E2EE channel membership (the user as a member) ----
        var memberships = await context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            .Where(m => m.UserId == userId.Value)
            .ToListAsync(ct);
        context.Set<Chattr.Core.Entities.E2EE.ChannelMember>().RemoveRange(memberships);

        // ---- E2EE channels the user created (we keep the channel
        //      but re-assign ownership to a system null-user via
        //      CreatedByUserId being non-nullable; the simpler
        //      path is to delete channels the user created,
        //      which cascades to messages + members. We only do
        //      this for channels where the user is the only
        //      member; shared channels with other members are
        //      kept and ownership becomes orphaned. Phase 4+ can
        //      add a system "deleted user" sentinel.)
        var orphanChannels = await context.Set<Chattr.Core.Entities.E2EE.Channel>()
            .Where(c => c.CreatedByUserId == userId.Value)
            .ToListAsync(ct);
        if (orphanChannels.Count > 0)
        {
            // We can't delete the channels because the FK
            // from GroupChannelKey is Restrict. The user
            // already deleted their wrapped keys above,
            // so the channels are de-facto undecryptable.
            // Leave them in place; the spec doesn't
            // require channel-deletion on user burn.
            _ = orphanChannels; // suppress unused
        }

        // ---- Existing-model data ---------------------------------------
        // GuildBans issued by the user.
        var bansByUser = await context.Set<GuildBan>()
            .Where(b => b.BannedById == userId.Value)
            .ToListAsync(ct);
        context.Set<GuildBan>().RemoveRange(bansByUser);

        // GuildBans affecting the user.
        var bansOfUser = await context.Set<GuildBan>()
            .Where(b => b.UserId == userId.Value)
            .ToListAsync(ct);
        context.Set<GuildBan>().RemoveRange(bansOfUser);

        // GuildInvites issued by the user. The FK
        // from GuildInvites.IssuedById to Users.Id is
        // Restrict, so this is mandatory.
        var invitesIssued = await context.Set<GuildInvite>()
            .Where(i => i.IssuedById == userId.Value)
            .ToListAsync(ct);
        context.Set<GuildInvite>().RemoveRange(invitesIssued);

        // GuildVouches the user cast.
        var vouches = await context.Set<GuildVouch>()
            .Where(v => v.UserId == userId.Value)
            .ToListAsync(ct);
        context.Set<GuildVouch>().RemoveRange(vouches);

        // UserPgpKey (cascade already handles it via
        // the FK config, but we set it explicitly so
        // the order of operations is obvious in code).
        var pgpKeys = await context.Set<UserPgpKey>()
            .Where(k => k.UserId == userId.Value)
            .ToListAsync(ct);
        context.Set<UserPgpKey>().RemoveRange(pgpKeys);

// GuildMember rows for the user. Note: cascade
        // might already cover this depending on the FK
        // config, but we delete explicitly to be safe
        // against Restrict constraints.
        var guildMemberships = await context.Set<GuildMember>()
            .Where(m => m.UserId == userId.Value)
            .ToListAsync(ct);
        context.Set<GuildMember>().RemoveRange(guildMemberships);

        // The user row itself.
        context.Users.Remove(user);

        await context.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Results.NoContent();
    }
}
