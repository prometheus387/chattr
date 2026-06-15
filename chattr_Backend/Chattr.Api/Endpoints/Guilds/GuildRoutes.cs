namespace Chattr.Api.Endpoints.Guilds;

public static class GuildRoutes
{
    public static void MapGuildEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/guilds");

        group.MapGet("/", GuildHandlers.GetMyGuilds)
             .RequireAuthorization();

        // Create a new guild. The caller becomes its owner and gets
        // #general + #announcements seeded automatically.
        group.MapPost("/", GuildHandlers.CreateGuild)
             .RequireAuthorization();

        // Leave a guild. Maps to /api/guilds/{id}/members/me.
        group.MapDelete("/{guildId:int}/members/me", GuildHandlers.LeaveGuild)
             .RequireAuthorization();
    }
}
