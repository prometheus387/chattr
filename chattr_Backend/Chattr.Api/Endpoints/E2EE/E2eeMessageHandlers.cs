using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.Constants;
using Chattr.Core.Entities.E2EE;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.E2EE;

/// <summary>
/// E2EE message-history endpoint. Returns the channel's
/// <em>ciphertext</em> history — the server is honest
/// about its position: it stores opaque blobs, it
/// hands out opaque blobs, the client is the only
/// party that can turn them into plaintext.
///
/// Ephemeral channels (<see cref="Channel.IsEphemeral"/>
/// = true) return an empty list: the server has never
/// written a single message to disk, and the spec is
/// explicit that no historical load should happen on
/// enter. The client treats this as "you're in a
/// live-only channel, messages appear as people type".
/// </summary>
public static class E2eeMessageHandlers
{
    /// <summary>
    /// <c>GET /api/e2ee/channels/{id}/messages?limit=N</c>.
    /// Returns the most recent N messages in ascending
    /// id order (oldest first), each with its
    /// <c>KeyVersion</c> so the client can pick the
    /// right wrapped AES key from its store to decrypt
    /// with. Limit is clamped to 200; default 50.
    /// </summary>
    public static async Task<IResult> GetMessages(
        int channelId,
        int? limit,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        // ---- Visibility check (same gate as the legacy
        //      /api/channels/{id}/messages endpoint) ----
        // E2EE channels don't have a Guild, so we go
        // straight to ChannelMember. Phase-3 simplified
        // model; when DMs / guild-only channels arrive
        // we'll widen this.
        var isMember = await context.Set<ChannelMember>()
            .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value, ct);
        if (!isMember) return Results.NotFound();

        // ---- Ephemeral short-circuit ----
        // The spec: "beim Betreten kein Verlauf geladen".
        // Returning [] is honest — the server never had
        // a history to give.
        var channel = await context.Set<Channel>()
            .Where(c => c.Id == channelId)
            .Select(c => new { c.IsEphemeral })
            .FirstOrDefaultAsync(ct);
        if (channel is null) return Results.NotFound();
        if (channel.IsEphemeral) return Results.Ok(Array.Empty<object>());

        // ---- Standard path: read the ciphertext tail ----
        var cap = Math.Clamp(limit ?? 50, 1, 200);
        var rows = await context.Set<Message>()
            .Where(m => m.ChannelId == channelId)
            .OrderByDescending(m => m.Id)
            .Take(cap)
            .OrderBy(m => m.Id) // re-ascending for client convenience
            .Select(m => new
            {
                m.Id,
                m.ChannelId,
                m.SenderId,
                SenderName = m.Sender!.Username,
                m.Ciphertext,
                m.KeyVersion,
                m.CreatedAt,
                IsEphemeral = false,
            })
            .ToListAsync(ct);
        return Results.Ok(rows);
    }

    /// <summary>
    /// <c>POST /api/e2ee/channels/{id}/messages</c>.
    /// Persist a ciphertext message and return the
    /// server-assigned id. Used by clients that want
    /// REST over WebSocket (e.g. mobile with flaky
    /// connections, or for non-live history import).
    /// Live broadcasting happens via the SignalR hub;
    /// this REST endpoint only persists.
    /// </summary>
    public static async Task<IResult> PostMessage(
        int channelId,
        PostE2eeMessageDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        var isMember = await context.Set<ChannelMember>()
            .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value, ct);
        if (!isMember) return Results.NotFound();

        // Standard channels only — ephemeral channels
        // don't have a database table for messages at
        // all (well, they have one but it's never
        // written to). The hub handles ephemeral;
        // reaching this endpoint for an ephemeral
        // channel is a client bug, so 400.
        var channel = await context.Set<Channel>()
            .FirstOrDefaultAsync(c => c.Id == channelId, ct);
        if (channel is null) return Results.NotFound();
        if (channel.IsEphemeral)
        {
            return Results.BadRequest(
                "Ephemeral channels don't persist messages — use the live hub.");
        }

        if (string.IsNullOrWhiteSpace(body.Ciphertext))
        {
            return Results.BadRequest("Ciphertext is required.");
        }

        var row = new Message
        {
            ChannelId = channelId,
            SenderId = userId.Value,
            Ciphertext = body.Ciphertext,
            KeyVersion = body.KeyVersion,
            CreatedAt = DateTime.UtcNow,
        };
        context.Set<Message>().Add(row);
        await context.SaveChangesAsync(ct);
        return Results.Created(
            $"/api/e2ee/channels/{channelId}/messages/{row.Id}",
            new
            {
                row.Id,
                row.ChannelId,
                row.SenderId,
                row.Ciphertext,
                row.KeyVersion,
                row.CreatedAt,
            });
    }
}

public sealed class PostE2eeMessageDto
{
    public string Ciphertext { get; set; } = string.Empty;
    public int KeyVersion { get; set; }
}
