using Chattr.Core.DTOs.User;
using Chattr.Core.Entities;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Users;

public static class UserHandlers
{
    public static async Task<IResult> GetAllUsers(AppDbContext context, CancellationToken ct)
    {
        var users = await context.Users
            .AsNoTracking()
            .Select(u => new PublicUserDto
            {
                Id = u.Id,
                Username = u.Username,
                DisplayName = u.DisplayName.Length == 0 ? u.Username : u.DisplayName,
                AvatarUrl = u.AvatarUrl,
                CreatedAt = u.CreatedAt,
            })
            .ToListAsync(ct);

        return Results.Ok(users);
    }

    public static async Task<IResult> GetUserById(int id, AppDbContext context, CancellationToken ct)
    {
        var user = await context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, ct);
        return user is null ? Results.NotFound() : Results.Ok(ToPublic(user));
    }

    public static async Task<IResult> GetUserByUsername(string username, AppDbContext context, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return Results.BadRequest("Username is required.");
        }

        var normalized = username.Trim();
        var user = await context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Username == normalized, ct);
        return user is null ? Results.NotFound() : Results.Ok(ToPublic(user));
    }

    private static PublicUserDto ToPublic(User u) => new()
    {
        Id = u.Id,
        Username = u.Username,
        DisplayName = u.DisplayName.Length == 0 ? u.Username : u.DisplayName,
        AvatarUrl = u.AvatarUrl,
        CreatedAt = u.CreatedAt,
    };
}
