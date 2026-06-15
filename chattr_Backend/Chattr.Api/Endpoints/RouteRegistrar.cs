using Chattr.Api.Endpoints;
using Chattr.Api.Endpoints.Channels;
using Chattr.Api.Endpoints.Dms;
using Chattr.Api.Endpoints.Guilds;
using Chattr.Api.Endpoints.Messages;
using Chattr.Api.Endpoints.Presence;
using Chattr.Api.Endpoints.Users;
using Chattr.Api.Endpoints.Auth;
using Chattr.Infrastructure.Data;

namespace Chattr.Api.Endpoints;

public static class RouteRegistrar
{
    public static void RegisterAllEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapUserEndpoints();
        app.MapAuthEndpoints();
        app.MapGuildEndpoints();
        app.MapChannelEndpoints();
        app.MapMessageEndpoints();
        app.MapPresenceEndpoints();
        app.MapDmEndpoints();
    }
}
