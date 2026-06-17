using Chattr.Api.Hubs;

namespace Chattr.Api.Endpoints;

/// <summary>
/// Mount point for the broadcast hub. The
/// <c>/hubs/live</c> path is the live-update hub; the
/// E2EE chat hub keeps its own <c>/hubs/e2ee-chat</c>
/// path (Phase 3). The client maintains two SignalR
/// connections — one to each.
/// </summary>
public static class HubRoutes
{
    public static void MapE2eeChatHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<E2eeChatHub>("/hubs/e2ee-chat");
    }

    public static void MapLiveHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<LiveHub>("/hubs/live");
    }
}
