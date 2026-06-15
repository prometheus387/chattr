using System.Security.Claims;
using Chattr.Core.DTOs.Dm;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Dms;

public static class DmHandlers
{
    /// <summary>
    /// Returns the user's DM channels, ordered by most recent activity.
    /// Empty list if the user has no DMs yet.
    /// </summary>
    public static async Task<IResult> GetMyDms(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var dms = await context.DmChannels
            .AsNoTracking()
            .Where(d => d.UserAId == userId.Value || d.UserBId == userId.Value)
            .OrderByDescending(d => d.LastMessageAt ?? d.CreatedAt)
            .Select(d => new
            {
                Dm = d,
                Other = d.UserAId == userId.Value ? d.UserB! : d.UserA!,
                Preview = context.DmMessages
                    .Where(m => m.DmChannelId == d.Id)
                    .OrderByDescending(m => m.Id)
                    .Select(m => m.Content)
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        var result = dms.Select(x => new DmSummaryDto
        {
            Id = x.Dm.Id,
            OtherUserId = x.Other.Id,
            OtherUsername = x.Other.Username,
            OtherDisplayName = x.Other.DisplayName.Length == 0 ? x.Other.Username : x.Other.DisplayName,
            OtherAvatarUrl = x.Other.AvatarUrl,
            OtherLastSeenAt = x.Other.LastSeenAt,
            LastMessageAt = x.Dm.LastMessageAt,
            LastMessagePreview = x.Preview,
        }).ToList();

        return Results.Ok(result);
    }

    /// <summary>
    /// Get-or-create a DM with another user. Idempotent — repeated calls
    /// return the same channel.
    /// </summary>
    public static async Task<IResult> OpenDmWith(
        int otherUserId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        if (otherUserId == userId.Value)
        {
            return Results.BadRequest("You can't DM yourself.");
        }

        var otherExists = await context.Users.AnyAsync(u => u.Id == otherUserId, ct);
        if (!otherExists) return Results.NotFound();

        var (a, b) = userId.Value < otherUserId
            ? (userId.Value, otherUserId)
            : (otherUserId, userId.Value);

        var existing = await context.DmChannels
            .FirstOrDefaultAsync(d => d.UserAId == a && d.UserBId == b, ct);
        if (existing is not null)
        {
            return Results.Ok(new { id = existing.Id });
        }

        var dm = new DmChannel
        {
            UserAId = a,
            UserBId = b,
            CreatedAt = DateTime.UtcNow,
        };
        context.DmChannels.Add(dm);
        await context.SaveChangesAsync(ct);
        return Results.Ok(new { id = dm.Id });
    }

    public static async Task<IResult> GetDmMessages(
        int dmId,
        ClaimsPrincipal principal,
        AppDbContext context,
        int? limit,
        int? before,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await UserIsDmParticipantAsync(context, dmId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var take = Math.Clamp(limit ?? 50, 1, 200);
        var q = context.DmMessages
            .AsNoTracking()
            .Where(m => m.DmChannelId == dmId);
        if (before is not null) q = q.Where(m => m.Id < before.Value);

        var msgs = await q
            .OrderByDescending(m => m.Id)
            .Take(take)
            .OrderBy(m => m.Id)
            .Select(m => new DmMessageDto
            {
                Id = m.Id,
                DmChannelId = m.DmChannelId,
                AuthorId = m.AuthorId,
                AuthorName = m.Author!.Username,
                Content = m.Content,
                CreatedAt = m.CreatedAt,
                EditedAt = m.EditedAt,
            })
            .ToListAsync(ct);

        return Results.Ok(msgs);
    }

    public static async Task<IResult> PostDmMessage(
        int dmId,
        SendDmMessageDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await UserIsDmParticipantAsync(context, dmId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var content = (body.Content ?? string.Empty).Trim();
        if (content.Length == 0) return Results.BadRequest("Message cannot be empty.");
        if (content.Length > 4000) return Results.BadRequest("Message too long (max 4000 chars).");

        var dm = await context.DmChannels.FirstOrDefaultAsync(d => d.Id == dmId, ct);
        if (dm is null) return Results.NotFound();

        var msg = new DmMessage
        {
            DmChannelId = dmId,
            AuthorId = userId.Value,
            Content = content,
            CreatedAt = DateTime.UtcNow,
        };
        context.DmMessages.Add(msg);
        dm.LastMessageAt = msg.CreatedAt;
        await context.SaveChangesAsync(ct);

        var author = await context.Users.AsNoTracking()
            .Where(u => u.Id == userId.Value)
            .Select(u => u.Username)
            .FirstAsync(ct);

        return Results.Ok(new DmMessageDto
        {
            Id = msg.Id,
            DmChannelId = msg.DmChannelId,
            AuthorId = msg.AuthorId,
            AuthorName = author,
            Content = msg.Content,
            CreatedAt = msg.CreatedAt,
            EditedAt = null,
        });
    }

    private static Task<bool> UserIsDmParticipantAsync(
        AppDbContext context, int dmId, int userId, CancellationToken ct) =>
        context.DmChannels
            .AnyAsync(d => d.Id == dmId && (d.UserAId == userId || d.UserBId == userId), ct);
}
