using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.Guild;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Guilds;

public static class GuildHandlers
{
    /// <summary>
    /// Creates a new guild owned by the current user. Only one role
    /// is seeded — <c>@everyone</c> (Position 0, no admin powers).
    /// The creator is added as a member with <c>IsOwner=true</c>
    /// and is placed on <c>@everyone</c>: per the new design the
    /// owner's full powers come from the <c>IsOwner</c> flag in the
    /// DB, NOT from any role. This keeps the role hierarchy clean:
    /// there's exactly one bottom rung (<c>@everyone</c>), and the
    /// owner sits on it but overrides every permission check via
    /// the <c>IsOwner</c> shortcut in <c>GuildPermissionService</c>.
    /// New members arrive via invite links (see
    /// <c>POST /api/guilds/{id}/invites</c>) and are also placed
    /// on <c>@everyone</c>. A couple of starter channels
    /// (#general, #announcements) are seeded so the guild isn't
    /// empty when the client opens it.
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

        // Only one role is seeded: @everyone with no admin powers.
        // Every future member (creator and invitees alike) is
        // placed on it. Higher-tier roles (e.g. "Moderator",
        // "Admin") can be created later via the role-management
        // endpoints — those land between @everyone (0) and the
        // creator's eventual choices, in the order the creator
        // arranges them.
        var everyone = new GuildRole
        {
            GuildId = guild.Id,
            Name = "@everyone",
            Color = "#99aab5",
            Position = 0,
            DisplaySeparately = false,
            Permissions = new GuildRolePermissions
            {
                IsAdministrator = false,
            },
        };
        context.GuildRoles.Add(everyone);
        await context.SaveChangesAsync(ct);

        // The creator sits on @everyone too — but their IsOwner=true
        // flag is the source of truth for "this user is the
        // founder". Permission checks consult IsOwner before
        // looking at role permissions, so the owner can manage
        // the guild out of the box without first creating an
        // "admin" role and assigning it to themselves.
        context.GuildMembers.Add(new GuildMember
        {
            UserId = userId.Value,
            GuildId = guild.Id,
            RoleId = everyone.Id,
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
                IsAdministrator = true,
            });
    }

    /// <summary>
    /// Returns the guilds the current user is a member of, with a
    /// member count and ownership / admin flags for the sidebar UI.
    /// </summary>
    public static async Task<IResult> GetMyGuilds(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        // Pull every member-row for the user, joined with the
        // permissions table so we can return IsAdministrator without a
        // second round-trip per guild.
        var rows = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.UserId == userId.Value)
            .Select(m => new
            {
                m.GuildId,
                Name = m.Guild!.Name,
                IconUrl = m.Guild!.IconUrl,
                MemberCount = m.Guild!.Members.Count,
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
            })
            .ToListAsync(ct);

        return Results.Ok(rows.Select(r => new GuildSummaryDto
        {
            Id = r.GuildId,
            Name = r.Name,
            IconUrl = r.IconUrl,
            MemberCount = r.MemberCount,
            IsOwner = r.IsOwner,
            IsAdministrator = r.IsAdmin,
        }).OrderBy(g => g.Name).ToList());
    }

    /// <summary>
    /// Detailed view of a single guild, scoped to the requesting user.
    /// Returns 404 if the user isn't a member.
    /// </summary>
    public static async Task<IResult> GetGuild(
        int guildId,
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

        var row = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId.Value)
            .Select(m => new
            {
                m.Guild!.Id,
                m.Guild.Name,
                m.Guild.IconUrl,
                m.Guild.CreatedAt,
                MemberCount = m.Guild!.Members.Count,
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
            })
            .FirstAsync(ct);

        return Results.Ok(new GuildDetailDto
        {
            Id = row.Id,
            Name = row.Name,
            IconUrl = row.IconUrl,
            MemberCount = row.MemberCount,
            IsOwner = row.IsOwner,
            IsAdministrator = row.IsAdmin,
            CreatedAt = row.CreatedAt,
        });
    }

    /// <summary>
    /// Members of a guild with their roles and admin flag. Useful for
    /// the settings page. Requires the requester to be a member.
    /// </summary>
    public static async Task<IResult> GetGuildMembers(
        int guildId,
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

        var members = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId)
            .Select(m => new
            {
                m.UserId,
                Username = m.User!.Username,
                DisplayName = string.IsNullOrEmpty(m.User!.DisplayName) ? m.User!.Username : m.User!.DisplayName,
                AvatarUrl = m.User!.AvatarUrl,
                m.RoleId,
                RoleName = m.Role!.Name,
                RoleColor = m.Role!.Color,
                RoleIconSvg = m.Role!.IconSvg,
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
                m.JoinedAt,
            })
            .OrderBy(m => m.JoinedAt)
            .ToListAsync(ct);

        return Results.Ok(members.Select(m => new GuildMemberDto
        {
            UserId = m.UserId,
            Username = m.Username,
            DisplayName = m.DisplayName,
            AvatarUrl = m.AvatarUrl,
            RoleId = m.RoleId,
            RoleName = m.RoleName,
            RoleColor = m.RoleColor,
            RoleIconSvg = m.RoleIconSvg,
            IsOwner = m.IsOwner,
            IsAdministrator = m.IsAdmin,
            JoinedAt = m.JoinedAt,
        }));
    }

    /// <summary>
    /// Patches a guild's name and/or icon. Requires the requester to
    /// be a guild admin (a role with IsAdministrator=true) — the owner
    /// gets this through IsOwner via the permission service. 404 if
    /// the user isn't even a member, 403 if they're a member
    /// without admin rights.
    /// </summary>
    public static async Task<IResult> UpdateGuild(
        int guildId,
        UpdateGuildDto dto,
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

        if (!await GuildPermissionService.IsGuildAdminAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var guild = await context.Guilds.FirstOrDefaultAsync(g => g.Id == guildId, ct);
        if (guild is null) return Results.NotFound();

        if (dto.Name is not null)
        {
            var raw = dto.Name.Trim();
            if (raw.Length < 2)
            {
                return Results.BadRequest("Guild name must be at least 2 characters.");
            }
            if (raw.Length > 50)
            {
                return Results.BadRequest("Guild name must be 50 characters or fewer.");
            }
            guild.Name = System.Text.RegularExpressions.Regex.Replace(raw, @"\s+", " ");
        }

        if (dto.IconUrl is not null)
        {
            // Empty string clears the icon; any other value is set as-is.
            // We don't validate the URL — the client can put any string and
            // we just trust it. A future endpoint can host uploads.
            guild.IconUrl = string.IsNullOrWhiteSpace(dto.IconUrl) ? null : dto.IconUrl;
        }

        await context.SaveChangesAsync(ct);

        return Results.Ok(new GuildSummaryDto
        {
            Id = guild.Id,
            Name = guild.Name,
            IconUrl = guild.IconUrl,
            MemberCount = await context.GuildMembers.CountAsync(m => m.GuildId == guildId, ct),
            IsOwner = await context.GuildMembers
                .AnyAsync(m => m.GuildId == guildId && m.UserId == userId.Value && m.IsOwner, ct),
            IsAdministrator = true,
        });
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
