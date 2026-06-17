namespace Chattr.Api.Endpoints.Guilds;

public static class GuildExtensionsRoutes
{
    public static void MapGuildExtensionsEndpoints(this IEndpointRouteBuilder app)
    {
        // Vouches (member-only)
        var vouchGroup = app.MapGroup("/api/guilds/{guildId:int}/vouches")
            .RequireAuthorization();
        vouchGroup.MapGet("/", GuildExtensionsHandlers.ListVouches);
        vouchGroup.MapGet("/summary", GuildExtensionsHandlers.GetVouchSummary);
        vouchGroup.MapPost("/", GuildExtensionsHandlers.CreateVouch);
        vouchGroup.MapDelete("/me", GuildExtensionsHandlers.DeleteMyVouch);

        // Vanity URL. GET is public-by-member, PATCH is
        // owner-only and requires vouch level 3.
        var vanityGroup = app.MapGroup("/api/guilds/{guildId:int}/vanity")
            .RequireAuthorization();
        vanityGroup.MapGet("/", GuildExtensionsHandlers.GetVanity);
        vanityGroup.MapPatch("/", GuildExtensionsHandlers.SetVanity);

        // Self-service nickname (own context menu entry).
        app.MapPatch(
                "/api/guilds/{guildId:int}/me/nickname",
                GuildExtensionsHandlers.SetMyNickname)
           .RequireAuthorization();

        // Multi-role membership. The :userId segment is the
        // target (whose role set is being set), the actor comes
        // from the JWT.
        var memberGroup = app.MapGroup("/api/guilds/{guildId:int}/members/{userId:int}")
            .RequireAuthorization();
        memberGroup.MapPatch("/roles", GuildExtensionsHandlers.SetMemberRoles);
        memberGroup.MapGet("/", GuildExtensionsHandlers.GetMemberDetail);
    }
}
