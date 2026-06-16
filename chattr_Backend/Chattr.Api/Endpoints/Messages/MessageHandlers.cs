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

        // Join with GuildMembers to surface the author's role
        // colour and icon in the same query — saves the client a
        // round-trip to /api/guilds/{id}/members per message.
        // The join is left-friendly: we LEFT-JOIN on (ChannelId's
        // GuildId, AuthorId) so messages from former members still
        // render (with null role data) instead of vanishing.
        var messages = await q
            .OrderByDescending(m => m.Id)
            .Take(take)
            .OrderBy(m => m.Id) // re-sort ascending for display
            .Select(m => new
            {
                m.Id,
                m.ChannelId,
                m.AuthorId,
                AuthorName = m.Author!.Username,
                m.Content,
                m.CreatedAt,
                m.EditedAt,
                AuthorRoleColor = m.Author!
                    .GuildMembers
                    .Where(gm => gm.GuildId == m.Channel!.GuildId)
                    .Select(gm => gm.Role!.Color)
                    .FirstOrDefault() ?? string.Empty,
                AuthorRoleIconSvg = m.Author!
                    .GuildMembers
                    .Where(gm => gm.GuildId == m.Channel!.GuildId)
                    .Select(gm => gm.Role!.IconSvg)
                    .FirstOrDefault(),
                AuthorRoleId = m.Author!
                    .GuildMembers
                    .Where(gm => gm.GuildId == m.Channel!.GuildId)
                    .Select(gm => (int?)gm.RoleId)
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        return Results.Ok(messages.Select(m => new MessageDto
        {
            Id = m.Id,
            ChannelId = m.ChannelId,
            AuthorId = m.AuthorId,
            AuthorName = m.AuthorName,
            AuthorRoleColor = m.AuthorRoleColor,
            AuthorRoleIconSvg = m.AuthorRoleIconSvg,
            AuthorRoleId = m.AuthorRoleId,
            Content = m.Content,
            CreatedAt = m.CreatedAt,
            EditedAt = m.EditedAt,
        }));
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

        // Pull the same role fields the GET endpoint includes so
        // the client's optimistic-insert path doesn't have to
        // re-fetch the whole list.
        var authorRow = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId.Value)
            .Select(u => new
            {
                u.Username,
                RoleColor = u.GuildMembers
                    .Where(gm => gm.GuildId == message.Channel!.GuildId)
                    .Select(gm => gm.Role!.Color)
                    .FirstOrDefault() ?? string.Empty,
                RoleIconSvg = u.GuildMembers
                    .Where(gm => gm.GuildId == message.Channel!.GuildId)
                    .Select(gm => gm.Role!.IconSvg)
                    .FirstOrDefault(),
                RoleId = u.GuildMembers
                    .Where(gm => gm.GuildId == message.Channel!.GuildId)
                    .Select(gm => (int?)gm.RoleId)
                    .FirstOrDefault(),
            })
            .FirstAsync(ct);

        return Results.Ok(new MessageDto
        {
            Id = message.Id,
            ChannelId = message.ChannelId,
            AuthorId = message.AuthorId,
            AuthorName = authorRow.Username,
            AuthorRoleColor = authorRow.RoleColor,
            AuthorRoleIconSvg = authorRow.RoleIconSvg,
            AuthorRoleId = authorRow.RoleId,
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
