using Chattr.Api.Endpoints.Users;

namespace Chattr.Api.Endpoints;

public static class RouteRegistrar
{
    // Diese Methode sammelt ab jetzt ALLE Routen der App
    public static void RegisterAllEndpoints(this IEndpointRouteBuilder app)
    {
        // 1. User-Routen aktivieren
        app.MapUserEndpoints();

        // Wenn du später neue Features baust, trägst du sie einfach hier untereinander ein:
        // app.MapMessageEndpoints();
        // app.MapChannelEndpoints();
        // app.MapServerEndpoints();
    }
}