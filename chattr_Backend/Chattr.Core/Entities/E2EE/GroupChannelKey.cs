using Chattr.Core.Entities;

namespace Chattr.Core.Entities.E2EE;

/// <summary>
/// A channel's AES key, wrapped (PGP-encrypted) for a
/// specific user with that user's PGP *public* key. The
/// server only stores the wrapped form; only the user —
/// who holds the corresponding private PGP key — can
/// unwrap it.
///
/// This is the heart of the E2EE design: the server has
/// each user's public key (so it can wrap the channel's
/// AES key for them) but never has the private key. The
/// wrapped form is useless without the private key, so
/// the server can't decrypt the channel.
///
/// Key rotation bumps <see cref="KeyVersion"/>; the
/// server keeps the historical wrapped keys so users
/// can still decrypt older messages after a rotation.
/// The client asks for "the wrapped key for (channel,
/// me, version=N)" and unwraps locally.
/// </summary>
public class GroupChannelKey
{
    public int Id { get; set; }

    public int ChannelId { get; set; }
    public Channel? Channel { get; set; }

    public int UserId { get; set; }
    public User? User { get; set; }

    /// <summary>
    /// The version of the channel key. Bumped each time
    /// the channel rotates. Old <see cref="Message"/>
    /// rows reference their version here, so the client
    /// can fetch the right wrapped key for decryption.
    /// </summary>
    public int KeyVersion { get; set; } = 1;

    /// <summary>
    /// ASCII-armored PGP message: the channel's raw AES
    /// key (32 bytes), encrypted to the recipient's PGP
    /// public key. Decryptable only with the recipient's
    /// private PGP key, which the server has never seen.
    /// </summary>
    public string EncryptedAesKey { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
