using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.Invite;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Invites;

public static class InviteHandlers
{
    /// <summary>
    /// Issues a fresh invite for the guild. Requires the caller to be
    /// a member with IsAdministrator or CanCreateInvite. Returns the
    /// invite with the share code — the client turns that into a full
    /// URL like <c>https://chattr.cc/invite/&lt;code&gt;</c>.
    /// </summary>
    public static async Task<IResult> CreateInvite(
        int guildId,
        CreateInviteDto? dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        // Pull the caller's role + permissions in one shot so we can
        // decide admin-vs-CreateInvite in a single round-trip.
        var memberPerms = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId.Value)
            .Select(m => new
            {
                m.GuildId,
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
                CanCreate = m.Role!.Permissions!.CanCreateInvite,
            })
            .FirstOrDefaultAsync(ct);

        if (memberPerms is null) return Results.NotFound();
        // Three ways in: owner (always allowed), IsAdministrator on
        // the role, or CanCreateInvite on the role. With the
        // newer "owner has all powers via IsOwner" model, this
        // needs the explicit IsOwner check here too — the
        // per-handler shape predates GuildPermissionService and
        // doesn't go through it. (Couldn't refactor without
        // changing the per-handler code structure more than
        // needed; this is the minimum-surface fix.)
        if (!memberPerms.IsOwner && !memberPerms.IsAdmin && !memberPerms.CanCreate)
        {
            return Results.Forbid();
        }

        // MaxUse = 0 is meaningless and would let nobody in; reject
        // it explicitly so a fat-finger form value is caught early.
        if (dto?.MaxUse is { } max && max <= 0)
        {
            return Results.BadRequest("MaxUse must be at least 1 when set.");
        }

        var invite = new GuildInvite
        {
            GuildId = guildId,
            IssuedById = userId.Value,
            Code = await GenerateUniqueCodeAsync(context, ct),
            CreatedAt = DateTime.UtcNow,
            UnlimitedUse = dto?.UnlimitedUse ?? true,
            MaxUse = dto?.MaxUse,
            ValidUntil = dto?.ValidUntil,
            UseCount = 0,
        };
        context.GuildInvites.Add(invite);
        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/invites/{invite.Code}",
            await ToDtoAsync(context, invite, ct));
    }

    /// <summary>
    /// Public-ish preview of an invite. Anyone with the code can hit
    /// this to see which guild it points at. Does not require being
    /// authenticated, but if the caller IS authenticated we tell them
    /// whether they're already a member (so the client can swap the
    /// "Accept" button for "Open guild" instead of showing a dead CTA).
    /// </summary>
    public static async Task<IResult> PreviewInvite(
        string code,
        ClaimsPrincipal? principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var invite = await LoadInviteByCodeAsync(context, code, ct);
        if (invite is null) return Results.NotFound();

        var expired = !IsRedeemable(invite);
        var requesterId = principal?.UserIdOrNull();

        bool alreadyMember = false;
        if (requesterId is not null)
        {
            alreadyMember = await context.GuildMembers
                .AsNoTracking()
                .AnyAsync(m => m.GuildId == invite.GuildId && m.UserId == requesterId.Value, ct);
        }

        return Results.Ok(new InvitePreviewDto
        {
            Code = invite.Code,
            GuildId = invite.GuildId,
            GuildName = invite.Guild!.Name,
            GuildIconUrl = invite.Guild.IconUrl,
            MemberCount = invite.Guild.Members.Count,
            AlreadyMember = alreadyMember,
            Expired = expired,
        });
    }

    /// <summary>
    /// Accepts an invite: joins the authenticated user to the guild
    /// with the guild's @everyone role. Idempotent — if the user is
    /// already a member we return 200 with the existing channel
    /// id rather than failing. Use count goes up on a successful
    /// (re-)join so the link can be "burned" once MaxUse is hit.
    /// </summary>
    public static async Task<IResult> AcceptInvite(
        string code,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var invite = await LoadInviteByCodeAsync(context, code, ct);
        if (invite is null) return Results.NotFound();

        if (!IsRedeemable(invite))
        {
            return Results.BadRequest("This invite link is no longer valid.");
        }

        // Banned users can't rejoin via a fresh invite. Check
        // before doing the member-row insert so a banned
        // user sees a clear 403 instead of a silent success
        // followed by a mystery "you don't see any channels".
        var isBanned = await context.GuildBans
            .AsNoTracking()
            .AnyAsync(b => b.GuildId == invite.GuildId && b.UserId == userId.Value, ct);
        if (isBanned)
        {
            return Results.Forbid();
        }

        // Archived guilds don't accept new members. The
        // archive handler already revokes pending invites,
        // so the only way to hit this branch is a stale code
        // racing the archive flow. We return 410 Gone for
        // the same "this invite is no longer valid" semantics
        // the other no-longer-valid paths use.
        var guildArchived = await context.Guilds
            .AsNoTracking()
            .Where(g => g.Id == invite.GuildId)
            .Select(g => g.IsArchived)
            .FirstOrDefaultAsync(ct);
        if (guildArchived)
        {
            return Results.StatusCode(410);
        }

        // Already a member? Just return 200 — don't bump the use count
        // for a no-op, and don't fail the UX.
        var existing = await context.GuildMembers
            .FirstOrDefaultAsync(m => m.GuildId == invite.GuildId && m.UserId == userId.Value, ct);
        if (existing is not null)
        {
            return Results.Ok(new { guildId = invite.GuildId, alreadyMember = true });
        }

        // Find the guild's @everyone role to assign by default. Every
        // guild has one (created in CreateGuild), so this should
        // never be null. If it somehow is, fail loudly rather than
        // silently dropping the user into a half-broken state.
        var everyoneRole = await context.GuildRoles
            .FirstOrDefaultAsync(r => r.GuildId == invite.GuildId && r.Name == "@everyone", ct);
        if (everyoneRole is null)
        {
            return Results.Problem(
                "This guild is missing its @everyone role; ask an admin to repair it.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        context.GuildMembers.Add(new GuildMember
        {
            GuildId = invite.GuildId,
            UserId = userId.Value,
            RoleId = everyoneRole.Id,
            IsOwner = false,
            JoinedAt = DateTime.UtcNow,
        });

        invite.UseCount += 1;
        await context.SaveChangesAsync(ct);

        return Results.Ok(new { guildId = invite.GuildId, alreadyMember = false });
    }

    /// <summary>
    /// Lists active invites for a guild. Admin-only (the same gate as
    /// invite creation). The settings UI will call this to render a
    /// table of pending links with their expiry / remaining uses.
    /// </summary>
    public static async Task<IResult> ListInvites(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildAdminAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var invites = await context.GuildInvites
            .AsNoTracking()
            .Where(i => i.GuildId == guildId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync(ct);

        var result = new List<GuildInviteDto>(invites.Count);
        foreach (var inv in invites)
        {
            result.Add(await ToDtoAsync(context, inv, ct));
        }
        return Results.Ok(result);
    }

    /// <summary>
    /// Revokes an invite. Admin-only. Use count is left alone (we just
    /// delete the row); the preview/accept endpoints will simply 404
    /// from now on.
    /// </summary>
    public static async Task<IResult> RevokeInvite(
        int inviteId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var invite = await context.GuildInvites
            .FirstOrDefaultAsync(i => i.Id == inviteId, ct);
        if (invite is null) return Results.NotFound();

        if (!await GuildPermissionService.IsGuildAdminAsync(context, invite.GuildId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        context.GuildInvites.Remove(invite);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ---- helpers ------------------------------------------------------------

    private static async Task<GuildInvite?> LoadInviteByCodeAsync(
        AppDbContext context, string code, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        return await context.GuildInvites
            .Include(i => i.Guild)
            .FirstOrDefaultAsync(i => i.Code == code, ct);
    }

    /// <summary>
    /// True iff the invite is still redeemable. An invite is dead
    /// when its explicit ValidUntil is in the past, OR when
    /// UnlimitedUse is false and UseCount has reached MaxUse.
    /// </summary>
    private static bool IsRedeemable(GuildInvite invite)
    {
        if (invite.ValidUntil is { } until && until <= DateTime.UtcNow) return false;
        if (!invite.UnlimitedUse && invite.MaxUse is { } cap && invite.UseCount >= cap) return false;
        return true;
    }

    /// <summary>
    /// Generates a fresh code, retrying on the (vanishingly rare)
    /// collision until we get a unique one. Capped at 8 tries to
    /// avoid an infinite loop in the pathological case where the
    /// table is being spammed with inserts from the same process.
    /// </summary>
    private static async Task<string> GenerateUniqueCodeAsync(
        AppDbContext context, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 8; attempt++)
        {
            var code = InviteCodeGenerator.NewCode();
            var exists = await context.GuildInvites
                .AsNoTracking()
                .AnyAsync(i => i.Code == code, ct);
            if (!exists) return code;
        }
        // 62^10 = 8.4e17 — collision odds are astronomically low
        // for any sane dataset, so reaching this branch means
        // something is very wrong. Throw rather than risk a silent
        // duplicate (the unique index would reject the insert later
        // anyway, but the exception we'd get would be less helpful).
        throw new InvalidOperationException(
            "Could not generate a unique invite code after 8 attempts.");
    }

    private static async Task<GuildInviteDto> ToDtoAsync(
        AppDbContext context, GuildInvite invite, CancellationToken ct)
    {
        // Eager-load the issuer's username if we don't have it
        // cached. Cheap (one row) and avoids a separate round-trip
        // from the client.
        var issuerName = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == invite.IssuedById)
            .Select(u => u.Username)
            .FirstOrDefaultAsync(ct) ?? "(unknown)";

        var guildName = await context.Guilds
            .AsNoTracking()
            .Where(g => g.Id == invite.GuildId)
            .Select(g => g.Name)
            .FirstOrDefaultAsync(ct) ?? "(deleted)";

        return new GuildInviteDto
        {
            Id = invite.Id,
            Code = invite.Code,
            GuildId = invite.GuildId,
            GuildName = guildName,
            IssuedById = invite.IssuedById,
            IssuedByUsername = issuerName,
            CreatedAt = invite.CreatedAt,
            UnlimitedUse = invite.UnlimitedUse,
            MaxUse = invite.MaxUse,
            UseCount = invite.UseCount,
            ValidUntil = invite.ValidUntil,
            Expired = !IsRedeemable(invite),
        };
    }
}
