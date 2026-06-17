namespace Chattr.Api.Endpoints.Messages;

public static class MessageRoutes
{
    public static void MapMessageEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/channels/{channelId:int}")
            .RequireAuthorization();

        // List messages in a channel. Members-only (enforced
        // by the handler's UserCanSeeChannelAsync check).
        group.MapGet("/messages", MessageHandlers.GetMessages);

        // Post a new message. Members-only.
        group.MapPost("/messages", MessageHandlers.PostMessage);

        // Per-message ops. The handler re-checks the
        // edit/delete permission (own message + IsAdministrator
        // for edit; +CanDeleteMessages for delete) so non-
        // members can't bypass via 403, and 404 covers the
        // "guild doesn't exist or you're not in it" case
        // (consistent with the rest of the message endpoints).
        group.MapPatch("/messages/{messageId:int}", MessageHandlers.PatchMessage);
        group.MapDelete("/messages/{messageId:int}", MessageHandlers.DeleteMessage);
    }
}
