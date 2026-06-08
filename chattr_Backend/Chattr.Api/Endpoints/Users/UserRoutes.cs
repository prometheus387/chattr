namespace Chattr.Api.Endpoints.Users;

public static class UserRoutes
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users");

        // Hier wird nur noch gemappt und zugeordnet, Akh!
        group.MapGet("/", UserHandlers.GetAllUsers);
        group.MapPost("/register", UserHandlers.RegisterUser);
    }
}