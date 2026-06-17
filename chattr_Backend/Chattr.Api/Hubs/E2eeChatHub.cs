using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.Entities.E2EE;
using Chattr.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Hubs;

/// <summary>
/// SignalR hub for live E2EE chat. Two modes:
/// <list type="number">
///   <item>Standard channel (<see cref="Channel.IsEphemeral"/>
///         = false): the hub persists the ciphertext via
///         EF Core, then broadcasts to the group. A
///         client that comes back later can re-fetch
///         the history through
///         <c>GET /api/e2ee/channels/{id}/messages</c>.</item>
///   <item>Ephemeral / self-destroy channel: the hub is
///         a pure postman. It <b>never</b> writes to
///         the database, just broadcasts the supplied
///         ciphertext to the room. As soon as a client
///         drops its in-RAM list — channel leave, F5,
///         tab close — the messages are gone from
///         their perspective. The server has no
///         recovery path either, by design.</item>
/// </list>
///
/// The "ciphertext" the hub shuttles is opaque to the
/// server: it never tries to decrypt, validate, or
/// re-encrypt. That's the entire point of the
/// end-to-end design. The hub is a transport layer,
/// not a participant in the crypto protocol.
///
/// <para>
/// Authentication: the hub uses the same JWT bearer
/// scheme as the REST endpoints. <c>[Authorize]</c> at
/// the class level rejects unauthenticated connects
/// outright. The user-id is pulled from
/// <c>Context.UserIdentifier</c> on each call.
/// </para>
/// </summary>
[Authorize]
public sealed class E2eeChatHub : Hub<IE2eeChatClient>
{
    private readonly AppDbContext _context;
    private readonly ILogger<E2eeChatHub> _logger;
    private readonly IConfiguration _configuration;

    public E2eeChatHub(
        AppDbContext context,
        ILogger<E2eeChatHub> logger,
        IConfiguration configuration)
    {
        _context = context;
        _logger = logger;
        _configuration = configuration;
    }

    /// <summary>
    /// The SignalR <c>OnConnectedAsync</c> hook. We
    /// just log here — the real membership work
    /// happens in <see cref="JoinChannel"/>, which the
    /// client calls explicitly. SignalR's group
    /// semantics are "additive": a connection can be
    /// in many groups, so we don't auto-join on
    /// connect (we don't know which channels the user
    /// wants).
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        var userId = ResolveUserId();
        _logger.LogInformation(
            "SignalR connected: connectionId={ConnId} userId={UserId}",
            Context.ConnectionId, userId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = ResolveUserId();
        _logger.LogInformation(
            "SignalR disconnected: connectionId={ConnId} userId={UserId} reason={Reason}",
            Context.ConnectionId, userId, exception?.Message ?? "client-closed");
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// <c>JoinChannel(int channelId)</c> — adds the
    /// caller to the SignalR group
    /// <c>channel-{channelId}</c>. Refuses non-members
    /// with <c>HubException</c> (which SignalR
    /// surfaces to the client as an invocation error).
    /// </summary>
    public async Task JoinChannel(int channelId)
    {
        var userId = ResolveUserId();
        if (userId is null) throw new HubException("Not authenticated.");

        var isMember = await _context.Set<ChannelMember>()
            .AnyAsync(m => m.ChannelId == channelId && m.UserId == userId.Value);
        if (!isMember) throw new HubException("Not a member of this channel.");

        var groupName = GroupName(channelId);
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        _logger.LogDebug(
            "Joined: user={UserId} channel={ChannelId} conn={ConnId}",
            userId, channelId, Context.ConnectionId);

        // Send a synthetic system note to the group
        // when the user joins? The spec doesn't ask
        // for it. The client can render "X joined" on
        // its own from the presence events.
    }

    /// <summary>
    /// <c>LeaveChannel(int channelId)</c> — explicit
    /// leave. <c>OnDisconnectedAsync</c> removes the
    /// user from all groups automatically, so this is
    /// only needed when the user switches channels
    /// without disconnecting.
    /// </summary>
    public async Task LeaveChannel(int channelId)
    {
        await Groups.RemoveFromGroupAsync(
            Context.ConnectionId, GroupName(channelId));
    }

    /// <summary>
    /// <c>SendMessage(channelId, ciphertext, keyVersion, ephemeralId?)</c>.
    ///
    /// The standard path: persist the ciphertext in
    /// <c>Messages</c> with the supplied
    /// <c>KeyVersion</c>, then broadcast the persisted
    /// row to the group. The sender's connection sees
    /// the broadcast too, so the optimistic-insert UX
    /// in the client (write the message immediately,
    /// then update with the server id when the
    /// broadcast comes back) works without any
    /// special-casing.
    ///
    /// The ephemeral path: do <b>nothing</b> on disk,
    /// just broadcast. The supplied
    /// <c>ephemeralId</c> (a client-generated UUID) is
    /// the only id this message will ever have — the
    /// server has no way to dedupe or replay, and
    /// that's by design.
    /// </summary>
    public async Task<SendMessageResultDto> SendMessage(SendMessageDto body)
    {
        var userId = ResolveUserId();
        if (userId is null) throw new HubException("Not authenticated.");

        if (body is null) throw new HubException("Body is required.");
        if (body.ChannelId <= 0) throw new HubException("channelId is required.");
        if (string.IsNullOrWhiteSpace(body.Ciphertext))
            throw new HubException("ciphertext is required.");

        // ---- Channel-state lookup ----
        // Single round-trip: member-check + IsEphemeral.
        // We do this in one LINQ projection so the
        // server touches the row exactly once.
        var channel = await _context.Set<Channel>()
            .Where(c => c.Id == body.ChannelId)
            .Select(c => new
            {
                c.Id,
                c.IsEphemeral,
                IsMember = c.CreatedByUserId == userId.Value ||
                    _context.Set<ChannelMember>().Any(m =>
                        m.ChannelId == c.Id && m.UserId == userId.Value),
            })
            .FirstOrDefaultAsync();
        if (channel is null || !channel.IsMember)
            throw new HubException("Not a member of this channel.");

        if (channel.IsEphemeral)
        {
            // Pure broadcast. No database write.
            // The EphemeralId is the client-generated
            // UUID; we hand it back unchanged. The
            // sender's client uses it to dedupe the
            // round-trip; remote clients use it to
            // render the same key (so a third-party
            // "X says" quote works).
            var ephemeralEnvelope = new LiveMessageDto
            {
                Id = 0, // never assigned for ephemeral
                ChannelId = body.ChannelId,
                SenderId = userId.Value,
                SenderName = string.Empty, // filled in by the broadcast handler
                Ciphertext = body.Ciphertext,
                KeyVersion = body.KeyVersion,
                SentAt = DateTime.UtcNow,
                IsEphemeral = true,
                EphemeralId = body.EphemeralId ?? Guid.NewGuid().ToString("N"),
            };
            await Clients.Group(GroupName(body.ChannelId))
                .ReceiveMessage(ephemeralEnvelope);
            return new SendMessageResultDto(
                ephemeralEnvelope.EphemeralId,
                Id: 0,
                Persisted: false);
        }

        // Standard path: persist + broadcast.
        var sender = await _context.Users
            .Where(u => u.Id == userId.Value)
            .Select(u => u.Username)
            .FirstOrDefaultAsync();
        var row = new Message
        {
            ChannelId = body.ChannelId,
            SenderId = userId.Value,
            Ciphertext = body.Ciphertext,
            KeyVersion = body.KeyVersion,
            CreatedAt = DateTime.UtcNow,
        };
        _context.Set<Message>().Add(row);
        await _context.SaveChangesAsync();

        var envelope = new LiveMessageDto
        {
            Id = row.Id,
            ChannelId = row.ChannelId,
            SenderId = row.SenderId,
            SenderName = sender ?? string.Empty,
            Ciphertext = row.Ciphertext,
            KeyVersion = row.KeyVersion,
            SentAt = row.CreatedAt,
            IsEphemeral = false,
            EphemeralId = null,
        };
        await Clients.Group(GroupName(body.ChannelId))
            .ReceiveMessage(envelope);
        return new SendMessageResultDto(
            EphemeralId: null,
            Id: row.Id,
            Persisted: true);
    }

    private string GroupName(int channelId) => $"channel-{channelId}";

    private int? ResolveUserId()
    {
        var claim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(claim, out var id) ? id : null;
    }
}

/// <summary>
/// The client-side surface of the hub. SignalR
/// generates a typed client from this interface so
/// callers get a <c>connection.on("ReceiveMessage", …)</c>
/// with a strongly-typed payload.
/// </summary>
public interface IE2eeChatClient
{
    Task ReceiveMessage(LiveMessageDto message);
}

/// <summary>
/// Wire payload of a single chat message. The same
/// shape is used for persisted messages (with
/// <c>Id &gt; 0</c> and <c>IsEphemeral = false</c>) and
/// for ephemeral ones (<c>Id = 0</c>,
/// <c>IsEphemeral = true</c>, <c>EphemeralId</c>
/// non-null). The <c>SenderName</c> field is filled
/// in by the server for broadcast; ephemeral
/// messages might leave it empty on the very first
/// hop and the receiver can fall back to a
/// presence-cache lookup.
/// </summary>
public sealed class LiveMessageDto
{
    public int Id { get; set; }
    public int ChannelId { get; set; }
    public int SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public string Ciphertext { get; set; } = string.Empty;
    public int KeyVersion { get; set; }
    public DateTime SentAt { get; set; }
    public bool IsEphemeral { get; set; }
    public string? EphemeralId { get; set; }
}

/// <summary>Client → server payload.</summary>
public sealed class SendMessageDto
{
    public int ChannelId { get; set; }
    public string Ciphertext { get; set; } = string.Empty;
    public int KeyVersion { get; set; }
    /// <summary>
    /// Client-generated UUID. Required for ephemeral
    /// channels; ignored (server returns its own id) for
    /// persisted channels.
    /// </summary>
    public string? EphemeralId { get; set; }
}

/// <summary>
/// Server → caller response. Tells the sender what
/// id the broadcast will carry so the client can
/// reconcile its optimistic UI row.
/// </summary>
public sealed record SendMessageResultDto(
    string? EphemeralId,
    int Id,
    bool Persisted);
