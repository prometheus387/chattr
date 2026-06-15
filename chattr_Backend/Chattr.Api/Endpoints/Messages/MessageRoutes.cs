namespace Chattr.Api.Endpoints.Messages;

public static class MessageRoutes
{
    public static void MapMessageEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/channels/{channelId:int}");

        group.MapGet("/messages", MessageHandlers.GetMessages)
             .RequireAuthorization();
        group.MapPost("/messages", MessageHandlers.PostMessage)
             .RequireAuthorization();
    }
}
