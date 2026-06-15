using System.Security.Claims;
using Chattr.Core.DTOs.Auth;
using Chattr.Core.DTOs.User;
using Chattr.Core.Entities;
using Chattr.Domain.Services;
using Chattr.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.Auth;

public static class AuthHandlers
{
    public static async Task<IResult> RegisterUser(
        UserRegisterDto dto,
        AppDbContext context,
        CancellationToken ct)
    {
        // Basic validation — the front end already does deeper checks,
        // but never trust the client.
        if (string.IsNullOrWhiteSpace(dto.Username) ||
            string.IsNullOrWhiteSpace(dto.Password) ||
            string.IsNullOrWhiteSpace(dto.ConfirmPassword) ||
            string.IsNullOrWhiteSpace(dto.SecurityQuestion) ||
            string.IsNullOrWhiteSpace(dto.SecurityAnswer))
        {
            return Results.BadRequest("All fields are required.");
        }

        if (dto.Password != dto.ConfirmPassword)
        {
            return Results.BadRequest("Passwords do not match.");
        }

        if (dto.Password.Length < 8)
        {
            return Results.BadRequest("Password must be at least 8 characters.");
        }

        var normalizedUsername = dto.Username.Trim();
        var usernameTaken = await context.Users
            .AnyAsync(u => u.Username == normalizedUsername, ct);
        if (usernameTaken)
        {
            return Results.Conflict("Username already taken.");
        }

        var user = new User
        {
            // Id is auto-assigned by Postgres (SERIAL/IDENTITY).
            Username = normalizedUsername,
            DisplayName = normalizedUsername,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password, workFactor: 12),
            SecurityQuestion = dto.SecurityQuestion,
            // Hash the security answer too — never store it in cleartext.
            SecurityAnswer = BCrypt.Net.BCrypt.HashPassword(dto.AnswerTrimmed()),
            CreatedAt = DateTime.UtcNow,
        };

        context.Users.Add(user);
        await context.SaveChangesAsync(ct);

        return Results.Created(
            $"/api/auth/users/{user.Id}",
            ToPublic(user));
    }

    public static async Task<IResult> SignInUser(
        UserLoginDto dto,
        AppDbContext context,
        IJwtTokenService tokenService,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) ||
            string.IsNullOrWhiteSpace(dto.Password))
        {
            return Results.BadRequest("Username and password are required.");
        }

        var user = await context.Users
            .FirstOrDefaultAsync(u => u.Username == dto.Username.Trim(), ct);

        // Constant-ish work: if the user does not exist, still run a verify
        // against a throw-away hash so timing doesn't leak user enumeration.
        const string dummyHash = "$2a$12$0000000000000000000000.0000000000000000000000000000000000";
        var hashToCheck = user?.PasswordHash ?? dummyHash;
        var passwordOk = BCrypt.Net.BCrypt.Verify(dto.Password, hashToCheck);

        if (user is null || !passwordOk)
        {
            return Results.Unauthorized();
        }

        var (token, expiresAt) = tokenService.IssueToken(user.Id, user.Username);
        return Results.Ok(new AuthResponseDto
        {
            Token = token,
            ExpiresAt = expiresAt,
            User = ToPublic(user),
        });
    }

    public static async Task<IResult> UsernameExists(
        string username,
        AppDbContext context,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return Results.BadRequest("Username is required.");
        }

        var taken = await context.Users
            .AnyAsync(u => u.Username == username.Trim(), ct);
        return taken
            ? Results.Conflict("Username already taken.")
            : Results.Ok(new { username = username.Trim(), available = true });
    }

    /// <summary>
    /// Returns the public profile of the currently authenticated user,
    /// resolved from the JWT subject claim.
    /// </summary>
    public static async Task<IResult> GetCurrentUser(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);

        if (!int.TryParse(sub, out var userId))
        {
            return Results.Unauthorized();
        }

        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        return user is null
            ? Results.Unauthorized()
            : Results.Ok(ToPublic(user));
    }

    private static PublicUserDto ToPublic(User u) => new()
    {
        Id = u.Id,
        Username = u.Username,
        DisplayName = string.IsNullOrEmpty(u.DisplayName) ? u.Username : u.DisplayName,
        AvatarUrl = u.AvatarUrl,
        CreatedAt = u.CreatedAt,
    };
}

internal static class UserRegisterDtoExtensions
{
    public static string AnswerTrimmed(this UserRegisterDto dto)
        => (dto.SecurityAnswer ?? string.Empty).Trim().ToLowerInvariant();
}
