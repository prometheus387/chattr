using Chattr.Core.Entities;

namespace Chattr.Core.Entities.E2EE;

/// <summary>
/// End-to-end-encrypted channel. The server stores only
/// metadata — the encryption keys live wrapped on a
/// per-user basis (see <see cref="GroupChannelKey"/>) and
/// the message bodies are stored as ciphertext (see
/// <see cref="Message"/>). The server has no way to
/// decrypt the channel: it holds each user's PGP *public*
/// key (so it can wrap the channel's AES key for them)
/// but never sees the *private* key, which only the user
/// holds, wrapped in their browser.
///
/// Lifecycle of an encrypted message:
/// <list type="number">
///   <item>Client generates a random 32-byte AES-256 key
///         for the channel (or fetches the current one).</item>
///   <item>Client encrypts the message body with AES-GCM
///         and POSTs the ciphertext + KeyVersion.</item>
///   <item>Server stores the ciphertext as-is; the
///         plaintext is gone.</item>
///   <item>When another user opens the channel, the
///         client fetches the wrapped AES key (per their
///         user id) and decrypts it locally with their
///         private PGP key.</item>
///   <item>Client uses the unwrapped AES key to decrypt
///         the channel's ciphertext history.</item>
/// </list>
/// </summary>
public class Channel
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// User-id of the channel creator. Used to gate
    /// destructive actions (e.g. add-member, rotation
    /// override) on the channel's owner. Distinct from
    /// the per-user memberships (<see cref="ChannelMember"/>)
    /// — a non-creator can still be a member, just can't
    /// run admin commands.
    /// </summary>
    public int CreatedByUserId { get; set; }
    public User? CreatedByUser { get; set; }

    /// <summary>
    /// When true, this channel rotates its AES key on the
    /// schedule defined by <see cref="RotationInterval"/>.
    /// Ephemeral channels exist to bound the blast
    /// radius of a single key compromise: even if an
    /// attacker exfiltrates a user's private PGP key,
    /// they can only decrypt messages from the current
    /// rotation window.
    /// </summary>
    public bool IsEphemeral { get; set; }

    /// <summary>
    /// Rotation schedule as an ISO-8601 duration string,
    /// e.g. <c>PT1H</c> (1 hour), <c>P1D</c> (1 day),
    /// <c>P7D</c> (1 week). The server treats the value as
    /// opaque — clients parse it and push updates via
    /// <c>PATCH /api/e2ee/channels/{id}</c>.
    /// </summary>
    public string RotationInterval { get; set; } = "P1D";

    /// <summary>
    /// Next scheduled rotation. The server doesn't rotate
    /// keys itself (it can't, that would require the
    /// plaintext). Instead, the *first user* who sends a
    /// message after this timestamp generates a new AES
    /// key, wraps it for every member, and POSTs the new
    /// wrapped keys. This field is the rendezvous
    /// point — clients check it before sending and
    /// initiate the rotation if it's in the past.
    /// </summary>
    public DateTime NextRotationUtc { get; set; } = DateTime.UtcNow.AddDays(1);

    /// <summary>
    /// When true, the server hard-deletes all messages
    /// from this channel on key rotation. Point: minimise
    /// on-disk ciphertext. For ephemeral channels where
    /// the key changes often, the old ciphertext is
    /// effectively undecryptable anyway (the previous key
    /// is gone) — so we might as well wipe it.
    /// </summary>
    public bool ClearOnRotation { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Channel-membership for the E2EE channel model. Distinct
/// from the per-guild <see cref="GuildMember"/>: an E2EE
/// channel can exist outside a guild (DMs, for example —
/// Phase 3+), and the membership row is what the
/// rotation loop iterates to wrap the new AES key for
/// every current member.
///
/// Note: we don't put a per-channel "role" or "permission"
/// here in Phase 2 — the E2EE channel is a flat ACL
/// (every member is equal). When/if we add per-channel
/// moderation in a later phase, this is where the
/// role-id column goes.
/// </summary>
public class ChannelMember
{
    public int Id { get; set; }
    public int ChannelId { get; set; }
    public Channel? Channel { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
