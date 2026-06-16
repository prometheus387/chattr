namespace Chattr.Api.Endpoints.Invites;

public static class InviteRoutes
{
    public static void MapInviteEndpoints(this IEndpointRouteBuilder app)
    {
        // Guild-scoped invite management (admin-only). The handlers
        // re-check admin permissions internally — anyone authenticated
        // can hit the route, non-admins get a 403 back.
        var guildGroup = app.MapGroup("/api/guilds/{guildId:int}/invites")
            .RequireAuthorization();
        guildGroup.MapPost("/", InviteHandlers.CreateInvite);
        guildGroup.MapGet("/", InviteHandlers.ListInvites);

        // Public-by-code invite lookup and accept. Preview is callable
        // by anonymous clients (so the /invite/<code> page can show
        // "you've been invited to X" before login). Accept still
        // requires auth, which the handler enforces itself.
        var codeGroup = app.MapGroup("/api/invites");
        codeGroup.MapGet("/{code}", InviteHandlers.PreviewInvite);
        codeGroup.MapPost("/{code}/accept", InviteHandlers.AcceptInvite)
                  .RequireAuthorization();

        // Revoke a specific invite by numeric id (admin only).
        app.MapDelete("/api/invites/{inviteId:int}", InviteHandlers.RevokeInvite)
           .RequireAuthorization();
    }
}
