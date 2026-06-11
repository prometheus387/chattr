using Chattr.Infrastructure.Data;
using Chattr.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Users;

public static class UserHandlers
{
    public static async Task<IResult> GetAllUsers(AppDbContext context)
    {
        var users = await context.Users.ToListAsync();
        return Results.Ok(users);
    }

}