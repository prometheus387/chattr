namespace Chattr.Api.Endpoints.Channels;

public static class ChannelRoutes
{
    public static void MapChannelEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api");

        group.MapGet("/guilds/{guildId:int}/channels", ChannelHandlers.GetChannelsForGuild)
             .RequireAuthorization();
    }
}
