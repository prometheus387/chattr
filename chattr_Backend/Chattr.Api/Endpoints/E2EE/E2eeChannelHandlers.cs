using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.E2EE;
using Chattr.Core.Entities;
using Chattr.Core.Entities.E2EE;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services.E2EE;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.E2EE;

/// <summary>
/// Phase-2 E2EE channel endpoints. Thin: they parse
/// input, dispatch to <see cref="ChannelKeyService"/>
/// for the actual work, and format the response. All
/// interesting logic (recipient validation, version
/// bump, clear-on-rotation) lives in the service.
///
/// Routes are mounted at <c>/api/e2ee/channels</c>.
/// Authentication is required for every endpoint —
/// the per-channel creator check is the Phase-2
/// authorization gate; later phases may broaden it.
/// </summary>
public static class E2eeChannelHandlers
{
    // -----------------------------------------------------------------
    //  POST /api/e2ee/channels/{id}/members
    //  Add a single member to an existing E2EE channel.
    //  Validates that the supplied wrap is addressed to
    //  the target user's PGP public key.
    // -----------------------------------------------------------------
    public static async Task<IResult> AddMember(
        int channelId,
        AddE2eeMemberDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        ChannelKeyService keyService,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        try
        {
            var row = await keyService.AddMemberAsync(
                channelId,
                userId.Value,
                body.UserId,
                body.EncryptedAesKey,
                body.KeyVersion,
                ct);
            return Results.Created(
                $"/api/e2ee/channels/{channelId}/keys/{row.UserId}",
                new { row.Id, row.KeyVersion, row.CreatedAt });
        }
        catch (ChannelKeyService.PgpValidationException ex)
        {
            // 400 for missing / malformed / wrong-target wraps;
            // 404 for "channel not found" or "you're not the
            // creator" (consistent with the rest of the app's
            // "don't leak existence" policy).
            var msg = ex.Message;
            var isNotFound =
                msg == "Channel not found." ||
                msg == "Target user has not uploaded a PGP public key yet.";
            return isNotFound
                ? Results.NotFound(new { error = msg })
                : Results.BadRequest(new { error = msg });
        }
    }

    // -----------------------------------------------------------------
    //  POST /api/e2ee/channels/{id}/rotate
    //  Accept a new key-version's worth of wraps, persist
    //  them, optionally clear old messages.
    // -----------------------------------------------------------------
    public static async Task<IResult> Rotate(
        int channelId,
        RotateChannelKeysDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        ChannelKeyService keyService,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        try
        {
            var wraps = body.Wraps
                .Select(w => new ChannelKeyService.MemberWrap(w.UserId, w.EncryptedAesKey))
                .ToList();
            var result = await keyService.RotateAsync(
                channelId,
                userId.Value,
                body.NewKeyVersion,
                wraps,
                ct);
            return Results.Ok(new RotateResultDto
            {
                NewKeyVersion = result.NewKeyVersion,
                NewNextRotationUtc = result.NewNextRotationUtc,
                DeletedMessages = result.DeletedMessages,
                ClearedOnRotation = result.ClearedOnRotation,
            });
        }
        catch (ChannelKeyService.PgpValidationException ex)
        {
            var msg = ex.Message;
            var isNotFound = msg == "Channel not found.";
            return isNotFound
                ? Results.NotFound(new { error = msg })
                : Results.BadRequest(new { error = msg });
        }
    }

    // -----------------------------------------------------------------
    //  GET /api/e2ee/channels/{id}
    //  Channel metadata for the creator / members. The
    //  client uses this to drive the Channel-Settings
    //  card and the rotation watcher.
    // -----------------------------------------------------------------
    public static async Task<IResult> GetChannel(
        int channelId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var channel = await context.Set<Chattr.Core.Entities.E2EE.Channel>()
            .Where(c => c.Id == channelId)
            .Where(c =>
                c.CreatedByUserId == userId.Value ||
                context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
                    .Any(m => m.ChannelId == channelId && m.UserId == userId.Value))
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.IsEphemeral,
                c.RotationInterval,
                c.NextRotationUtc,
                c.ClearOnRotation,
                c.CreatedByUserId,
                c.CreatedAt,
                IsCreator = c.CreatedByUserId == userId.Value,
            })
            .FirstOrDefaultAsync(ct);

        if (channel is null) return Results.NotFound();
        return Results.Ok(channel);
    }

    // -----------------------------------------------------------------
    //  PATCH /api/e2ee/channels/{id}
    //  Channel-creator-only metadata updates. Currently
    //  exposes ClearOnRotation and RotationInterval;
    //  next-rotation timing is server-side and not
    //  editable through this endpoint.
    // -----------------------------------------------------------------
    public static async Task<IResult> UpdateChannel(
        int channelId,
        UpdateE2eeChannelDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var channel = await context.Set<Chattr.Core.Entities.E2EE.Channel>()
            .FirstOrDefaultAsync(c => c.Id == channelId, ct);
        if (channel is null) return Results.NotFound();
        if (channel.CreatedByUserId != userId.Value) return Results.Forbid();

        if (body.ClearOnRotation is not null)
            channel.ClearOnRotation = body.ClearOnRotation.Value;
        if (body.RotationInterval is not null)
            channel.RotationInterval = body.RotationInterval;

        await context.SaveChangesAsync(ct);
        return Results.Ok(new
        {
            channel.Id,
            channel.ClearOnRotation,
            channel.RotationInterval,
            channel.NextRotationUtc,
        });
    }

    // -----------------------------------------------------------------
    //  GET /api/e2ee/channels/{id}/members
    //  List the channel's current members. Used by the
    //  channel-settings UI to show who's in the channel
    //  and by the rotation watcher to know which public
    //  keys to fetch.
    // -----------------------------------------------------------------
    public static async Task<IResult> ListMembers(
        int channelId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var isMember = await context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value, ct);
        if (!isMember) return Results.NotFound();

        var rows = await context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            .Where(m => m.ChannelId == channelId)
            .OrderBy(m => m.JoinedAt)
            .Select(m => new
            {
                m.UserId,
                Username = m.User!.Username,
                DisplayName = string.IsNullOrEmpty(m.User!.DisplayName)
                    ? m.User!.Username
                    : m.User!.DisplayName,
                m.JoinedAt,
                HasPgpKey = m.User!.PgpKeys.Any(),
            })
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    // -----------------------------------------------------------------
    //  GET /api/e2ee/channels/{id}/my-key
    //  The caller's most-recently-stored wrapped key for
    //  this channel. The client unwraps it locally with
    //  their PGP private key to get the channel's AES key.
    // -----------------------------------------------------------------
    public static async Task<IResult> GetMyKey(
        int channelId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var row = await context.Set<GroupChannelKey>()
            .Where(k => k.ChannelId == channelId && k.UserId == userId.Value)
            .OrderByDescending(k => k.KeyVersion)
            .Select(k => new
            {
                k.KeyVersion,
                k.EncryptedAesKey,
                k.CreatedAt,
            })
            .FirstOrDefaultAsync(ct);
        if (row is null) return Results.NotFound();
        return Results.Ok(row);
    }

    // -----------------------------------------------------------------
    //  GET /api/e2ee/channels/{id}/public-keys
    //  All members' PGP public keys. The rotation flow
    //  pulls this in one round-trip and uses it to wrap
    //  the new AES key for every current member.
    // -----------------------------------------------------------------
    public static async Task<IResult> ListPublicKeys(
        int channelId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var isMember = await context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value, ct);
        if (!isMember) return Results.NotFound();

        var rows = await (
            from m in context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            where m.ChannelId == channelId
            join k in context.Set<UserPgpKey>() on m.UserId equals k.UserId
            select new
            {
                k.UserId,
                k.PublicKeyArmored,
                k.Fingerprint,
            }).ToListAsync(ct);
        return Results.Ok(rows);
    }
}
