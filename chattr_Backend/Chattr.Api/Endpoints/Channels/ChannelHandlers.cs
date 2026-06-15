using System.Security.Claims;
using Chattr.Core.DTOs.Channel;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Channels;

public static class ChannelHandlers
{
    /// <summary>
    /// Returns all channels in a guild that the current user is a member of.
    /// The frontend groups them into categories client-side using
    /// <c>Channel.Category</c>.
    /// </summary>
    public static async Task<IResult> GetChannelsForGuild(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var isMember = await context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId && m.UserId == userId, ct);
        if (!isMember) return Results.Forbid();

        var channels = await context.Channels
            .AsNoTracking()
            .Where(c => c.GuildId == guildId)
            .OrderBy(c => c.Category ?? "")
            .ThenBy(c => c.Position)
            .ThenBy(c => c.Id)
            .Select(c => new ChannelDto
            {
                Id = c.Id,
                GuildId = c.GuildId,
                Name = c.Name,
                Category = c.Category,
                Kind = (ChannelKindDto)(int)c.Kind,
                Position = c.Position,
            })
            .ToListAsync(ct);

        return Results.Ok(channels);
    }
}
