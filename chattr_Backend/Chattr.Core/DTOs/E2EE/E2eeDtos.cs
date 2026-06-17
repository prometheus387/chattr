namespace Chattr.Core.DTOs.E2EE;

/// <summary>
/// Body of <c>POST /api/e2ee/channels/{id}/members</c>.
/// The caller (the channel creator, today) supplies the
/// target user id, the version of the channel key the
/// wrap belongs to, and the PGP-encrypted AES key blob
/// for the target user.
///
/// The server-side validation pipeline (see
/// <c>ChannelKeyService.AddMemberAsync</c>) refuses the
/// request if the wrapped blob is missing, empty, or
/// not addressed to the target user's PGP key id —
/// there's no path that lets an attacker push an
/// arbitrary blob to a user.
/// </summary>
public class AddE2eeMemberDto
{
    public int UserId { get; set; }
    public int KeyVersion { get; set; }
    public string EncryptedAesKey { get; set; } = string.Empty;
}

/// <summary>
/// Body of <c>POST /api/e2ee/channels/{id}/rotate</c>.
/// The client generates a fresh AES key, wraps it for
/// every current member of the channel, and submits the
/// bundle. The server validates each wrap is addressed
/// to the right user, persists the new
/// <see cref="GroupChannelKey"/> rows, and (if
/// <see cref="Channel.ClearOnRotation"/> is true) wipes
/// the existing ciphertext history.
/// </summary>
public class RotateChannelKeysDto
{
    public int NewKeyVersion { get; set; }
    public List<MemberWrapDto> Wraps { get; set; } = new();
}

/// <summary>One per-member wrap inside a rotation request.</summary>
public class MemberWrapDto
{
    public int UserId { get; set; }
    public string EncryptedAesKey { get; set; } = string.Empty;
}

/// <summary>
/// Returned by the rotation endpoint. The client uses
/// <see cref="NewKeyVersion"/> to update its local key
/// store; <see cref="NewNextRotationUtc"/> is the next
/// scheduled rotation time. <see cref="DeletedMessages"/>
/// is non-zero when <c>ClearOnRotation</c> was on and
/// old ciphertext was wiped.
/// </summary>
public class RotateResultDto
{
    public int NewKeyVersion { get; set; }
    public DateTime NewNextRotationUtc { get; set; }
    public int DeletedMessages { get; set; }
    public bool ClearedOnRotation { get; set; }
}

/// <summary>
/// Body of <c>PUT /api/users/me/pgp-key</c> — the
/// client uploads (or re-uploads) its PGP public key so
/// the server can wrap per-channel AES keys for it.
/// </summary>
public class UploadPgpKeyDto
{
    public string PublicKeyArmored { get; set; } = string.Empty;
    public string Fingerprint { get; set; } = string.Empty;
}

/// <summary>
/// Returned by <c>GET /api/users/{id}/pgp-key</c> — the
/// bare minimum the channel-add / rotation flows need
/// to wrap a key for a peer. The
/// <c>PublicKeyArmored</c> field is the armored PGP
/// public key; <c>Fingerprint</c> is the SHA-1 hash for
/// cross-checking.
/// </summary>
public class UserPgpKeyDto
{
    public int UserId { get; set; }
    public string PublicKeyArmored { get; set; } = string.Empty;
    public string Fingerprint { get; set; } = string.Empty;
    public DateTime UploadedAt { get; set; }
}

/// <summary>
/// Body of <c>PATCH /api/e2ee/channels/{id}</c> — the
/// channel creator adjusts metadata. For Phase 2 the
/// only field exposed is <c>ClearOnRotation</c>; later
/// phases can add <c>RotationInterval</c> and friends.
/// </summary>
public class UpdateE2eeChannelDto
{
    public bool? ClearOnRotation { get; set; }
    public string? RotationInterval { get; set; }
}
