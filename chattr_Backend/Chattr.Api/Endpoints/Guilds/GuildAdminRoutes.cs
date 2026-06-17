namespace Chattr.Api.Endpoints.Guilds;

public static class GuildAdminRoutes
{
    public static void MapGuildAdminEndpoints(this IEndpointRouteBuilder app)
    {
        // Owner-only destructive operations on the guild.
        // Owner check is enforced inside each handler
        // (the IsGuildOwnerAsync call) so we can return
        // 404 for non-existent guilds and 403 for
        // not-the-owner without leaking the existence of
        // the guild to random callers.
        var group = app.MapGroup("/api/guilds/{guildId:int}")
            .RequireAuthorization();

        // Archive flow: keeps data, evicts members.
        group.MapPost("/archive", GuildAdminHandlers.Archive);
        group.MapPost("/unarchive", GuildAdminHandlers.Unarchive);

        // Delete / Burn: both destroy the guild. Different
        // intent (Burn is the explicit, no-cascade version
        // the spec calls for); same end state.
        group.MapDelete("/", GuildAdminHandlers.Delete);
        group.MapPost("/burn", GuildAdminHandlers.Burn);
    }
}
