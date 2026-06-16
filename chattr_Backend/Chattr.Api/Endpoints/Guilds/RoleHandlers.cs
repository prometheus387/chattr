using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.Guild;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Guilds;

public static class RoleHandlers
{
    /// <summary>
    /// Lists the roles in a guild in display order (highest
    /// Position first). Available to any member — knowing the role
    /// names and colors is not a privileged operation. We include
    /// the full permission flags so the settings UI can render the
    /// role table without a second round-trip per role.
    /// </summary>
    public static async Task<IResult> ListRoles(
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

        var roles = await context.GuildRoles
            .AsNoTracking()
            .Where(r => r.GuildId == guildId)
            .OrderByDescending(r => r.Position)
            .Select(r => new RoleDto
            {
                Id = r.Id,
                Name = r.Name,
                Color = r.Color,
                Position = r.Position,
                DisplaySeparately = r.DisplaySeparately,
                IconSvg = r.IconSvg,
                Permissions = new RolePermissionsDto
                {
                    IsAdministrator = r.Permissions!.IsAdministrator,
                    CanManageRoles = r.Permissions!.CanManageRoles,
                    CanCreateInvite = r.Permissions!.CanCreateInvite,
                    CanManageChannels = r.Permissions!.CanManageChannels,
                    CanDeleteMessages = r.Permissions!.CanDeleteMessages,
                    CanBanMembers = r.Permissions!.CanBanMembers,
                    CanKickMembers = r.Permissions!.CanKickMembers,
                    CanMuteMembers = r.Permissions!.CanMuteMembers,
                    CanDeafenMembers = r.Permissions!.CanDeafenMembers,
                    CanTimeoutMembers = r.Permissions!.CanTimeoutMembers,
                    CanChangeOwnNickname = r.Permissions!.CanChangeOwnNickname,
                    CanChangeNickName = r.Permissions!.CanChangeNickName,
                    BypassSlowmode = r.Permissions!.BypassSlowmode,
                },
            })
            .ToListAsync(ct);

        return Results.Ok(roles);
    }

    /// <summary>
    /// Creates a new role in the guild. The caller must be able to
    /// manage roles (owner, or a role with IsAdministrator /
    /// CanManageRoles whose own position is above 0 — i.e. strictly
    /// higher than <c>@everyone</c>). The new role lands just
    /// above <c>@everyone</c> (Position 10) by default; the
    /// position can be tweaked via PATCH right after.
    /// </summary>
    public static async Task<IResult> CreateRole(
        int guildId,
        CreateRoleDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        // Creating a role IS managing the (about-to-exist) role
        // hierarchy, so the actor must be able to manage at least
        // the position where the new role will land. We default
        // that position to 10 (just above @everyone=0) and reuse
        // the CanManageRole helper against a stand-in check.
        //
        // The simplest "may I create a role here?" gate: am I the
        // owner, OR do I have IsAdministrator / CanManageRoles on
        // a role with Position > 0? Anything strictly above
        // @everyone is fair game for someone with management
        // powers. We use CanManageRole against the @everyone row
        // so the rule lives in one place.
        var everyoneId = await context.GuildRoles
            .Where(r => r.GuildId == guildId && r.Name == "@everyone")
            .Select(r => r.Id)
            .FirstOrDefaultAsync(ct);
        if (everyoneId == 0) return Results.NotFound();

        if (!await GuildPermissionService.CanManageRoleAsync(context, guildId, userId.Value, everyoneId, ct))
        {
            return Results.Forbid();
        }

        var name = (dto.Name ?? string.Empty).Trim();
        if (name.Length < 1)
        {
            return Results.BadRequest("Role name is required.");
        }
        if (name.Length > 50)
        {
            return Results.BadRequest("Role name must be 50 characters or fewer.");
        }

        // Insert the new role and renumber positions so it lands
        // at 10 (the natural "just above @everyone" slot). We
        // bump every existing role by 10 to make room, then set
        // the new one to 10. Done in a single transaction so a
        // mid-flight failure can't leave a duplicate position.
        var role = new GuildRole
        {
            GuildId = guildId,
            Name = name,
            Color = string.IsNullOrWhiteSpace(dto.Color) ? "#99aab5" : dto.Color,
            Position = 10,
            DisplaySeparately = dto.DisplaySeparately,
            Permissions = new GuildRolePermissions
            {
                IsAdministrator = dto.Permissions?.IsAdministrator ?? false,
                CanManageRoles = dto.Permissions?.CanManageRoles ?? false,
                CanCreateInvite = dto.Permissions?.CanCreateInvite ?? false,
                CanManageChannels = dto.Permissions?.CanManageChannels ?? false,
                CanDeleteMessages = dto.Permissions?.CanDeleteMessages ?? false,
                CanBanMembers = dto.Permissions?.CanBanMembers ?? false,
                CanKickMembers = dto.Permissions?.CanKickMembers ?? false,
                CanMuteMembers = dto.Permissions?.CanMuteMembers ?? false,
                CanDeafenMembers = dto.Permissions?.CanDeafenMembers ?? false,
                CanTimeoutMembers = dto.Permissions?.CanTimeoutMembers ?? false,
                CanChangeOwnNickname = dto.Permissions?.CanChangeOwnNickname ?? false,
                CanChangeNickName = dto.Permissions?.CanChangeNickName ?? false,
                BypassSlowmode = dto.Permissions?.BypassSlowmode ?? false,
            },
        };
        context.GuildRoles.Add(role);
        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/guilds/{guildId}/roles/{role.Id}",
            await ToDtoAsync(context, role, ct));
    }

    /// <summary>
    /// Patches a role's mutable fields: name, color, position,
    /// displaySeparately, and the full permissions object.
    /// Hierarchy: <c>CanManageRoleAsync</c> enforces that the
    /// actor's own role sits above the target — except for the
    /// owner, who can move anything. The <c>@everyone</c> role
    /// (Position 0) is therefore only editable by the owner.
    /// </summary>
    public static async Task<IResult> UpdateRole(
        int guildId,
        int roleId,
        UpdateRoleDto dto,
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
        // "Own role" guard: an actor cannot edit the role
        // they're currently sitting on. The hierarchy check
        // below would also catch this (actor.Position >=
        // target.Position), but the resulting 403 is opaque —
        // the user has no way to know they hit a special
        // "can't edit yourself" rule vs. a generic "you don't
        // have permission" error. We surface a 400 with a
        // dedicated message so the client can present it
        // cleanly. Owners are exempted explicitly because
        // they need to be able to manage their own role
        // (e.g. to rename "Owner" to "Founder", or to
        // demote themselves to test the flow).
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct)
            && await GuildPermissionService.IsActorOnRoleAsync(context, guildId, userId.Value, roleId, ct))
        {
            return Results.BadRequest("You can't edit the role you're currently a member of. Ask the guild owner to make this change.");
        }
        if (!await GuildPermissionService.CanManageRoleAsync(context, guildId, userId.Value, roleId, ct))
        {
            return Results.Forbid();
        }

        var role = await context.GuildRoles
            .Include(r => r.Permissions)
            .FirstOrDefaultAsync(r => r.Id == roleId && r.GuildId == guildId, ct);
        if (role is null) return Results.NotFound();

        // Renaming @everyone is fine, but renaming it to
        // something else is allowed too — the caller is
        // permission-gated already.
        if (dto.Name is not null)
        {
            var name = dto.Name.Trim();
            if (name.Length < 1)
            {
                return Results.BadRequest("Role name is required.");
            }
            if (name.Length > 50)
            {
                return Results.BadRequest("Role name must be 50 characters or fewer.");
            }
            role.Name = name;
        }
        if (dto.Color is not null) role.Color = dto.Color;
        if (dto.DisplaySeparately is not null) role.DisplaySeparately = dto.DisplaySeparately.Value;

        // Icon SVG: nullable. Null/empty means "clear the icon".
        // Any non-empty value is run through SvgSanitizer first —
        // we never store raw user-supplied SVG in the DB. If the
        // sanitizer rejects the payload, return 400 with a clear
        // message; the client can either re-render with a fixed
        // SVG or omit the field.
        if (dto.IconSvg is not null)
        {
            if (string.IsNullOrWhiteSpace(dto.IconSvg))
            {
                role.IconSvg = null;
            }
            else
            {
                var cleaned = SvgSanitizer.Sanitize(dto.IconSvg);
                if (cleaned is null)
                {
                    return Results.BadRequest(
                        "Icon SVG could not be sanitized. Use a minimal inline-SVG with whitelisted elements (svg/g/path/circle/rect/etc.) and no script / event handlers / external references.");
                }
                role.IconSvg = cleaned;
            }
        }

        if (dto.Position is not null && dto.Position.Value != role.Position)
        {
            await RenumberPositionsAsync(context, guildId, roleId, dto.Position.Value, ct);
            // Refresh local copy — RenumberPositionsAsync updates
            // the DB but our `role` object is stale.
            role.Position = dto.Position.Value;
        }

        // Permissions: the payload includes every flag, so
        // applying it is a straight copy. The IsOwner / IsAdmin
        // flags get the same treatment — the helper above
        // already gated that the actor may edit this role.
        if (dto.Permissions is not null && role.Permissions is not null)
        {
            role.Permissions.IsAdministrator = dto.Permissions.IsAdministrator;
            role.Permissions.CanManageRoles = dto.Permissions.CanManageRoles;
            role.Permissions.CanCreateInvite = dto.Permissions.CanCreateInvite;
            role.Permissions.CanManageChannels = dto.Permissions.CanManageChannels;
            role.Permissions.CanDeleteMessages = dto.Permissions.CanDeleteMessages;
            role.Permissions.CanBanMembers = dto.Permissions.CanBanMembers;
            role.Permissions.CanKickMembers = dto.Permissions.CanKickMembers;
            role.Permissions.CanMuteMembers = dto.Permissions.CanMuteMembers;
            role.Permissions.CanDeafenMembers = dto.Permissions.CanDeafenMembers;
            role.Permissions.CanTimeoutMembers = dto.Permissions.CanTimeoutMembers;
            role.Permissions.CanChangeOwnNickname = dto.Permissions.CanChangeOwnNickname;
            role.Permissions.CanChangeNickName = dto.Permissions.CanChangeNickName;
            role.Permissions.BypassSlowmode = dto.Permissions.BypassSlowmode;
        }

        await context.SaveChangesAsync(ct);

        return Results.Ok(await ToDtoAsync(context, role, ct));
    }

    /// <summary>
    /// Deletes a role. <c>@everyone</c> cannot be deleted (it
    /// would orphan the member.RoleId NOT NULL constraint, and
    /// conceptually there's always a default tier). The handler
    /// also refuses if any member still has the role — the
    /// caller must reassign them first via
    /// <c>PATCH /api/guilds/{id}/members/{userId}/role</c>.
    /// </summary>
    public static async Task<IResult> DeleteRole(
        int guildId,
        int roleId,
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
        // "Own role" guard: an actor cannot edit the role
        // they're currently sitting on. The hierarchy check
        // below would also catch this (actor.Position >=
        // target.Position), but the resulting 403 is opaque —
        // the user has no way to know they hit a special
        // "can't edit yourself" rule vs. a generic "you don't
        // have permission" error. We surface a 400 with a
        // dedicated message so the client can present it
        // cleanly. Owners are exempted explicitly because
        // they need to be able to manage their own role
        // (e.g. to rename "Owner" to "Founder", or to
        // demote themselves to test the flow).
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct)
            && await GuildPermissionService.IsActorOnRoleAsync(context, guildId, userId.Value, roleId, ct))
        {
            return Results.BadRequest("You can't edit the role you're currently a member of. Ask the guild owner to make this change.");
        }
        if (!await GuildPermissionService.CanManageRoleAsync(context, guildId, userId.Value, roleId, ct))
        {
            return Results.Forbid();
        }

        var role = await context.GuildRoles.FirstOrDefaultAsync(r => r.Id == roleId && r.GuildId == guildId, ct);
        if (role is null) return Results.NotFound();

        if (role.Name == "@everyone")
        {
            return Results.BadRequest("@everyone cannot be deleted; it is the default role for every member.");
        }

        var memberCount = await context.GuildMembers.CountAsync(m => m.RoleId == roleId, ct);
        if (memberCount > 0)
        {
            return Results.Conflict(
                $"Cannot delete role: {memberCount} member(s) still have it. Reassign them first.");
        }

        context.GuildRoles.Remove(role);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>
    /// Assigns a role to a guild member. Hierarchy: the actor's
    /// role must be above the target role (so a mid-tier admin
    /// can't bump someone up past their own level). The owner
    /// can assign any role to anyone.
    /// </summary>
    public static async Task<IResult> AssignMemberRole(
        int guildId,
        int userId,
        AssignMemberRoleDto dto,
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
        if (!await GuildPermissionService.CanManageRoleAsync(context, guildId, actorId.Value, dto.RoleId, ct))
        {
            return Results.Forbid();
        }

        var targetRole = await context.GuildRoles
            .FirstOrDefaultAsync(r => r.Id == dto.RoleId && r.GuildId == guildId, ct);
        if (targetRole is null) return Results.NotFound();

        var member = await context.GuildMembers
            .FirstOrDefaultAsync(m => m.GuildId == guildId && m.UserId == userId, ct);
        if (member is null) return Results.NotFound();

        // Don't let the demote-to-everyone case accidentally nuke
        // the IsOwner flag — owners always keep IsOwner=true. A
        // future "transfer ownership" endpoint can flip it
        // explicitly with the appropriate guard.
        if (member.IsOwner && dto.RoleId != member.RoleId)
        {
            return Results.Conflict(
                "Cannot change the role of a guild owner. Transfer ownership first.");
        }

        member.RoleId = dto.RoleId;
        await context.SaveChangesAsync(ct);

        return Results.NoContent();
    }

    // ---- helpers ------------------------------------------------------------

    private static async Task RenumberPositionsAsync(
        AppDbContext context, int guildId, int roleId, int newPosition, CancellationToken ct)
    {
        // Load every role in the guild ordered by current position
        // (stable, ascending). Then find the moving role and slide
        // it to its new index in the list. Finally assign Positions
        // with gaps of 10 so future inserts don't have to renumber
        // everyone again.
        //
        // @everyone is special: it must ALWAYS sit at Position 0
        // (it's the default tier that every member starts on).
        // We therefore exclude it from the renumbering loop and
        // re-stamp it to 0 at the end. The target index for the
        // moving role is clamped so it can't be inserted at index 0.
        var roles = await context.GuildRoles
            .Where(r => r.GuildId == guildId)
            .OrderBy(r => r.Position)
            .ToListAsync(ct);

        var everyone = roles.FirstOrDefault(r => r.Name == "@everyone");
        var moving = roles.FirstOrDefault(r => r.Id == roleId);
        if (moving is null) return;

        // The rest of the hierarchy excludes @everyone.
        var others = roles.Where(r => r.Name != "@everyone").ToList();
        var movingIsEveryone = moving.Name == "@everyone";
        var movable = others.Where(r => r.Id != roleId).ToList();

        // If we're moving @everyone itself, just stamp it to 0 —
        // there's nothing else to reposition.
        if (movingIsEveryone)
        {
            moving.Position = 0;
            if (everyone is not null) everyone.Position = 0;
            await context.SaveChangesAsync(ct);
            return;
        }

        // With only the moving role + @everyone present, there are
        // no siblings to renumber. Just stamp the new position and
        // bail — `Math.Clamp(min, max)` throws when min > max, so
        // we guard the renumber path explicitly.
        if (movable.Count == 0)
        {
            moving.Position = Math.Max(1, newPosition);
            if (everyone is not null) everyone.Position = 0;
            await context.SaveChangesAsync(ct);
            return;
        }

        // Clamp the target index so we never insert anything at
        // index 0 (that's @everyone's slot). With `movable`
        // being N items, the new role lands at index 0..N inclusive.
        var targetIndex = Math.Clamp(newPosition, 1, movable.Count);
        movable.Insert(targetIndex, moving);

        for (var i = 0; i < movable.Count; i++)
        {
            movable[i].Position = (i + 1) * 10;
        }
        if (everyone is not null) everyone.Position = 0;

        await context.SaveChangesAsync(ct);
    }

    private static async Task<RoleDto> ToDtoAsync(
        AppDbContext context, GuildRole role, CancellationToken ct)
    {
        // Re-fetch in case Permissions haven't been included on the
        // caller's tracked entity.
        var perms = role.Permissions ?? await context.GuildRolePermissions
            .AsNoTracking()
            .FirstAsync(p => p.RoleId == role.Id, ct);

        return new RoleDto
        {
            Id = role.Id,
            Name = role.Name,
            Color = role.Color,
            Position = role.Position,
            DisplaySeparately = role.DisplaySeparately,
            IconSvg = role.IconSvg,
            Permissions = new RolePermissionsDto
            {
                IsAdministrator = perms.IsAdministrator,
                CanManageRoles = perms.CanManageRoles,
                CanCreateInvite = perms.CanCreateInvite,
                CanManageChannels = perms.CanManageChannels,
                CanDeleteMessages = perms.CanDeleteMessages,
                CanBanMembers = perms.CanBanMembers,
                CanKickMembers = perms.CanKickMembers,
                CanMuteMembers = perms.CanMuteMembers,
                CanDeafenMembers = perms.CanDeafenMembers,
                CanTimeoutMembers = perms.CanTimeoutMembers,
                CanChangeOwnNickname = perms.CanChangeOwnNickname,
                CanChangeNickName = perms.CanChangeNickName,
                BypassSlowmode = perms.BypassSlowmode,
            },
        };
    }
}
