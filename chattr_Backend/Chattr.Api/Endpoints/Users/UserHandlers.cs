using Chattr.Infrastructure.Data;
using Chattr.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Users;

public static class UserHandlers
{
    // Funktion 1: Alle User holen
    public static async Task<IResult> GetAllUsers(AppDbContext context)
    {
        var users = await context.Users.ToListAsync();
        return Results.Ok(users);
    }

    // Funktion 2: User registrieren
    public static async Task<IResult> RegisterUser(User newUser, AppDbContext context)
    {
        var userExists = await context.Users.AnyAsync(u => u.Username == newUser.Username);
        if (userExists)
        {
            return Results.BadRequest("Username ist leider schon vergeben, Akh!");
        }

        context.Users.Add(newUser);
        await context.SaveChangesAsync();

        return Results.Created($"/api/users/{newUser.Id}", newUser);
    }
}