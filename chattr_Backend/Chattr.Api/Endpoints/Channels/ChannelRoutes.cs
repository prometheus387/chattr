namespace Chattr.Api.Endpoints.Channels;

public static class ChannelRoutes
{
    public static void MapChannelEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
            .RequireAuthorization();

        // Read: any guild member can list the channels.
        group.MapGet("/guilds/{guildId:int}/channels", ChannelHandlers.GetChannelsForGuild);

        // Write: owner / IsAdministrator / CanManageChannels only.
        // The handlers re-check the gate internally, so a future
        // tweak to the role policy (e.g. adding a "channel-mods"
        // tier) only has to land in GuildPermissionService.
        group.MapPost("/guilds/{guildId:int}/channels", ChannelHandlers.CreateChannel);
        group.MapPatch("/guilds/{guildId:int}/channels/{channelId:int}", ChannelHandlers.UpdateChannel);
        group.MapDelete("/guilds/{guildId:int}/channels/{channelId:int}", ChannelHandlers.DeleteChannel);
    }
}
