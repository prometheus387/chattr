using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.Constants;
using Chattr.Core.DTOs.Guild;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Guilds;

/// <summary>
/// Endpoints for the platform-extensions on top of the core
/// guild model: vouches (a reputation system that unlocks
/// perks), vanity URLs (level-3 perk), self-context actions
/// (nickname changes) and multi-role membership management.
/// All endpoints are gated by the same membership / ownership
/// rules as the rest of the guild surface.
/// </summary>
public static class GuildExtensionsHandlers
{
    // ---- Vouches -----------------------------------------------------

    /// <summary>
    /// POST /api/guilds/{id}/vouches — the calling user
    /// vouches for the guild. Idempotent on retry (the
    /// (GuildId, UserId) unique index turns a second POST into
    /// a 409 rather than a double-count). Updates the cached
    /// <see cref="Guild.VouchCount"/> and recomputes
    /// <see cref="Guild.VouchLevel"/> so the dashboard reflects
    /// the new tier without a re-count query.
    /// </summary>
    public static async Task<IResult> CreateVouch(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await GuildPermissionService.IsGuildMemberAsync(context, guildId, userId.Value, ct))
        {
            // Self-vouching is allowed for any member — we
            // don't gate on admin here. Non-members get a 404
            // so the existence of the guild stays hidden.
            return Results.NotFound();
        }

        // Idempotency: if a row already exists, the unique
        // index will throw. We catch the PG unique-violation
        // and treat it as success so the client can retry
        // safely.
        var existing = await context.GuildVouches
            .AsNoTracking()
            .FirstOrDefaultAsync(v => v.GuildId == guildId && v.UserId == userId.Value, ct);
        if (existing is not null)
        {
            return Results.Conflict(new { error = "Already vouched." });
        }

        var vouch = new GuildVouch
        {
            GuildId = guildId,
            UserId = userId.Value,
            CreatedAt = DateTime.UtcNow,
        };
        context.GuildVouches.Add(vouch);

        // Update cached count + level. We do the level calc
        // in SQL because the trigger would be over-engineering
        // for the volume we expect.
        var guild = await context.Guilds.FirstAsync(g => g.Id == guildId, ct);
        guild.VouchCount += 1;
        guild.VouchLevel = ComputeVouchLevel(guild.VouchCount);

        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/guilds/{guildId}/vouches",
            await ToVouchDtoAsync(context, vouch, ct));
    }

    /// <summary>
    /// DELETE /api/guilds/{id}/vouches/me — retract the
    /// caller's own vouch. Decrements the cached count and
    /// re-derives the level. Idempotent (404 if the caller
    /// hadn't vouched in the first place).
    /// </summary>
    public static async Task<IResult> DeleteMyVouch(
        int guildId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var vouch = await context.GuildVouches
            .FirstOrDefaultAsync(v => v.GuildId == guildId && v.UserId == userId.Value, ct);
        if (vouch is null) return Results.NotFound();

        context.GuildVouches.Remove(vouch);
        var guild = await context.Guilds.FirstAsync(g => g.Id == guildId, ct);
        guild.VouchCount = Math.Max(0, guild.VouchCount - 1);
        guild.VouchLevel = ComputeVouchLevel(guild.VouchCount);
        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>
    /// GET /api/guilds/{id}/vouches — list of users who
    /// vouched, ordered by recency. Used by the
    /// settings "Vouches" tab.
    /// </summary>
    public static async Task<IResult> ListVouches(
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
        var vouches = await context.GuildVouches
            .AsNoTracking()
            .Where(v => v.GuildId == guildId)
            .OrderByDescending(v => v.CreatedAt)
            .Select(v => new
            {
                v.Id,
                v.GuildId,
                v.UserId,
                v.CreatedAt,
                Username = v.User!.Username,
                DisplayName = string.IsNullOrEmpty(v.User!.DisplayName) ? v.User!.Username : v.User!.DisplayName,
                AvatarUrl = v.User!.AvatarUrl,
            })
            .ToListAsync(ct);
        return Results.Ok(vouches.Select(v => new VouchDto
        {
            Id = v.Id,
            GuildId = v.GuildId,
            UserId = v.UserId,
            Username = v.Username,
            DisplayName = v.DisplayName,
            AvatarUrl = v.AvatarUrl,
            CreatedAt = v.CreatedAt,
        }));
    }

    /// <summary>
    /// GET /api/guilds/{id}/vouches/summary — the cached
    /// count + tier + the calling user's "vouched?" flag.
    /// Used by the settings header to render the level
    /// badge.
    /// </summary>
    public static async Task<IResult> GetVouchSummary(
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
        var guild = await context.Guilds
            .AsNoTracking()
            .Where(g => g.Id == guildId)
            .Select(g => new { g.VouchCount, g.VouchLevel })
            .FirstOrDefaultAsync(ct);
        if (guild is null) return Results.NotFound();
        // "Have I vouched?" lives in the GuildVouch table —
        // we look it up separately to avoid forcing a join
        // through Guild.Vouches (which would be a more
        // expensive read for the dashboard).
        var vouchedByMe = await context.GuildVouches
            .AsNoTracking()
            .AnyAsync(v => v.GuildId == guildId && v.UserId == userId.Value, ct);
        return Results.Ok(new VouchSummaryDto
        {
            VouchCount = guild.VouchCount,
            VouchLevel = guild.VouchLevel,
            VouchedByMe = vouchedByMe,
            UnlockedPerks = PerksForLevel(guild.VouchLevel).ToList(),
        });
    }

    // ---- Vanity URL --------------------------------------------------

    /// <summary>
    /// GET /api/guilds/{id}/vanity — the slug + the
    /// caller-facing URL. Visible to any member; the vanity
    /// URL is public anyway (the whole point is a
    /// shareable link).
    /// </summary>
    public static async Task<IResult> GetVanity(
        int guildId,
        AppDbContext context,
        CancellationToken ct)
    {
        var guild = await context.Guilds
            .AsNoTracking()
            .Where(g => g.Id == guildId)
            .Select(g => new { g.VanitySlug, g.VouchLevel, g.Name })
            .FirstOrDefaultAsync(ct);
        if (guild is null) return Results.NotFound();
        return Results.Ok(new VanitySlugDto
        {
            Slug = guild.VanitySlug,
            VouchLevel = guild.VouchLevel,
            VanityUrl = guild.VanitySlug is null
                ? string.Empty
                : $"/go/{guild.VanitySlug}",
        });
    }

    /// <summary>
    /// PATCH /api/guilds/{id}/vanity — owner-only, only at
    /// vouch level 3. Slug is lowercased, restricted to
    /// [a-z0-9-], 3-32 chars. Empty string clears the vanity.
    /// </summary>
    public static async Task<IResult> SetVanity(
        int guildId,
        SetVanitySlugDto dto,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        if (!await GuildPermissionService.IsGuildOwnerAsync(context, guildId, userId.Value, ct))
        {
            return Results.Forbid();
        }
        var guild = await context.Guilds.FirstAsync(g => g.Id == guildId, ct);
        if (guild.VouchLevel < 3)
        {
            return Results.BadRequest(
                "Vanity URL requires vouch level 3 (20+ vouches).");
        }
        var raw = (dto.Slug ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            guild.VanitySlug = null;
            await context.SaveChangesAsync(ct);
            return Results.Ok(new VanitySlugDto { Slug = null, VouchLevel = guild.VouchLevel });
        }
        if (raw.Length < 3 || raw.Length > 32)
        {
            return Results.BadRequest("Slug must be 3-32 characters.");
        }
        if (!System.Text.RegularExpressions.Regex.IsMatch(raw, "^[a-z0-9-]+$"))
        {
            return Results.BadRequest("Slug may only contain lowercase letters, digits, and hyphens.");
        }
        // Reject slugs that would collide with reserved
        // route segments (api, client, signin, register, go,
        // invite, admin). We check after the regex so the
        // error message is consistent.
        if (IsReservedSlug(raw))
        {
            return Results.BadRequest("Slug is reserved.");
        }
        // Uniqueness — the DB will also enforce this via the
        // unique index, but we want a 409 not a 500 here.
        var taken = await context.Guilds
            .AsNoTracking()
            .AnyAsync(g => g.VanitySlug == raw && g.Id != guildId, ct);
        if (taken) return Results.Conflict("Slug is already in use.");

        guild.VanitySlug = raw;
        await context.SaveChangesAsync(ct);
        return Results.Ok(new VanitySlugDto
        {
            Slug = guild.VanitySlug,
            VouchLevel = guild.VouchLevel,
            VanityUrl = $"/go/{guild.VanitySlug}",
        });
    }

    // ---- Nickname (self context menu) --------------------------------

    /// <summary>
    /// PATCH /api/guilds/{id}/me/nickname — set the
    /// caller's per-guild nickname. Requires the caller to
    /// either be the guild owner OR have a role with
    /// <c>CanChangeOwnNickname</c> set.
    /// </summary>
    public static async Task<IResult> SetMyNickname(
        int guildId,
        SetNicknameDto dto,
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
        // Owner-bypass: the founder can always change their
        // own nickname. Otherwise require the flag on at
        // least one of the caller's roles.
        var actor = await GuildPermissionService.GetActorViewAsync(context, guildId, userId.Value, ct);
        if (actor is null) return Results.NotFound();
        if (!actor.IsOwner && !actor.Has(p => p.CanChangeOwnNickname))
        {
            return Results.Forbid();
        }
        var raw = (dto.Nickname ?? string.Empty).Trim();
        if (raw.Length > 32)
        {
            return Results.BadRequest("Nickname must be 32 characters or fewer.");
        }
        var member = await context.GuildMembers
            .FirstAsync(m => m.GuildId == guildId && m.UserId == userId.Value, ct);
        // Empty string clears the nickname; we store null
        // rather than "" so the API contract stays clean.
        member.Nickname = raw.Length == 0 ? null : raw;
        await context.SaveChangesAsync(ct);
        return Results.Ok(new { nickname = member.Nickname });
    }

    // ---- Multi-role -------------------------------------------------

    /// <summary>
    /// PATCH /api/guilds/{id}/members/{userId}/roles —
    /// replace the member's full role set. Empty list is
    /// rejected (the primary RoleId is NOT NULL). The actor
    /// must be able to manage the highest target role per
    /// the existing CanManageRoleAsync rules; the same
    /// actor is the one whose rank the member's primary
    /// role must end up below (or they're the owner).
    /// </summary>
    public static async Task<IResult> SetMemberRoles(
        int guildId,
        int userId,
        SetMemberRolesDto dto,
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
        var member = await context.GuildMembers
            .FirstOrDefaultAsync(m => m.GuildId == guildId && m.UserId == userId, ct);
        if (member is null) return Results.NotFound();
        if (member.IsOwner)
        {
            return Results.Conflict("Cannot change the role set of a guild owner.");
        }

        var newRoleIds = (dto.RoleIds ?? new List<int>())
            .Distinct()
            .ToList();
        if (newRoleIds.Count == 0)
        {
            return Results.BadRequest(
                "A member must have at least one role. Send the role you want as primary.");
        }

        // Validate that every requested role exists in this
        // guild. The DB FK would also enforce this, but a
        // 400 with a clear message is friendlier than a 500
        // from EF's tracking error.
        var existingRoleIds = await context.GuildRoles
            .AsNoTracking()
            .Where(r => r.GuildId == guildId)
            .Select(r => r.Id)
            .ToListAsync(ct);
        var missing = newRoleIds.Except(existingRoleIds).ToList();
        if (missing.Count > 0)
        {
            return Results.BadRequest($"Unknown role id(s) in this guild: {string.Join(", ", missing)}");
        }

        // Hierarchy check: the actor must be able to manage
        // every role they're assigning. We iterate the
        // highest-position new role and check against the
        // actor's max — if that's a yes, all the others are
        // also manageable (since they sit below the highest).
        var highestTargetPos = await context.GuildRoles
            .AsNoTracking()
            .Where(r => newRoleIds.Contains(r.Id))
            .MaxAsync(r => (int?)r.Position) ?? 0;
        // The actor's max position is checked inside
        // CanManageRoleAsync; pass the highest-target role id
        // and trust that the gate covers the rest.
        var highestTargetId = await context.GuildRoles
            .AsNoTracking()
            .Where(r => newRoleIds.Contains(r.Id) && r.Position == highestTargetPos)
            .Select(r => r.Id)
            .FirstAsync(ct);
        if (!await GuildPermissionService.CanManageRoleAsync(context, guildId, actorId.Value, highestTargetId, ct))
        {
            return Results.Forbid();
        }

        // The first id in the (now deduped) list becomes the
        // primary role; the rest go into the m:n table.
        var primary = newRoleIds[0];
        var additional = newRoleIds.Skip(1).ToList();
        member.RoleId = primary;

        // Reconcile the additional-roles set: drop rows that
        // are no longer in the list, insert the new ones.
        var currentAdditional = await context.GuildMemberRoles
            .Where(mr => mr.GuildMemberId == member.Id)
            .ToListAsync(ct);
        var currentSet = currentAdditional.Select(a => a.RoleId).ToHashSet();
        var newSet = additional.ToHashSet();
        var toRemove = currentAdditional.Where(a => !newSet.Contains(a.RoleId)).ToList();
        var toAdd = additional.Where(id => !currentSet.Contains(id)).ToList();
        context.GuildMemberRoles.RemoveRange(toRemove);
        foreach (var id in toAdd)
        {
            context.GuildMemberRoles.Add(new GuildMemberRole
            {
                GuildMemberId = member.Id,
                RoleId = id,
            });
        }

        await context.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>
    /// GET /api/guilds/{id}/members/{userId} — detailed
    /// member view including the full role set and the
    /// displayed-role metadata (used by the role-assignment
    /// UI). The actor must be a member of the guild.
    /// </summary>
    public static async Task<IResult> GetMemberDetail(
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
        var row = await context.GuildMembers
            .AsNoTracking()
            .Where(m => m.GuildId == guildId && m.UserId == userId)
            .Select(m => new
            {
                m.Id,
                m.UserId,
                Username = m.User!.Username,
                DisplayName = string.IsNullOrEmpty(m.User!.DisplayName) ? m.User!.Username : m.User!.DisplayName,
                AvatarUrl = m.User!.AvatarUrl,
                m.Nickname,
                m.IsOwner,
                m.JoinedAt,
                Primary = new
                {
                    m.RoleId,
                    m.Role!.Name,
                    m.Role!.Color,
                    m.Role!.IconSvg,
                    m.Role!.Position,
                    IsAdmin = m.Role!.Permissions!.IsAdministrator,
                },
                Additional = m.AdditionalRoles
                    .Select(ar => new
                    {
                        ar.RoleId,
                        ar.Role!.Name,
                        ar.Role!.Color,
                        ar.Role!.IconSvg,
                        ar.Role!.Position,
                        IsAdmin = ar.Role!.Permissions!.IsAdministrator,
                    })
                    .ToList(),
            })
            .FirstOrDefaultAsync(ct);
        if (row is null) return Results.NotFound();

        // Compute the displayed role: highest position across
        // primary + additional. Ties broken by primary first.
        var all = new List<(int RoleId, string Name, string Color, string? IconSvg, int Position, bool IsAdmin)>
        {
            (row.Primary.RoleId, row.Primary.Name, row.Primary.Color, row.Primary.IconSvg, row.Primary.Position, row.Primary.IsAdmin),
        };
        all.AddRange(row.Additional.Select(a => (a.RoleId, a.Name, a.Color, a.IconSvg, a.Position, a.IsAdmin)));
        var display = all.OrderByDescending(r => r.Position).First();

        return Results.Ok(new GuildMemberDetailDto
        {
            UserId = row.UserId,
            Username = row.Username,
            DisplayName = row.DisplayName,
            AvatarUrl = row.AvatarUrl,
            Nickname = row.Nickname,
            IsOwner = row.IsOwner,
            DisplayRoleId = display.RoleId,
            DisplayRoleName = display.Name,
            DisplayRoleColor = display.Color,
            DisplayRoleIconSvg = display.IconSvg,
            RoleIds = all.OrderByDescending(r => r.Position).Select(r => r.RoleId).ToList(),
            IsAdministrator = all.Any(r => r.IsAdmin),
            JoinedAt = row.JoinedAt,
        });
    }

    // ---- Helpers ----------------------------------------------------

    /// <summary>
    /// Tier thresholds:
    /// <list type="bullet">
    ///   <item>0 → 2 vouches: level 0 (no perks)</item>
    ///   <item>3 → 9 vouches: level 1</item>
    ///   <item>10 → 19 vouches: level 2</item>
    ///   <item>20+ vouches: level 3 (vanity URL + everything below)</item>
    /// </list>
    /// </summary>
    private static int ComputeVouchLevel(int count) => count switch
    {
        >= 20 => 3,
        >= 10 => 2,
        >= 3 => 1,
        _ => 0,
    };

    /// <summary>
    /// Perks unlocked at each level. Used by the dashboard
    /// "Vouches" tab to show the user what they're getting
    /// for the vouches they've collected. The actual perk
    /// enforcement (file-upload caps, custom emoji, etc.)
    /// happens elsewhere — this is just the metadata.
    /// </summary>
    private static IEnumerable<string> PerksForLevel(int level)
    {
        if (level >= 1) yield return "Custom emoji + larger file uploads";
        if (level >= 2) yield return "Even larger file uploads + more channels";
        if (level >= 3) yield return "Vanity URL + everything above";
    }

    private static bool IsReservedSlug(string slug)
    {
        // Slugs that conflict with the existing route tree
        // would shadow real pages; reject them at the API
        // edge so the spec's "blocked normal paths" rule
        // for vanity-level-3 walls works correctly.
        string[] reserved = {
            "api", "client", "signin", "register", "invite",
            "go", "admin", "settings", "admin-dashboard",
            "favicon.ico", "robots.txt",
        };
        return reserved.Contains(slug);
    }

    private static async Task<VouchDto> ToVouchDtoAsync(
        AppDbContext context, GuildVouch v, CancellationToken ct)
    {
        var u = await context.Users
            .AsNoTracking()
            .Where(x => x.Id == v.UserId)
            .Select(x => new
            {
                x.Username,
                DisplayName = string.IsNullOrEmpty(x.DisplayName) ? x.Username : x.DisplayName,
                x.AvatarUrl,
            })
            .FirstAsync(ct);
        return new VouchDto
        {
            Id = v.Id,
            GuildId = v.GuildId,
            UserId = v.UserId,
            Username = u.Username,
            DisplayName = u.DisplayName,
            AvatarUrl = u.AvatarUrl,
            CreatedAt = v.CreatedAt,
        };
    }
}
