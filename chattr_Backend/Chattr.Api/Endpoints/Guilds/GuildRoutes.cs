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

        // Detail / members of a single guild.
        group.MapGet("/{guildId:int}", GuildHandlers.GetGuild)
             .RequireAuthorization();
        group.MapGet("/{guildId:int}/members", GuildHandlers.GetGuildMembers)
             .RequireAuthorization();

        // Add an existing platform user to the guild with a
        // chosen role. Owner / IsAdministrator / CanManageRoles
        // only — the handler re-checks via GuildPermissionService.
        group.MapPost("/{guildId:int}/members", GuildHandlers.AddMember)
             .RequireAuthorization();

        // Kick another member out. CanKickMembers / IsAdministrator.
        group.MapDelete("/{guildId:int}/members/{userId:int}", GuildHandlers.KickMember)
             .RequireAuthorization();

        // Bans. POST = ban, DELETE = unban, GET = list. All
        // gated by CanBanMembers / IsAdministrator inside the
        // handler.
        group.MapPost("/{guildId:int}/bans", GuildHandlers.BanMember)
             .RequireAuthorization();
        group.MapDelete("/{guildId:int}/bans/{userId:int}", GuildHandlers.UnbanMember)
             .RequireAuthorization();
        group.MapGet("/{guildId:int}/bans", GuildHandlers.ListBans)
             .RequireAuthorization();

        // Patch a guild's settings (name, icon). The handler enforces
        // admin permissions internally — anyone authenticated can hit
        // the route, non-admins get a 403 back.
        group.MapPatch("/{guildId:int}", GuildHandlers.UpdateGuild)
             .RequireAuthorization();

        // Leave a guild. Maps to /api/guilds/{id}/members/me.
        group.MapDelete("/{guildId:int}/members/me", GuildHandlers.LeaveGuild)
             .RequireAuthorization();
    }
}
