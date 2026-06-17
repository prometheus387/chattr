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
        Chattr.Api.Realtime.LiveBroadcaster live,
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

        // Live broadcast: the new guild shows up in
        // the creator's sidebar immediately. Other
        // connected users see it on their next refresh
        // (we don't fan out the create event to every
        // user — too noisy for a large platform).
        await live.GuildCreated(
            new Chattr.Core.DTOs.Live.GuildEventPayload
            {
                Id = guild.Id,
                Name = guild.Name,
                IconUrl = guild.IconUrl,
                MemberCount = 1,
                IsOwner = true,
                IsAdministrator = true,
                IsArchived = guild.IsArchived,
                VouchCount = 0,
                VouchLevel = 0,
                VanitySlug = null,
            },
            ownerUserId: userId.Value);

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
                // The owner is the universal bypass in
                // GuildPermissionService, so every tab-visibility /
                // moderation flag is true for them — they can manage
                // channels, roles, kick, ban and issue invites
                // from the moment the guild exists.
                CanManageChannels = true,
                CanManageRoles = true,
                CanKickMembers = true,
                CanBanMembers = true,
                CanCreateInvite = true,
                IsArchived = guild.IsArchived,
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
        // permissions table so we can return IsAdministrator / CanManage*
        // without a second round-trip per guild.
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
                m.Guild!.IsArchived,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
                CanManageChannels = m.Role!.Permissions!.CanManageChannels,
                CanManageRoles = m.Role!.Permissions!.CanManageRoles,
                CanKickMembers = m.Role!.Permissions!.CanKickMembers,
                CanBanMembers = m.Role!.Permissions!.CanBanMembers,
                CanCreateInvite = m.Role!.Permissions!.CanCreateInvite,
            })
            .ToListAsync(ct);

        return Results.Ok(rows.Select(r => new GuildSummaryDto
        {
            Id = r.GuildId,
            Name = r.Name,
            IconUrl = r.IconUrl,
            MemberCount = r.MemberCount,
            IsOwner = r.IsOwner,
            // Owners always pass `IsGuildAdminAsync` server-side via
            // the `IsOwner` short-circuit, so the client has to
            // treat them the same way: an owner with no admin-role
            // is still an admin of their guild. Without the `||
            // r.IsOwner` here the sidebar would show "Member" and
            // hide the settings entry after every reload.
            IsAdministrator = r.IsOwner || r.IsAdmin,
            CanManageChannels = r.IsOwner || r.IsAdmin || r.CanManageChannels,
            CanManageRoles = r.IsOwner || r.IsAdmin || r.CanManageRoles,
            CanKickMembers = r.IsOwner || r.IsAdmin || r.CanKickMembers,
            CanBanMembers = r.IsOwner || r.IsAdmin || r.CanBanMembers,
            CanCreateInvite = r.IsOwner || r.IsAdmin || r.CanCreateInvite,
            IsArchived = r.IsArchived,
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
                m.Guild.IsArchived,
                MemberCount = m.Guild!.Members.Count,
                m.IsOwner,
                IsAdmin = m.Role!.Permissions!.IsAdministrator,
                CanManageChannels = m.Role!.Permissions!.CanManageChannels,
                CanManageRoles = m.Role!.Permissions!.CanManageRoles,
                CanKickMembers = m.Role!.Permissions!.CanKickMembers,
                CanBanMembers = m.Role!.Permissions!.CanBanMembers,
                CanCreateInvite = m.Role!.Permissions!.CanCreateInvite,
            })
            .FirstAsync(ct);

        return Results.Ok(new GuildDetailDto
        {
            Id = row.Id,
            Name = row.Name,
            IconUrl = row.IconUrl,
            MemberCount = row.MemberCount,
            IsOwner = row.IsOwner,
            // Same OR-with-IsOwner fix as in GetMyGuilds — the
            // owner is the universal admin bypass in
            // GuildPermissionService, so the client should see
            // them as admin here too.
            IsAdministrator = row.IsOwner || row.IsAdmin,
            CanManageChannels = row.IsOwner || row.IsAdmin || row.CanManageChannels,
            CanManageRoles = row.IsOwner || row.IsAdmin || row.CanManageRoles,
            CanKickMembers = row.IsOwner || row.IsAdmin || row.CanKickMembers,
            CanBanMembers = row.IsOwner || row.IsAdmin || row.CanBanMembers,
            CanCreateInvite = row.IsOwner || row.IsAdmin || row.CanCreateInvite,
            IsArchived = row.IsArchived,
            CreatedAt = row.CreatedAt,
        });
    }

    // ---- helpers ------------------------------------------------------------

    /// <summary>
    /// Builds a <see cref="GuildMemberDto"/> for one specific member.
    /// Used by <see cref="AddMember"/> to return the freshly-inserted
    /// row in the same shape as <see cref="GetGuildMembers"/>, so the
    /// client can splice the new entry into its existing list without
    /// a second round-trip.
    /// </summary>
    private static async Task<GuildMemberDto> GetMemberDtoAsync(
        AppDbContext context, int guildId, int userId, CancellationToken ct)
    {
        var m = await context.GuildMembers
            .AsNoTracking()
            .Where(x => x.GuildId == guildId && x.UserId == userId)
            .Select(x => new
            {
                x.UserId,
                Username = x.User!.Username,
                DisplayName = string.IsNullOrEmpty(x.User!.DisplayName) ? x.User!.Username : x.User!.DisplayName,
                AvatarUrl = x.User!.AvatarUrl,
                x.RoleId,
                RoleName = x.Role!.Name,
                RoleColor = x.Role!.Color,
                RoleIconSvg = x.Role!.IconSvg,
                x.IsOwner,
                IsAdmin = x.Role!.Permissions!.IsAdministrator,
                x.JoinedAt,
            })
            .FirstAsync(ct);

        return new GuildMemberDto
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
        };
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
            // Same as CreateGuild: the server only lets admins reach
            // this endpoint, so the moderation flags are also true.
            CanManageChannels = true,
            CanManageRoles = true,
            CanKickMembers = true,
            CanBanMembers = true,
            CanCreateInvite = true,
            IsArchived = guild.IsArchived,
        });
    }

    /// <summary>
    /// Adds an existing platform user to the guild with a chosen
    /// role. Permission gate: owner / IsAdministrator / CanManageRoles
    /// (same as the role-assignment endpoint, since adding someone
    /// is just a stronger form of the same operation). 404 if the
    /// user or the target role don't exist; 409 if the user is
    /// already a member.
    ///
    /// Unlike the invite-link flow, this skips the user-side
    /// consent step: the assumption is the admin is acting on
    /// behalf of a user who's already in the room (think "I just
    /// hired Bob, drop him in #engineering with the Engineer role").
    /// </summary>
    public static async Task<IResult> AddMember(
        int guildId,
        AddMemberDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        Chattr.Api.Realtime.LiveBroadcaster live,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, actorId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanManageRolesAsync(context, guildId, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        if (dto is null || dto.UserId <= 0 || dto.RoleId <= 0)
        {
            return Results.BadRequest("UserId and RoleId are required.");
        }

        // The target user must exist on the platform.
        var userExists = await context.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == dto.UserId, ct);
        if (!userExists)
        {
            return Results.NotFound("User not found.");
        }

        // The role must belong to this guild (not some other guild's
        // role that happens to share an id — that would silently
        // let an admin with cross-guild role ids do the wrong thing).
        var roleExists = await context.GuildRoles
            .AsNoTracking()
            .AnyAsync(r => r.Id == dto.RoleId && r.GuildId == guildId, ct);
        if (!roleExists)
        {
            return Results.NotFound("Role not found in this guild.");
        }

        // Idempotent: if the user is already in the guild, fail
        // loudly. The client should refresh its member list and
        // realise the row is already there.
        var alreadyMember = await context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId && m.UserId == dto.UserId, ct);
        if (alreadyMember)
        {
            return Results.Conflict("That user is already a member of this guild.");
        }

        context.GuildMembers.Add(new GuildMember
        {
            GuildId = guildId,
            UserId = dto.UserId,
            RoleId = dto.RoleId,
            IsOwner = false,
            JoinedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync(ct);

        // ---- Live broadcast ---------------------------------------
        // Two parallel broadcasts:
        //   1. To the guild group — every existing member's
        //      sidebar/member-list updates.
        //   2. To the new user's user group — their sidebar
        //      shows the new guild, and the client auto-joins
        //      the guild group on the hub so future updates
        //      land.
        // The 2nd broadcast is the critical one — without it,
        // the user has to reload to see the guild in their list.
        var memberDto = await GetMemberDtoAsync(context, guildId, dto.UserId, ct);
        // Pull the guild metadata + member-count for the
        // broadcast in one round-trip. We do this AFTER
        // the SaveChanges so the count is fresh.
        var guildRow = await context.Guilds
            .AsNoTracking()
            .Where(g => g.Id == guildId)
            .Select(g => new
            {
                g.Name,
                g.IconUrl,
                g.IsArchived,
                g.VouchCount,
                g.VouchLevel,
                g.VanitySlug,
            })
            .FirstOrDefaultAsync(ct);
        if (guildRow is null)
        {
            // The guild got deleted between the role
            // check and the broadcast. Extremely rare
            // but possible in a concurrent delete. We
            // already saved the GuildMember row, so we
            // just skip the live broadcast and return
            // success — the orphaned member row will be
            // cleaned up by the nightly retention job.
            return Results.Created(
                $"/api/guilds/{guildId}/members/{dto.UserId}",
                memberDto);
        }
        var guildPayload = new Chattr.Core.DTOs.Live.GuildEventPayload
        {
            Id = guildId,
            Name = guildRow.Name,
            IconUrl = guildRow.IconUrl,
            MemberCount = await context.GuildMembers.CountAsync(m => m.GuildId == guildId, ct),
            IsOwner = false,
            IsAdministrator = false, // will be refined on next /me/guilds fetch
            IsArchived = guildRow.IsArchived,
            VouchCount = guildRow.VouchCount,
            VouchLevel = guildRow.VouchLevel,
            VanitySlug = guildRow.VanitySlug,
        };
        var memberPayload = new Chattr.Core.DTOs.Live.MemberEventPayload
        {
            GuildId = guildId,
            UserId = dto.UserId,
            Username = memberDto.Username,
            DisplayName = memberDto.DisplayName,
            AvatarUrl = memberDto.AvatarUrl,
            Nickname = null,
            RoleId = memberDto.RoleId,
            RoleName = memberDto.RoleName,
            RoleColor = memberDto.RoleColor,
            RoleIconSvg = memberDto.RoleIconSvg,
            IsOwner = memberDto.IsOwner,
            IsAdministrator = memberDto.IsAdministrator,
            JoinedAt = memberDto.JoinedAt.ToString("O"),
        };

        // Fire-and-forget on the broadcasts. We do NOT await
        // them inline because the response to the admin caller
        // shouldn't block on SignalR group dispatch.
        _ = Task.WhenAll(
            live.MemberJoined(guildId, memberPayload),
            live.YouWereAddedToGuild(dto.UserId, guildPayload));

        return Results.Created(
            $"/api/guilds/{guildId}/members/{dto.UserId}",
            memberDto);
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

    /// <summary>
    /// Kicks another member out of the guild. Permission gate:
    /// <c>CanKickMembers</c> or <c>IsAdministrator</c> (owner
    /// always passes). Hierarchy enforced: a non-owner actor
    /// can't kick someone at-or-above their own role. Owners
    /// can't be kicked — that's a transfer-ownership workflow.
    /// 404 if the target isn't a member, 403 on permission /
    /// hierarchy failure, 409 if you'd be removing the last
    /// owner.
    /// </summary>
    public static async Task<IResult> KickMember(
        int guildId,
        int userId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, actorId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanKickMembersAsync(context, guildId, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        var target = await context.GuildMembers
            .FirstOrDefaultAsync(m => m.GuildId == guildId && m.UserId == userId, ct);
        if (target is null) return Results.NotFound();

        if (target.IsOwner)
        {
            return Results.Conflict(
                "Cannot kick a guild owner. Transfer ownership first.");
        }

        // Hierarchy check for non-owner actors. We re-use the
        // same rule the role-management endpoints use: target
        // must sit strictly below the actor. Owners bypass
        // (CanKickMembersAsync already returned true).
        var actor = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == actorId.Value)
            .Select(m => new { m.IsOwner, m.Role!.Position, m.Role!.Permissions!.IsAdministrator })
            .FirstOrDefaultAsync(ct);
        if (actor is null) return Results.Forbid();
        if (!actor.IsOwner && !actor.IsAdministrator)
        {
            var targetPosition = await context.GuildRoles
                .Where(r => r.Id == target.RoleId)
                .Select(r => r.Position)
                .FirstAsync(ct);
            if (targetPosition >= actor.Position)
            {
                return Results.Forbid();
            }
        }

        // Last-owner guard: if we'd be removing the only owner,
        // refuse. (Shouldn't happen — target.IsOwner is filtered
        // out above — but defensive.)
        if (target.IsOwner)
        {
            var ownerCount = await context.GuildMembers
                .CountAsync(m => m.GuildId == guildId && m.IsOwner, ct);
            if (ownerCount <= 1)
            {
                return Results.Conflict(
                    "You're the only owner. Transfer ownership or delete the guild first.");
            }
        }

        context.GuildMembers.Remove(target);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>
    /// Bans a user from the guild: removes their <c>GuildMember</c>
    /// row if they're still a member and inserts (or refreshes)
    /// a <c>GuildBan</c>. Same permission gate as kick
    /// (<c>CanBanMembers</c>) plus hierarchy. Bans are upserts:
    /// re-banning a banned user updates the existing row's
    /// reason / by / at instead of creating a duplicate, so the
    /// unique index on (GuildId, UserId) isn't violated.
    /// </summary>
    public static async Task<IResult> BanMember(
        int guildId,
        BanMemberDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, actorId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanBanMembersAsync(context, guildId, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        if (dto is null || dto.UserId <= 0)
        {
            return Results.BadRequest("UserId is required.");
        }
        if (dto.Reason is { Length: > 500 })
        {
            return Results.BadRequest("Reason must be 500 characters or fewer.");
        }

        var targetUserExists = await context.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == dto.UserId, ct);
        if (!targetUserExists)
        {
            return Results.NotFound("User not found.");
        }

        var target = await context.GuildMembers
            .FirstOrDefaultAsync(m => m.GuildId == guildId && m.UserId == dto.UserId, ct);

        if (target is not null)
        {
            if (target.IsOwner)
            {
                return Results.Conflict(
                    "Cannot ban a guild owner. Transfer ownership first.");
            }
            // Same hierarchy rule as kick: the actor must sit
            // above the target unless they're an owner / admin.
            var actor = await context.GuildMembers
                .AsNoTracking()
                .Where(m => m.GuildId == guildId && m.UserId == actorId.Value)
                .Select(m => new { m.IsOwner, m.Role!.Position, m.Role!.Permissions!.IsAdministrator })
                .FirstOrDefaultAsync(ct);
            if (actor is null) return Results.Forbid();
            if (!actor.IsOwner && !actor.IsAdministrator)
            {
                var targetPosition = await context.GuildRoles
                    .Where(r => r.Id == target.RoleId)
                    .Select(r => r.Position)
                    .FirstAsync(ct);
                if (targetPosition >= actor.Position)
                {
                    return Results.Forbid();
                }
            }
            context.GuildMembers.Remove(target);
        }

        // Upsert: if there's already a ban row for (guild, user),
        // refresh the reason / by / at; otherwise insert a new one.
        var existingBan = await context.GuildBans
            .FirstOrDefaultAsync(b => b.GuildId == guildId && b.UserId == dto.UserId, ct);
        if (existingBan is null)
        {
            existingBan = new GuildBan
            {
                GuildId = guildId,
                UserId = dto.UserId,
                BannedById = actorId.Value,
                BannedAt = DateTime.UtcNow,
                Reason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim(),
            };
            context.GuildBans.Add(existingBan);
        }
        else
        {
            existingBan.BannedById = actorId.Value;
            existingBan.BannedAt = DateTime.UtcNow;
            existingBan.Reason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim();
        }

        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/guilds/{guildId}/bans/{existingBan.UserId}",
            await ToBanDtoAsync(context, existingBan, ct));
    }

    /// <summary>
    /// Lifts an active ban. Permission gate: same as ban
    /// (<c>CanBanMembers</c>). Idempotent: unbanning a non-banned
    /// user is a 204, not a 404 — the intent ("make sure this
    /// person is not banned") is satisfied either way and the
    /// caller shouldn't have to special-case the race.
    /// </summary>
    public static async Task<IResult> UnbanMember(
        int guildId,
        int userId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, actorId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanBanMembersAsync(context, guildId, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        var ban = await context.GuildBans
            .FirstOrDefaultAsync(b => b.GuildId == guildId && b.UserId == userId, ct);
        if (ban is null) return Results.NoContent();
        context.GuildBans.Remove(ban);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>
    /// Lists active bans. Same gate as ban / unban. The list is
    /// ordered most-recent-first so the settings UI can show
    /// "last 10 bans" without a separate sort.
    /// </summary>
    public static async Task<IResult> ListBans(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var actorId = principal.UserIdOrNull();
        if (actorId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, actorId.Value, ct))
        {
            return Results.NotFound();
        }
        if (!await GuildPermissionService.CanBanMembersAsync(context, guildId, actorId.Value, ct))
        {
            return Results.Forbid();
        }

        var rows = await context.GuildBans
            .AsNoTracking()
            .Where(b => b.GuildId == guildId)
            .OrderByDescending(b => b.BannedAt)
            .ToListAsync(ct);

        var result = new List<GuildBanDto>(rows.Count);
        foreach (var b in rows) result.Add(await ToBanDtoAsync(context, b, ct));
        return Results.Ok(result);
    }

    private static async Task<GuildBanDto> ToBanDtoAsync(
        AppDbContext context, GuildBan ban, CancellationToken ct)
    {
        var user = await context.Users.AsNoTracking()
            .Where(u => u.Id == ban.UserId)
            .Select(u => new { u.Username, u.DisplayName })
            .FirstOrDefaultAsync(ct);
        var by = await context.Users.AsNoTracking()
            .Where(u => u.Id == ban.BannedById)
            .Select(u => u.Username)
            .FirstOrDefaultAsync(ct) ?? "(unknown)";
        return new GuildBanDto
        {
            Id = ban.Id,
            UserId = ban.UserId,
            Username = user?.Username ?? "(deleted)",
            DisplayName = string.IsNullOrEmpty(user?.DisplayName) ? (user?.Username ?? "(deleted)") : user.DisplayName,
            BannedById = ban.BannedById,
            BannedByUsername = by,
            BannedAt = ban.BannedAt,
            Reason = ban.Reason,
        };
    }
}
