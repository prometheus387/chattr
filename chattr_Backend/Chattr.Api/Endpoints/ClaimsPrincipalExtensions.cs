using System.Security.Claims;

namespace Chattr.Api.Endpoints;

internal static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Reads the integer user id from the JWT <c>nameidentifier</c> (or
    /// <c>sub</c>) claim. Returns null if the claim is missing or the
    /// value isn't a valid integer.
    /// </summary>
    public static int? UserIdOrNull(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var id) ? id : null;
    }
}
