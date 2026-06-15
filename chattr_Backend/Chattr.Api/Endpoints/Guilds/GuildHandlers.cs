using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.Guild;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Guilds;

public static class GuildHandlers
{
    /// <summary>
    /// Returns the guilds the current user is a member of, with a member
    /// count and an `IsOwner` flag for the sidebar UI.
    /// </summary>
    public static async Task<IResult> GetMyGuilds(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var guilds = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.UserId == userId.Value)
            .Select(m => new GuildSummaryDto
            {
                Id = m.Guild!.Id,
                Name = m.Guild!.Name,
                IconUrl = m.Guild!.IconUrl,
                MemberCount = m.Guild!.Members.Count,
                IsOwner = m.IsOwner,
            })
            .OrderBy(g => g.Name)
            .ToListAsync(ct);

        return Results.Ok(guilds);
    }

    /// <summary>
    /// Removes the current user from a guild. The last owner can't leave
    /// (they'd have to transfer ownership or delete the guild — not
    /// implemented yet) and the user gets a 409 in that case.
    /// </summary>
    public static async Task<IResult> LeaveGuild(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var member = await context.GuildMembers
            .FirstOrDefaultAsync(m => m.GuildId == guildId && m.UserId == userId.Value, ct);
        if (member is null) return Results.NotFound();

        if (member.IsOwner)
        {
            var ownerCount = await context.GuildMembers
                .CountAsync(m => m.GuildId == guildId && m.IsOwner, ct);
            var memberCount = await context.GuildMembers
                .CountAsync(m => m.GuildId == guildId, ct);
            if (ownerCount <= 1 && memberCount > 1)
            {
                return Results.Conflict(
                    "You're the only owner. Transfer ownership or delete the guild first.");
            }
        }

        context.GuildMembers.Remove(member);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
