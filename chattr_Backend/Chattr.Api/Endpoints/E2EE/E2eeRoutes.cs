namespace Chattr.Api.Endpoints.E2EE;

public static class E2eeChannelRoutes
{
    public static void MapE2eeChannelEndpoints(this IEndpointRouteBuilder app)
    {
        var channels = app.MapGroup("/api/e2ee/channels/{channelId:int}")
            .RequireAuthorization();

        // Channel metadata
        channels.MapGet("/", E2eeChannelHandlers.GetChannel);
        channels.MapPatch("/", E2eeChannelHandlers.UpdateChannel);

        // Member flows
        channels.MapPost("/members", E2eeChannelHandlers.AddMember);
        channels.MapGet("/members", E2eeChannelHandlers.ListMembers);

        // Key flows
        channels.MapGet("/my-key", E2eeChannelHandlers.GetMyKey);
        channels.MapPost("/rotate", E2eeChannelHandlers.Rotate);
        channels.MapGet("/public-keys", E2eeChannelHandlers.ListPublicKeys);

        // Messages — Phase 3.
        // GET returns ciphertext history (empty for
        // ephemeral channels). POST is the REST
        // alternative to the SignalR hub; only valid
        // for non-ephemeral channels (ephemeral goes
        // through the hub, no DB write).
        channels.MapGet("/messages", E2eeMessageHandlers.GetMessages);
        channels.MapPost("/messages", E2eeMessageHandlers.PostMessage);
    }
}

public static class E2eePublicKeyRoutes
{
    public static void MapE2eePublicKeyEndpoints(this IEndpointRouteBuilder app)
    {
        var me = app.MapGroup("/api/users/me")
            .RequireAuthorization();
        me.MapPut("/pgp-key", E2eePublicKeyHandlers.UploadMyKey);
        me.MapGet("/pgp-key", E2eePublicKeyHandlers.GetMyKey);

        app.MapGet(
                "/api/users/{userId:int}/pgp-key",
                E2eePublicKeyHandlers.GetUserKey)
           .RequireAuthorization();
    }
}
