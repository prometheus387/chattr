using Microsoft.AspNetCore.Authorization;
using Chattr.Api.Realtime;
using Chattr.Core.DTOs.Live;
using Microsoft.AspNetCore.SignalR;

namespace Chattr.Api.Hubs;

/// <summary>
/// LiveHub — the broadcast hub for all non-chat
/// live-update events: guilds, channels, members,
/// messages (plain-text, separate from the E2EE
/// ciphertext hub), DMs, notifications, presence.
///
/// <para>
/// The E2EE chat hub (Phase 3) lives separately at
/// <c>/hubs/e2ee-chat</c>. The client maintains two
/// SignalR connections — one to this hub, one to
/// the chat hub.
/// </para>
///
/// <para>
/// Authentication: <c>[Authorize]</c> at the class
/// level rejects unauthenticated connects.
/// </para>
///
/// <para>
/// Group layout (this hub):
/// <list type="bullet">
///   <item><c>user-{userId}</c> — auto-joined on connect.</item>
///   <item><c>guild-{guildId}</c> — joined via <c>JoinGuild</c>.</item>
/// </list>
/// </para>
/// </summary>
[Authorize]
public sealed class LiveHub : Hub<ILiveClient>
{
    private readonly ILogger<LiveHub> _logger;
    private readonly Chattr.Api.Realtime.LiveBroadcaster _broadcaster;

    public LiveHub(
        ILogger<LiveHub> logger,
        Chattr.Api.Realtime.LiveBroadcaster broadcaster)
    {
        _logger = logger;
        _broadcaster = broadcaster;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = ResolveUserId();
        if (userId is not null)
        {
            await _broadcaster.AddToUserGroup(Context.ConnectionId, userId.Value);
        }
        _logger.LogInformation(
            "LiveHub connected: conn={ConnId} userId={UserId}",
            Context.ConnectionId, userId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation(
            "LiveHub disconnected: conn={ConnId} reason={Reason}",
            Context.ConnectionId, exception?.Message ?? "client-closed");
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinGuild(int guildId)
    {
        var userId = ResolveUserId();
        if (userId is null) throw new HubException("Not authenticated.");
        await _broadcaster.AddToGuildGroup(Context.ConnectionId, guildId);
    }

    public async Task LeaveGuild(int guildId)
    {
        await _broadcaster.RemoveFromGuildGroup(Context.ConnectionId, guildId);
    }

    private int? ResolveUserId()
    {
        var claim = Context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(claim, out var id) ? id : null;
    }
}
