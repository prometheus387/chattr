namespace Chattr.Api.Endpoints.Users;

public static class UserRoutes
{
    public static void MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users");

        group.MapGet("/", UserHandlers.GetAllUsers);
    }
}