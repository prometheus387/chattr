using System.Security.Claims;
using Chattr.Core.DTOs.Message;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Messages;

public static class MessageHandlers
{
    public static async Task<IResult> GetMessages(
        int channelId,
        ClaimsPrincipal principal,
        AppDbContext context,
        int? limit,
        int? before,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await UserCanSeeChannelAsync(context, channelId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var take = Math.Clamp(limit ?? 50, 1, 200);
        var q = context.Messages
            .AsNoTracking()
            .Where(m => m.ChannelId == channelId);
        if (before is not null)
        {
            q = q.Where(m => m.Id < before.Value);
        }

        var messages = await q
            .OrderByDescending(m => m.Id)
            .Take(take)
            .OrderBy(m => m.Id) // re-sort ascending for display
            .Select(m => new MessageDto
            {
                Id = m.Id,
                ChannelId = m.ChannelId,
                AuthorId = m.AuthorId,
                AuthorName = m.Author!.Username,
                Content = m.Content,
                CreatedAt = m.CreatedAt,
                EditedAt = m.EditedAt,
            })
            .ToListAsync(ct);

        return Results.Ok(messages);
    }

    public static async Task<IResult> PostMessage(
        int channelId,
        SendMessageDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var content = (body.Content ?? string.Empty).Trim();
        if (content.Length == 0)
        {
            return Results.BadRequest("Message cannot be empty.");
        }
        if (content.Length > 4000)
        {
            return Results.BadRequest("Message too long (max 4000 chars).");
        }

        if (!await UserCanSeeChannelAsync(context, channelId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var message = new Message
        {
            ChannelId = channelId,
            AuthorId = userId.Value,
            Content = content,
            CreatedAt = DateTime.UtcNow,
        };
        context.Messages.Add(message);
        await context.SaveChangesAsync(ct);

        var author = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId.Value)
            .Select(u => u.Username)
            .FirstAsync(ct);

        return Results.Ok(new MessageDto
        {
            Id = message.Id,
            ChannelId = message.ChannelId,
            AuthorId = message.AuthorId,
            AuthorName = author,
            Content = message.Content,
            CreatedAt = message.CreatedAt,
            EditedAt = null,
        });
    }

    private static async Task<bool> UserCanSeeChannelAsync(
        AppDbContext context, int channelId, int userId, CancellationToken ct)
    {
        var guildId = await context.Channels
            .Where(c => c.Id == channelId)
            .Select(c => (int?)c.GuildId)
            .FirstOrDefaultAsync(ct);
        if (guildId is null) return false;

        return await context.GuildMembers
            .AnyAsync(m => m.GuildId == guildId.Value && m.UserId == userId, ct);
    }
}
