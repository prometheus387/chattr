using Chattr.Api.Endpoints.Auth;
using Chattr.Api.Endpoints.Users;

namespace Chattr.Api.Endpoints;

public static class RouteRegistrar
{
    public static void RegisterAllEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapUserEndpoints();
        app.MapAuthEndpoints();
    }
}