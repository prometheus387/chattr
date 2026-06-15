namespace Chattr.Api.Endpoints.Users;

public static class UserRoutes
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users");

        group.MapGet("/", UserHandlers.GetAllUsers)
             .RequireAuthorization();

        // Lookup by integer primary key. The route constraint keeps
        // non-numeric segments from matching.
        group.MapGet("/{id:int}", UserHandlers.GetUserById)
             .RequireAuthorization();

        // Username lookups go under an explicit segment so they can't
        // collide with the int route.
        group.MapGet("/by-username/{username}", UserHandlers.GetUserByUsername)
             .RequireAuthorization();
    }
}
