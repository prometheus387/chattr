using System.ComponentModel.DataAnnotations;

namespace Chattr.Infrastructure.Options;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    [MinLength(32, ErrorMessage = "Jwt:SigningKey must be at least 32 characters long.")]
    public string SigningKey { get; init; } = string.Empty;

    [Required, MinLength(3)]
    public string Issuer { get; init; } = "chattr";

    [Required, MinLength(3)]
    public string Audience { get; init; } = "chattr.frontend";

    [Range(1, 43200, ErrorMessage = "Jwt:AccessTokenMinutes must be between 1 minute and 30 days.")]
    public int AccessTokenMinutes { get; init; } = 60;
}
