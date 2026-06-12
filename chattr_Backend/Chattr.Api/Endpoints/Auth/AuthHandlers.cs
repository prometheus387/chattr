using Chattr.Infrastructure.Data;
using Chattr.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Auth;

public static class AuthHandlers
{
    public static async Task<IResult> RegisterUser(User newUser, AppDbContext context)
    {
        var userExists = await context.Users.AnyAsync(u => u.Username == newUser.Username);
        if (userExists) return Results.BadRequest("Username already taken");
        context.Users.Add(newUser);
        await context.SaveChangesAsync();

        return Results.Created($"/api/auth/{newUser.Id}", newUser);
    }

    public static async Task<IResult> SignInUser(string username, string password, AppDbContext context)
    {
        return Results.Accepted();
    }

    public static async Task<IResult> UsernameExists(string username, AppDbContext context)
    {
        var userExists = await context.Users.AnyAsync(u => u.Username == username);
        if (userExists) return Results.BadRequest("Username already taken");
        return Results.Ok("Username not taken");
    }
}