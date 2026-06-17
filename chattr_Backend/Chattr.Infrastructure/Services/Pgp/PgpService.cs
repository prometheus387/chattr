using System.Text;
using Org.BouncyCastle.Bcpg;
using Org.BouncyCastle.Bcpg.OpenPgp;

namespace Chattr.Infrastructure.Services.Pgp;

/// <summary>
/// PGP helpers used server-side for *validation*, not
/// encryption. The server never has anyone's private
/// key, so all we can do is:
/// <list type="bullet">
///   <item>Read a public key block and pull the key id
///         and fingerprint.</item>
///   <item>Read an encrypted message and check that
///         the recipient key id matches the target
///         user's key id.</item>
/// </list>
/// Both checks are critical to the Phase-2 spec —
/// without the recipient check, a malicious inviter
/// could submit any random wrapped blob and the server
/// would store it. The recipient-key-id comparison is
/// the only thing the server can verify cryptographically
/// without holding the private key.
///
/// NuGet: <c>BouncyCastle.Cryptography</c> (modern
/// package) or the legacy <c>Org.BouncyCastle</c>. Both
/// expose the same <c>Org.BouncyCastle.Bcpg.OpenPgp</c>
/// namespace, which is what we use here.
/// </summary>
public static class PgpService
{
    private static System.IO.Stream ToStream(string armored) =>
        new MemoryStream(Encoding.UTF8.GetBytes(armored));

    /// <summary>
    /// Read a PGP public key block and return its 64-bit
    /// key id. Key ids collide more often than
    /// fingerprints (only 64 bits vs SHA-1 = 160), so
    /// this is for in-memory comparison after we've
    /// already matched the user by fingerprint at the
    /// query layer. Don't use it for user lookup.
    /// </summary>
    public static long GetKeyId(string armoredPublicKey)
    {
        if (string.IsNullOrWhiteSpace(armoredPublicKey))
        {
            throw new ArgumentException("Public key is empty.", nameof(armoredPublicKey));
        }
        using var stream = PgpUtilities.GetDecoderStream(ToStream(armoredPublicKey));
        var ring = new PgpPublicKeyRing(stream);
        // The first (and only) public key in the ring.
        return ring.GetPublicKey().KeyId;
    }

    /// <summary>
    /// Read a PGP public key block and return its
    /// 20-byte SHA-1 fingerprint. Fingerprint is
    /// canonical across implementations (RFC 4880 §12.2)
    /// so the client can compute it locally and submit it
    /// for server-side comparison.
    /// </summary>
    public static byte[] GetFingerprint(string armoredPublicKey)
    {
        if (string.IsNullOrWhiteSpace(armoredPublicKey))
        {
            throw new ArgumentException("Public key is empty.", nameof(armoredPublicKey));
        }
        using var stream = PgpUtilities.GetDecoderStream(ToStream(armoredPublicKey));
        var ring = new PgpPublicKeyRing(stream);
        return ring.GetPublicKey().GetFingerprint();
    }

    /// <summary>
    /// True iff <paramref name="armoredWrappedKey"/> is a
    /// PGP encrypted-message that addresses the public
    /// key with the supplied <paramref name="recipientKeyId"/>.
    ///
    /// We don't decrypt the message (we can't — no
    /// private key). We just look at the recipient
    /// list. A correctly-encrypted message will list the
    /// recipient by its 64-bit key id; a random blob or
    /// a message encrypted to a different key won't.
    ///
    /// Bounded check: at most the first
    /// <see cref="MaxRecipientsToScan"/> entries of the
    /// recipient list. PGP supports messages encrypted
    /// to many recipients (e.g. for a group key
    /// distribution) but a single-target wrap is by far
    /// the common case; the cap defends against
    /// pathological inputs.
    /// </summary>
    public static bool IsEncryptedTo(
        string armoredWrappedKey,
        long recipientKeyId,
        int maxRecipientsToScan = 32)
    {
        if (string.IsNullOrWhiteSpace(armoredWrappedKey))
        {
            return false;
        }

        try
        {
            using var stream = PgpUtilities.GetDecoderStream(ToStream(armoredWrappedKey));
            var factory = new PgpObjectFactory(stream);
            var obj = factory.NextPgpObject();
            if (obj is not PgpEncryptedDataList list) return false;

            int scanned = 0;
            foreach (PgpPublicKeyEncryptedData enc in list.GetEncryptedDataObjects())
            {
                if (++scanned > maxRecipientsToScan) break;
                if (enc.KeyId == recipientKeyId) return true;
            }
            return false;
        }
        catch (PgpException)
        {
            // Malformed PGP, signature failure, etc. —
            // not a valid wrapped key for our purposes.
            return false;
        }
        catch (IOException)
        {
            // DecoderStream bails on bad armour.
            return false;
        }
    }

    /// <summary>
    /// Convenience: extract the key id from a public
    /// key block and immediately check whether the
    /// wrapped blob is addressed to it. Equivalent to
    /// <c>IsEncryptedTo(wrapped, GetKeyId(pubkey))</c>
    /// but skips an intermediate variable.
    /// </summary>
    public static bool IsEncryptedToUser(
        string armoredWrappedKey,
        string armoredPublicKey,
        int maxRecipientsToScan = 32)
        => IsEncryptedTo(armoredWrappedKey, GetKeyId(armoredPublicKey), maxRecipientsToScan);
}
