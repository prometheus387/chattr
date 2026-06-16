using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.Channel;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
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

    /// <summary>
    /// Creates a new channel in the guild. Permission gate: owner
    /// universal-bypass, or a role with <c>IsAdministrator</c> /
    /// <c>CanManageChannels</c>. Name is normalised the same way
    /// guild names are: trimmed, collapsed whitespace, and clamped
    /// to 2–50 chars.
    /// </summary>
    public static async Task<IResult> CreateChannel(
        int guildId,
        CreateChannelDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, userId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanManageChannelsAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var name = NormaliseChannelName(dto?.Name);
        if (name is null)
        {
            return Results.BadRequest("Channel name must be 2–50 characters.");
        }

        // Append-to-end behaviour: if the client doesn't supply a
        // position, drop the new channel just past the highest in
        // its category (or at 0 if the category is empty / null).
        // Expression-tree lambdas can't use ?., so we materialise
        // a local first.
        var requestedPosition = dto?.Position;
        var requestedCategory = dto?.Category;
        int position;
        if (requestedPosition is not null)
        {
            position = requestedPosition.Value;
        }
        else
        {
            var maxInCategory = await context.Channels
                .Where(c => c.GuildId == guildId && c.Category == requestedCategory)
                .Select(c => (int?)c.Position)
                .MaxAsync(ct);
            position = (maxInCategory ?? -1) + 1;
        }

        var kind = dto?.Kind ?? ChannelKindDto.Text;
        var channel = new Channel
        {
            GuildId = guildId,
            Name = name,
            Category = string.IsNullOrWhiteSpace(requestedCategory) ? null : requestedCategory,
            Kind = (ChannelKind)(int)kind,
            Position = position,
        };
        context.Channels.Add(channel);
        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/guilds/{guildId}/channels/{channel.Id}",
            new ChannelDto
            {
                Id = channel.Id,
                GuildId = channel.GuildId,
                Name = channel.Name,
                Category = channel.Category,
                Kind = (ChannelKindDto)(int)channel.Kind,
                Position = channel.Position,
            });
    }

    /// <summary>
    /// Patches a channel's name, category, and/or position. Same
    /// permission gate as CreateChannel.
    /// </summary>
    public static async Task<IResult> UpdateChannel(
        int guildId,
        int channelId,
        UpdateChannelDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, userId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanManageChannelsAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var channel = await context.Channels
            .FirstOrDefaultAsync(c => c.Id == channelId && c.GuildId == guildId, ct);
        if (channel is null) return Results.NotFound();

        if (dto?.Name is not null)
        {
            var name = NormaliseChannelName(dto.Name);
            if (name is null)
            {
                return Results.BadRequest("Channel name must be 2–50 characters.");
            }
            channel.Name = name;
        }
        if (dto?.Category is not null)
        {
            // Empty string clears the category (uncategorized);
            // whitespace-only also clears. Anything else is set as-is.
            channel.Category = string.IsNullOrWhiteSpace(dto.Category) ? null : dto.Category;
        }
        if (dto?.Position is not null)
        {
            channel.Position = dto.Position.Value;
        }

        await context.SaveChangesAsync(ct);

        return Results.Ok(new ChannelDto
        {
            Id = channel.Id,
            GuildId = channel.GuildId,
            Name = channel.Name,
            Category = channel.Category,
            Kind = (ChannelKindDto)(int)channel.Kind,
            Position = channel.Position,
        });
    }

    /// <summary>
    /// Deletes a channel. Same permission gate as CreateChannel.
    /// Note: this hard-deletes — messages in the channel go with
    /// it. A future "archive" workflow can flip this to a soft
    /// delete, but for now the UI is delete-with-confirm.
    /// </summary>
    public static async Task<IResult> DeleteChannel(
        int guildId,
        int channelId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, userId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanManageChannelsAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var channel = await context.Channels
            .FirstOrDefaultAsync(c => c.Id == channelId && c.GuildId == guildId, ct);
        if (channel is null) return Results.NotFound();

        context.Channels.Remove(channel);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    // ---- helpers ------------------------------------------------------------

    /// <summary>
    /// Trim, collapse internal whitespace, and clamp to 2–50 chars.
    /// Returns null when the result would be empty or fall outside
    /// the bounds — the handler turns that into a 400 with a
    /// human-readable message.
    /// </summary>
    private static string? NormaliseChannelName(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var trimmed = raw.Trim();
        var collapsed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"\s+", " ");
        if (collapsed.Length < 2 || collapsed.Length > 50) return null;
        return collapsed;
    }
}
