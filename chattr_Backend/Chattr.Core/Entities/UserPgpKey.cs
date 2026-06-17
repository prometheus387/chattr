namespace Chattr.Core.Entities;

/// <summary>
/// Per-user PGP public key (Phase 2 of the E2EE rewrite).
/// The key is uploaded by the client during signup or
/// whenever the user regenerates their identity. The
/// server uses it to wrap the per-channel AES keys for
/// this user — but never sees the private counterpart, so
/// the server can hand out wrapped blobs without being
/// able to unwrap them itself.
/// </summary>
public class UserPgpKey
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// ASCII-armored PGP PUBLIC key block. Stored verbatim
    /// from the client. The server never parses this for
    /// crypto operations beyond key-id extraction (see
    /// <c>PgpService</c>); it's opaque to us.
    /// </summary>
    public string PublicKeyArmored { get; set; } = string.Empty;

    /// <summary>
    /// Uppercase-hex SHA-1 fingerprint of the public key.
    /// Computed client-side and submitted alongside the
    /// key so we have a stable, short identifier to
    /// reference it by (key id by itself is only 64 bits,
    /// not collision-resistant across the full user
    /// base).
    /// </summary>
    public string Fingerprint { get; set; } = string.Empty;

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}
