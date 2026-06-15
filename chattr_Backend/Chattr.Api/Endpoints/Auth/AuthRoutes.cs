using Microsoft.AspNetCore.Mvc;

namespace Chattr.Api.Endpoints.Auth;

public static class AuthRoutes
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/register", AuthHandlers.RegisterUser);
        group.MapPost("/signin", AuthHandlers.SignInUser);
        group.MapGet("/username-free", AuthHandlers.UsernameExists);

        // Authenticated — returns the current user from the bearer token.
        group.MapGet("/me", AuthHandlers.GetCurrentUser)
             .RequireAuthorization();
    }
}
