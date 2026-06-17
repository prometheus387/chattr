using System.Security.Claims;
using Chattr.Api.Endpoints;
using Chattr.Core.DTOs.E2EE;
using Chattr.Core.Entities;
using Chattr.Core.Entities.E2EE;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services.Pgp;
using Microsoft.EntityFrameworkCore;

namespace Chattr.Api.Endpoints.E2EE;

/// <summary>
/// Per-user PGP public-key endpoints. The flow is:
/// <list type="number">
///   <item>Client generates a Curve25519 PGP key pair
///         locally (see <c>lib/crypto/keyGen.ts</c>).</item>
///   <item>Client computes the fingerprint and uploads
///         the armored public key + fingerprint to
///         <c>PUT /api/users/me/pgp-key</c>.</item>
///   <item>Server stores it in
///         <see cref="UserPgpKey"/>. The server never
///         sees the private key.</item>
///   <item>Other endpoints (Add-Member, Rotation) fetch
///         the public key via
///         <c>GET /api/users/{id}/pgp-key</c> and use it
///         to wrap channel AES keys.</item>
/// </list>
/// </summary>
public static class E2eePublicKeyHandlers
{
    // -----------------------------------------------------------------
    //  PUT /api/users/me/pgp-key
    //  Upload / replace the calling user's PGP public
    //  key. Idempotent: a re-PUT replaces the existing
    //  row (a user can rotate their identity by
    //  generating a new key on the client and pushing it
    //  here).
    // -----------------------------------------------------------------
    public static async Task<IResult> UploadMyKey(
        UploadPgpKeyDto body,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(body.PublicKeyArmored) ||
            string.IsNullOrWhiteSpace(body.Fingerprint))
        {
            return Results.BadRequest("PublicKeyArmored and Fingerprint are required.");
        }

        // Server-side validation: the fingerprint in
        // the payload must match the actual fingerprint
        // of the supplied key. This prevents a client
        // from registering a key with a fake /
        // inconsistent fingerprint that they'd then
        // need to remember to update everywhere.
        byte[] actualFingerprint;
        try
        {
            actualFingerprint = PgpService.GetFingerprint(body.PublicKeyArmored);
        }
        catch (Exception)
        {
            return Results.BadRequest("PublicKeyArmored is not a valid PGP public key block.");
        }
        var actualHex = Convert.ToHexString(actualFingerprint);
        if (!string.Equals(actualHex, body.Fingerprint, StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest("Fingerprint does not match the supplied public key.");
        }

        // Upsert: one row per user.
        var existing = await context.Set<UserPgpKey>()
            .FirstOrDefaultAsync(k => k.UserId == userId.Value, ct);
        if (existing is null)
        {
            context.Set<UserPgpKey>().Add(new UserPgpKey
            {
                UserId = userId.Value,
                PublicKeyArmored = body.PublicKeyArmored,
                Fingerprint = actualHex,
                UploadedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.PublicKeyArmored = body.PublicKeyArmored;
            existing.Fingerprint = actualHex;
            existing.UploadedAt = DateTime.UtcNow;
        }
        await context.SaveChangesAsync(ct);
        return Results.Ok(new { fingerprint = actualHex });
    }

    // -----------------------------------------------------------------
    //  GET /api/users/me/pgp-key
    //  Fetch the calling user's own public key.
    //  Useful in the settings card for "is my key
    //  uploaded yet?" UX.
    // -----------------------------------------------------------------
    public static async Task<IResult> GetMyKey(
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var userId = principal.UserIdOrNull();
        if (userId is null) return Results.Unauthorized();
        var row = await context.Set<UserPgpKey>()
            .FirstOrDefaultAsync(k => k.UserId == userId.Value, ct);
        if (row is null) return Results.NotFound();
        return Results.Ok(new UserPgpKeyDto
        {
            UserId = row.UserId,
            PublicKeyArmored = row.PublicKeyArmored,
            Fingerprint = row.Fingerprint,
            UploadedAt = row.UploadedAt,
        });
    }

    // -----------------------------------------------------------------
    //  GET /api/users/{userId}/pgp-key
    //  Fetch a peer's public key. Used by the Add-Member
    //  and Rotation flows. The caller doesn't need to
    //  be a member of any channel — this is a
    //  public-by-design lookup (the public key is
    //  public, after all).
    // -----------------------------------------------------------------
    public static async Task<IResult> GetUserKey(
        int userId,
        ClaimsPrincipal principal,
        AppDbContext context,
        CancellationToken ct)
    {
        var caller = principal.UserIdOrNull();
        if (caller is null) return Results.Unauthorized();
        var row = await context.Set<UserPgpKey>()
            .FirstOrDefaultAsync(k => k.UserId == userId, ct);
        if (row is null) return Results.NotFound();
        return Results.Ok(new UserPgpKeyDto
        {
            UserId = row.UserId,
            PublicKeyArmored = row.PublicKeyArmored,
            Fingerprint = row.Fingerprint,
            UploadedAt = row.UploadedAt,
        });
    }
}
