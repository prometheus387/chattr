using System.Security.Claims;
using Chattr.Core.DTOs.Message;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services;
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

        // Join with the caller's GuildMember to surface their
        // role flags in the same query — used to compute the
        // per-message CanEdit / CanDelete booleans the client
        // uses to decide whether to render the edit / delete
        // action buttons. The join is inner-on-purpose: if the
        // caller isn't a member of the channel's guild, the
        // UserCanSeeChannelAsync check above would have already
        // 403'd, so we never reach this point as a non-member.
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
                m.DeletedAt,
                m.IsEdited,
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
                CallerPerms = m.Channel!.Guild!.Members
                    .Where(gm => gm.UserId == userId.Value)
                    .Select(gm => new
                    {
                        gm.IsOwner,
                        IsAdmin = gm.Role!.Permissions!.IsAdministrator,
                        CanDelete = gm.Role!.Permissions!.CanDeleteMessages,
                    })
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);

        return Results.Ok(messages.Select(m => {
            // CanEdit: own message OR IsAdministrator. We do NOT
            // include CanDeleteMessages here — that's a delete-
            // only flag, and Discord-style servers don't let
            // moderators with "manage messages" silently edit
            // other people's text. If you want admins to be
            // able to edit others' messages, the owner is
            // always the catch-all (no permission required).
            var callerOwnsMessage = m.AuthorId == userId.Value;
            var isOwner = m.CallerPerms?.IsOwner ?? false;
            var isAdmin = m.CallerPerms?.IsAdmin ?? false;
            var canDeleteMsgs = m.CallerPerms?.CanDelete ?? false;
            var canEdit = callerOwnsMessage || isOwner || isAdmin;
            var canDelete = callerOwnsMessage || isOwner || isAdmin || canDeleteMsgs;

            // When the message has been soft-deleted we still
            // return it (so reply chains stay intact) but blank
            // out the body. The client renders a "[message
            // deleted]" placeholder. We deliberately do NOT
            // strip the row's author / colour / etc — clients
            // might still want to show "user X deleted a
            // message" in audit logs / a future mod log.
            var content = m.DeletedAt is null
                ? m.Content
                : string.Empty;
            var isDeleted = m.DeletedAt is not null;

            return new MessageDto
            {
                Id = m.Id,
                ChannelId = m.ChannelId,
                AuthorId = m.AuthorId,
                AuthorName = m.AuthorName,
                AuthorRoleColor = m.AuthorRoleColor,
                AuthorRoleIconSvg = m.AuthorRoleIconSvg,
                AuthorRoleId = m.AuthorRoleId,
                Content = content,
                CreatedAt = m.CreatedAt,
                EditedAt = m.EditedAt,
                DeletedAt = m.DeletedAt,
                IsDeleted = isDeleted,
                CanEdit = canEdit,
                CanDelete = canDelete,
            };
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

        // Archived-guild gate: when the owner archived, only
        // they can keep posting. Anyone else — including
        // admins — gets 403. The owner-bypass happens
        // naturally because IsOwner is checked via the
        // principal's guild membership before this branch.
        var isOwner = await IsChannelOwnerAsync(context, channelId, userId.Value, ct);
        var guildArchived = await IsChannelGuildArchivedAsync(context, channelId, ct);
        if (guildArchived && !isOwner)
        {
            return Results.Conflict("This guild is archived. Only the owner can post.");
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
        // re-fetch the whole list. We use the channelId (not
        // message.Channel.GuildId) because we don't include
        // the Channel navigation on insert and `message.Channel`
        // would be null in this scope.
        var authorRow = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId.Value)
            .Select(u => new
            {
                u.Username,
                RoleColor = u.GuildMembers
                    .Where(gm => gm.GuildId == channelId)
                    .Select(gm => gm.Role!.Color)
                    .FirstOrDefault() ?? string.Empty,
                RoleIconSvg = u.GuildMembers
                    .Where(gm => gm.GuildId == channelId)
                    .Select(gm => gm.Role!.IconSvg)
                    .FirstOrDefault(),
                RoleId = u.GuildMembers
                    .Where(gm => gm.GuildId == channelId)
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
            DeletedAt = null,
            IsDeleted = false,
            // Newly-posted message: the author always has full
            // control over it.
            CanEdit = true,
            CanDelete = true,
        });
    }

    /// <summary>
    /// Edits a message's content. The author can always edit
    /// their own message. Moderators with the IsAdministrator
    /// permission on their role can also edit (so an admin can
    /// correct a misbehaving member without waiting for a
    /// delete-then-repost). The "CanDeleteMessages" permission
    /// does NOT grant edit rights — that flag is for messages
    /// that should be removed, not rewritten in someone else's
    /// voice.
    /// </summary>
    public static async Task<IResult> PatchMessage(
        int channelId,
        int messageId,
        EditMessageDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var content = (body?.Content ?? string.Empty).Trim();
        if (content.Length == 0)
        {
            return Results.BadRequest("Message content cannot be empty.");
        }
        if (content.Length > 4000)
        {
            return Results.BadRequest("Message too long (max 4000 chars).");
        }

        if (!await UserCanSeeChannelAsync(context, channelId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        // Pull the message + the caller's permissions in one
        // round-trip. We need the caller's GuildId (via the
        // channel) and their role's IsAdministrator flag to
        // decide whether they're allowed to edit. We also
        // need to know who the author is to compare against
        // the caller.
        var row = await context.Messages
            .AsNoTracking()
            .Where(m => m.Id == messageId && m.ChannelId == channelId)
            .Select(m => new
            {
                m.Id,
                m.ChannelId,
                m.AuthorId,
                m.Content,
                m.CreatedAt,
                m.EditedAt,
                m.DeletedAt,
                ChannelGuildId = m.Channel!.GuildId,
                CallerPerms = m.Channel!.Guild!.Members
                    .Where(gm => gm.UserId == userId.Value)
                    .Select(gm => new
                    {
                        gm.IsOwner,
                        IsAdmin = gm.Role!.Permissions!.IsAdministrator,
                    })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (row is null) return Results.NotFound();

        // Deleted messages are immutable — even the author
        // can't undelete by editing. (If we ever want that, the
        // right path is a separate "restore" endpoint.)
        if (row.DeletedAt is not null)
        {
            return Results.BadRequest("Cannot edit a deleted message.");
        }

        var callerOwnsMessage = row.AuthorId == userId.Value;
        var isOwner = row.CallerPerms?.IsOwner ?? false;
        var isAdmin = row.CallerPerms?.IsAdmin ?? false;
        var canEdit = callerOwnsMessage || isOwner || isAdmin;
        if (!canEdit)
        {
            return Results.Forbid();
        }

        // Track changes via a tracked fetch so EF actually
        // emits the UPDATE — the AsNoTracking projection above
        // is read-only.
        var tracked = await context.Messages
            .FirstAsync(m => m.Id == messageId && m.ChannelId == channelId, ct);
        tracked.Content = content;
        tracked.EditedAt = DateTime.UtcNow;
        tracked.IsEdited = true;
        await context.SaveChangesAsync(ct);

        // Re-fetch the row through the same projection the GET
        // endpoint uses, so the response includes the same
        // role fields and CanEdit/CanDelete the client expects.
        // Cheap (one row, indexed) and keeps the response
        // shape uniform.
        return Results.Ok(
            await BuildSingleDtoAsync(context, messageId, channelId, userId.Value, ct));
    }

    /// <summary>
    /// Soft-deletes a message: stamps <c>DeletedAt</c> and
    /// blanks the content. The row stays in place so any
    /// thread structure (replies, "in reply to" UI) is
    /// preserved. Authorisation: own message, guild owner,
    /// IsAdministrator, or the CanDeleteMessages permission
    /// (the "manage_messages" flag in the user spec).
    /// </summary>
    public static async Task<IResult> DeleteMessage(
        int channelId,
        int messageId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (!await UserCanSeeChannelAsync(context, channelId, userId.Value, ct))
        {
            return Results.Forbid();
        }

        var row = await context.Messages
            .AsNoTracking()
            .Where(m => m.Id == messageId && m.ChannelId == channelId)
            .Select(m => new
            {
                m.Id,
                m.AuthorId,
                m.DeletedAt,
                ChannelGuildId = m.Channel!.GuildId,
                CallerPerms = m.Channel!.Guild!.Members
                    .Where(gm => gm.UserId == userId.Value)
                    .Select(gm => new
                    {
                        gm.IsOwner,
                        IsAdmin = gm.Role!.Permissions!.IsAdministrator,
                        CanDeleteMsgs = gm.Role!.Permissions!.CanDeleteMessages,
                    })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (row is null) return Results.NotFound();

        // Idempotent: deleting an already-deleted message is a
        // no-op. Returns 204 either way so the client doesn't
        // have to special-case the second click.
        if (row.DeletedAt is null)
        {
            var callerOwnsMessage = row.AuthorId == userId.Value;
            var isOwner = row.CallerPerms?.IsOwner ?? false;
            var isAdmin = row.CallerPerms?.IsAdmin ?? false;
            var canDeleteMsgs = row.CallerPerms?.CanDeleteMsgs ?? false;
            var canDelete = callerOwnsMessage || isOwner || isAdmin || canDeleteMsgs;
            if (!canDelete)
            {
                return Results.Forbid();
            }

            var tracked = await context.Messages
                .FirstAsync(m => m.Id == messageId && m.ChannelId == channelId, ct);
            tracked.DeletedAt = DateTime.UtcNow;
            tracked.Content = string.Empty;
            await context.SaveChangesAsync(ct);
        }

        return Results.NoContent();
    }

    /// <summary>
    /// Re-runs the same projection as <see cref="GetMessages"/>
    /// but for a single message id. Used as the response body
    /// of PATCH so the client gets the full DTO shape (with
    /// role fields, CanEdit/CanDelete, etc.) without an extra
    /// GET round-trip.
    /// </summary>
    private static async Task<MessageDto> BuildSingleDtoAsync(
        AppDbContext context, int messageId, int channelId, int userId, CancellationToken ct)
    {
        // SELECT 1 + side-projection, exactly as GetMessages.
        // We keep the implementation duplicated rather than
        // refactoring GetMessages to accept a "by id" filter
        // because the latter would just push this projection
        // into a helper anyway — and we want to keep the
        // per-message CanEdit/CanDelete logic in one place
        // (this function below).
        var m = await context.Messages
            .AsNoTracking()
            .Where(x => x.Id == messageId && x.ChannelId == channelId)
            .Select(x => new
            {
                x.Id,
                x.ChannelId,
                x.AuthorId,
                AuthorName = x.Author!.Username,
                x.Content,
                x.CreatedAt,
                x.EditedAt,
                x.DeletedAt,
                x.IsEdited,
                AuthorRoleColor = x.Author!
                    .GuildMembers
                    .Where(gm => gm.GuildId == x.Channel!.GuildId)
                    .Select(gm => gm.Role!.Color)
                    .FirstOrDefault() ?? string.Empty,
                AuthorRoleIconSvg = x.Author!
                    .GuildMembers
                    .Where(gm => gm.GuildId == x.Channel!.GuildId)
                    .Select(gm => gm.Role!.IconSvg)
                    .FirstOrDefault(),
                AuthorRoleId = x.Author!
                    .GuildMembers
                    .Where(gm => gm.GuildId == x.Channel!.GuildId)
                    .Select(gm => (int?)gm.RoleId)
                    .FirstOrDefault(),
                CallerPerms = x.Channel!.Guild!.Members
                    .Where(gm => gm.UserId == userId)
                    .Select(gm => new
                    {
                        gm.IsOwner,
                        IsAdmin = gm.Role!.Permissions!.IsAdministrator,
                        CanDelete = gm.Role!.Permissions!.CanDeleteMessages,
                    })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (m is null)
        {
            // Caller passed a bad id (e.g. it was deleted from
            // another tab between the PATCH submit and the
            // response). Return a tombstone-ish DTO so the
            // client at least gets a consistent shape.
            return new MessageDto
            {
                Id = messageId,
                ChannelId = channelId,
                AuthorId = 0,
                AuthorName = string.Empty,
                IsDeleted = true,
            };
        }

        var callerOwnsMessage = m.AuthorId == userId;
        var isOwner = m.CallerPerms?.IsOwner ?? false;
        var isAdmin = m.CallerPerms?.IsAdmin ?? false;
        var canDeleteMsgs = m.CallerPerms?.CanDelete ?? false;
        var canEdit = callerOwnsMessage || isOwner || isAdmin;
        var canDelete = callerOwnsMessage || isOwner || isAdmin || canDeleteMsgs;
        var content = m.DeletedAt is null ? m.Content : string.Empty;

        return new MessageDto
        {
            Id = m.Id,
            ChannelId = m.ChannelId,
            AuthorId = m.AuthorId,
            AuthorName = m.AuthorName,
            AuthorRoleColor = m.AuthorRoleColor,
            AuthorRoleIconSvg = m.AuthorRoleIconSvg,
            AuthorRoleId = m.AuthorRoleId,
            Content = content,
            CreatedAt = m.CreatedAt,
            EditedAt = m.EditedAt,
            DeletedAt = m.DeletedAt,
            IsDeleted = m.DeletedAt is not null,
            CanEdit = canEdit,
            CanDelete = canDelete,
        };
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

    /// <summary>
    /// True when the calling user is the founder of the
    /// guild that owns the channel. Used to bypass the
    /// archive-gate in <see cref="PostMessage"/>: the
    /// owner of an archived guild is the only one allowed
    /// to keep posting (the spec is explicit that "the
    /// owner can no longer write" — wait, it says the
    /// *opposite*: only the owner can still write).
    /// </summary>
    private static async Task<bool> IsChannelOwnerAsync(
        AppDbContext context, int channelId, int userId, CancellationToken ct)
    {
        var guildId = await context.Channels
            .AsNoTracking()
            .Where(c => c.Id == channelId)
            .Select(c => (int?)c.GuildId)
            .FirstOrDefaultAsync(ct);
        if (guildId is null) return false;
        return await context.GuildMembers
            .AsNoTracking()
            .AnyAsync(m => m.GuildId == guildId.Value && m.UserId == userId && m.IsOwner, ct);
    }

    /// <summary>
    /// True when the channel's owning guild has
    /// <c>IsArchived = true</c>. Used by
    /// <see cref="PostMessage"/> to gate writes; the
    /// owner bypasses via <see cref="IsChannelOwnerAsync"/>.
    /// </summary>
    private static async Task<bool> IsChannelGuildArchivedAsync(
        AppDbContext context, int channelId, CancellationToken ct)
    {
        return await context.Guilds
            .AsNoTracking()
            .Where(g => g.Id == context.Channels.Where(c => c.Id == channelId).Select(c => c.GuildId).FirstOrDefault())
            .Select(g => (bool?)g.IsArchived)
            .FirstOrDefaultAsync(ct) ?? false;
    }
}
