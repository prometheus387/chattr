using System.Security.Cryptography;
using System.Text;

namespace Chattr.Infrastructure.Services;

/// <summary>
/// Helpers for generating short, URL-friendly share codes. We use a
/// base62 alphabet (a–z, A–Z, 0–9) which is unambiguous in URLs and
/// has no reserved characters — copy/paste into chat works without
/// the link breaking at spaces, dashes, or punctuation.
/// </summary>
public static class InviteCodeGenerator
{
    private const string Alphabet =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    /// <summary>
    /// 10 chars from a base62 alphabet → ~60 bits of entropy, which
    /// is plenty for share codes (Discord uses 8 chars of theirs).
    /// We draw from <see cref="RandomNumberGenerator"/> so the codes
    /// aren't predictable from prior values.
    /// </summary>
    public static string NewCode(int length = 10)
    {
        if (length <= 0) throw new ArgumentOutOfRangeException(nameof(length));

        Span<byte> buffer = stackalloc byte[length];
        RandomNumberGenerator.Fill(buffer);

        var sb = new StringBuilder(length);
        for (var i = 0; i < length; i++)
        {
            // 62^2 > 256, so a single byte mod 62 isn't uniform
            // (small bias). To get an unbiased pick, we re-roll on
            // values that fall in the upper 256 mod 62 = 4 (i.e.
            // bytes 252..255). That's a 4/256 = 1.6% reject rate.
            byte b;
            do { b = buffer[i]; } while (b >= 252);
            sb.Append(Alphabet[b % Alphabet.Length]);
        }
        return sb.ToString();
    }
}
