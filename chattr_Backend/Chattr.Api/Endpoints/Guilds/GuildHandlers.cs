using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.Guild;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Guilds;

public static class GuildHandlers
{
    /// <summary>
    /// Creates a new guild owned by the current user. The creator is
    /// added as a member with <c>IsOwner=true</c>, and a couple of
    /// starter channels (#general, #announcements) are seeded so the
    /// guild isn't empty when the client opens it.
    /// </summary>
    public static async Task<IResult> CreateGuild(
        CreateGuildDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var rawName = (dto?.Name ?? string.Empty).Trim();
        if (rawName.Length < 2)
        {
            return Results.BadRequest("Guild name must be at least 2 characters.");
        }
        if (rawName.Length > 50)
        {
            return Results.BadRequest("Guild name must be 50 characters or fewer.");
        }

        // Collapse runs of whitespace to a single space — keeps
        // double-spaces from surviving a sloppy copy/paste.
        var name = System.Text.RegularExpressions.Regex.Replace(
            rawName, @"\s+", " ");

        var guild = new Guild
        {
            Name = name,
            CreatedAt = DateTime.UtcNow,
        };
        context.Guilds.Add(guild);
        await context.SaveChangesAsync(ct);

        context.GuildMembers.Add(new GuildMember
        {
            UserId = userId.Value,
            GuildId = guild.Id,
            IsOwner = true,
            JoinedAt = DateTime.UtcNow,
        });

        // Seed two starter channels so the new guild is immediately
        // usable. Matches the layout the dev seed uses.
        context.Channels.AddRange(
            new Channel
            {
                GuildId = guild.Id,
                Name = "general",
                Category = "Text Channels",
                Kind = ChannelKind.Text,
                Position = 0,
            },
            new Channel
            {
                GuildId = guild.Id,
                Name = "announcements",
                Category = "Info",
                Kind = ChannelKind.Text,
                Position = 0,
            });

        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/guilds/{guild.Id}",
            new GuildSummaryDto
            {
                Id = guild.Id,
                Name = guild.Name,
                IconUrl = guild.IconUrl,
                MemberCount = 1,
                IsOwner = true,
            });
    }

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
