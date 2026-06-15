namespace Chattr.Api.Endpoints.Presence;

public static class PresenceRoutes
{
    public static void MapPresenceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/presence");

        group.MapGet("/users", PresenceHandlers.GetUsersWithPresence)
             .RequireAuthorization();
        group.MapPost("/heartbeat", PresenceHandlers.Heartbeat)
             .RequireAuthorization();
    }
}
