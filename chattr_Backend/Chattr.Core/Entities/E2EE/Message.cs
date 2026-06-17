using Chattr.Core.Entities;

namespace Chattr.Core.Entities.E2EE;

/// <summary>
/// One encrypted message. The server stores ONLY
/// ciphertext; it never has access to the channel's AES
/// key (which lives wrapped per-user in
/// <see cref="GroupChannelKey"/>), so it cannot decrypt
/// this. By construction, even a fully-compromised
/// database leak (SQL injection, backup exfiltration,
/// rogue admin) does not expose plaintext — the
/// attacker still needs each recipient's private PGP key,
/// which the server has never seen.
///
/// Format of <see cref="Ciphertext"/>: base64 of
/// <c>nonce(12) || ciphertext || gcm-tag(16)</c>. The
/// 12-byte nonce is randomly generated per message;
/// uniqueness under the same key is essential for GCM
/// security (nonce reuse breaks confidentiality and
/// authenticity). A 96-bit nonce gives ~2^32 messages
/// per key before collision risk becomes non-negligible;
/// ephemeral channels (which rotate) keep that well
/// under the limit.
/// </summary>
public class Message
{
    public int Id { get; set; }

    public int ChannelId { get; set; }
    public Channel? Channel { get; set; }

    public int SenderId { get; set; }
    public User? Sender { get; set; }

    /// <summary>
    /// AES-256-GCM ciphertext, base64-encoded. The
    /// plaintext is reconstructed on the recipient by:
    /// (1) fetching the wrapped channel key for the
    ///     recipient,
    /// (2) unwrapping it with the recipient's private
    ///     PGP key,
    /// (3) AES-GCM-decrypting this ciphertext with the
    ///     key referenced by <see cref="KeyVersion"/>.
    /// The server has none of these pieces.
    /// </summary>
    public string Ciphertext { get; set; } = string.Empty;

    /// <summary>
    /// Which version of the channel's AES key was used
    /// to encrypt this. Bumped on each rotation; old
    /// messages keep their old <c>KeyVersion</c> so the
    /// client knows which wrapped key to fetch.
    /// </summary>
    public int KeyVersion { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
