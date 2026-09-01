using System.Xml;
using System.Data;
using Chattr.Core.Constants;
using Chattr.Core.Entities;
using Chattr.Core.Entities.E2EE;
using Chattr.Infrastructure.Data;
using Chattr.Infrastructure.Services.Pgp;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Chattr.Infrastructure.Services.E2EE;

/// <summary>
/// Business logic for the E2EE channel-key flows. The
/// HTTP handlers in <c>E2eeChannelHandlers</c> are thin:
/// they parse, dispatch, format. The interesting work —
/// validating PGP recipients, bumping the key version,
/// clearing stale messages, computing the next rotation
/// time — lives here.
///
/// The two entry points the Phase-2 spec calls out:
/// <list type="bullet">
///   <item><see cref="AddMemberAsync"/> — store a
///         wrapped key for a new member of an existing
///         channel. Validates the wrap is addressed to
///         the target user before persisting.</item>
///   <item><see cref="RotateAsync"/> — accept a new
///         version's worth of wrapped keys for all
///         members, increment the channel's key version,
///         optionally clear old messages per
///         <see cref="Channel.ClearOnRotation"/>, and
///         schedule the next rotation.</item>
/// </list>
/// </summary>
public sealed class ChannelKeyService
{
    private readonly AppDbContext _context;
    private readonly ILogger<ChannelKeyService> _logger;

    public ChannelKeyService(AppDbContext context, ILogger<ChannelKeyService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Validation exception for Phase-2 wrap checks.
    /// Thrown when the PGP-encrypted blob doesn't address
    /// the target user, or the user has no PGP key on
    /// file, or the channel / user doesn't exist.
    /// </summary>
    public sealed class PgpValidationException : Exception
    {
        public PgpValidationException(string message) : base(message) { }
    }

    /// <summary>
    /// Add <paramref name="targetUserId"/> to
    /// <paramref name="channelId"/> with the supplied
    /// wrapped AES key.
    ///
    /// Validation chain:
    /// <list type="number">
    ///   <item>Channel exists.</item>
    ///   <item>Caller is the channel creator (Phase-2
    ///         gate; later phases may broaden this to
    ///         "any current member").</item>
    ///   <item>Target user exists and has a PGP public
    ///         key on file.</item>
    ///   <item>Wrapped blob is non-empty and addresses
    ///         the target user's PGP key id.</item>
    /// </list>
    /// All four pass or we throw
    /// <see cref="PgpValidationException"/> with a
    /// caller-friendly message.
    /// </summary>
    /// <returns>
    /// The stored <see cref="GroupChannelKey"/> row,
    /// including its server-assigned id and timestamp.
    /// </returns>
    public async Task<GroupChannelKey> AddMemberAsync(
        int channelId,
        int callerUserId,
        int targetUserId,
        string encryptedAesKey,
        int keyVersion,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(encryptedAesKey))
        {
            throw new PgpValidationException(
                "EncryptedAesKey is required.");
        }

        var channel = await _context.Set<Chattr.Core.Entities.E2EE.Channel>()
            .FirstOrDefaultAsync(c => c.Id == channelId, ct);
        if (channel is null)
        {
            throw new PgpValidationException("Channel not found.");
        }

        if (channel.CreatedByUserId != callerUserId)
        {
            // 403 in the handler. The message deliberately
            // doesn't say "you're not the creator" to
            // avoid leaking channel ownership to
            // non-members; the handler maps this to
            // 404 (consistent with the rest of the app's
            // "don't leak existence" policy).
            throw new PgpValidationException("Channel not found.");
        }

        var targetKey = await _context.Set<UserPgpKey>()
            .FirstOrDefaultAsync(k => k.UserId == targetUserId, ct);
        if (targetKey is null)
        {
            throw new PgpValidationException(
                "Target user has not uploaded a PGP public key yet.");
        }

        // The single most important check: the wrap
        // must actually be addressed to the target
        // user. Without this, an attacker with channel
        // creator rights could push any random wrapped
        // blob to the user, and the user would have to
        // decrypt it with their private key to discover
        // it's garbage (or, worse, the wrong channel
        // key, leading to decrypt failures on every
        // future message).
        if (!PgpService.IsEncryptedToUser(
                encryptedAesKey, targetKey.PublicKeyArmored))
        {
            throw new PgpValidationException(
                "EncryptedAesKey is not addressed to the target user's PGP public key.");
        }

        var row = new GroupChannelKey
        {
            ChannelId = channelId,
            UserId = targetUserId,
            KeyVersion = keyVersion,
            EncryptedAesKey = encryptedAesKey,
            CreatedAt = DateTime.UtcNow,
        };
        _context.Set<GroupChannelKey>().Add(row);

        // Auto-add the user to the channel's member
        // list if they're not already on it.
        var existing = await _context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            .FirstOrDefaultAsync(m =>
                m.ChannelId == channelId && m.UserId == targetUserId, ct);
        if (existing is null)
        {
            _context.Set<Chattr.Core.Entities.E2EE.ChannelMember>().Add(new Chattr.Core.Entities.E2EE.ChannelMember
            {
                ChannelId = channelId,
                UserId = targetUserId,
                JoinedAt = DateTime.UtcNow,
            });
        }

        await _context.SaveChangesAsync(ct);
        return row;
    }

    /// <summary>
    /// Rotate the channel's AES key. The client picks
    /// the new <c>newKeyVersion</c> (it should be
    /// <c>currentKeyVersion + 1</c> — anything else is a
    /// race and we return <see cref="PgpValidationException"/>).
    /// The client supplies a wrap for every current
    /// member; the server validates each wrap is
    /// addressed to that member's PGP key.
    ///
    /// If <see cref="Channel.ClearOnRotation"/> is true,
    /// the server hard-deletes all messages in the
    /// channel as part of the same transaction. The
    /// rationale: the old AES key is gone (we just
    /// rotated), so the existing ciphertext is
    /// undecryptable anyway. Holding onto it would be
    /// dead weight on disk.
    /// </summary>
    public async Task<RotateResult> RotateAsync(
        int channelId,
        int callerUserId,
        int newKeyVersion,
        IReadOnlyList<MemberWrap> wraps,
        string mode,
        IReadOnlyList<MessageReplacement> replacements,
        CancellationToken ct = default)
    {
        var normalizedMode = (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedMode is not ("delete" or "reencrypt"))
        {
            throw new PgpValidationException(
                "Mode must be either 'delete' or 'reencrypt'.");
        }

        // A serializable transaction makes the history snapshot stable. If a
        // message arrives concurrently, PostgreSQL aborts one transaction
        // instead of leaving ciphertext on the previous key version.
        await using var transaction = await _context.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, ct);
        if (wraps.Count == 0)
        {
            throw new PgpValidationException(
                "At least one wrapped key is required.");
        }

        var channel = await _context.Set<Chattr.Core.Entities.E2EE.Channel>()
            .FirstOrDefaultAsync(c => c.Id == channelId, ct);
        if (channel is null)
        {
            throw new PgpValidationException("Channel not found.");
        }
        if (channel.CreatedByUserId != callerUserId)
        {
            throw new PgpValidationException("Channel not found.");
        }

        // Determine the "current" key version by
        // looking at the most recent stored wrap. We
        // don't track this on the Channel row directly;
        // it's implicit in the GroupChannelKey history.
        // For Phase 2 we treat "highest KeyVersion
        // currently stored" as the baseline — the
        // client must send exactly baseline+1.
        var currentVersion = await _context.Set<GroupChannelKey>()
            .Where(k => k.ChannelId == channelId)
            .Select(k => (int?)k.KeyVersion)
            .MaxAsync(ct) ?? 0;
        if (newKeyVersion != currentVersion + 1)
        {
            throw new PgpValidationException(
                $"newKeyVersion must be exactly {currentVersion + 1} (current max: {currentVersion}).");
        }

        // Resolve the channel's current member list.
        // The client must wrap a key for *every* member
        // — a missing wrap leaves that user unable to
        // decrypt future messages until the next
        // rotation.
        var members = await _context.Set<Chattr.Core.Entities.E2EE.ChannelMember>()
            .Where(m => m.ChannelId == channelId)
            .Select(m => m.UserId)
            .ToListAsync(ct);

        // Build a lookup of (userId → public key) so we
        // can validate each wrap in one pass.
        var keys = await _context.Set<UserPgpKey>()
            .Where(k => members.Contains(k.UserId))
            .ToDictionaryAsync(k => k.UserId, k => k, ct);

        // Set of user-ids the client wrapped for.
        var provided = new HashSet<int>(wraps.Select(w => w.UserId));
        var missing = members.Where(uid => !provided.Contains(uid)).ToList();
        if (missing.Count > 0)
        {
            throw new PgpValidationException(
                $"Missing wraps for {missing.Count} member(s): {string.Join(", ", missing)}");
        }
        var extra = wraps.Where(w => !members.Contains(w.UserId)).ToList();
        if (extra.Count > 0)
        {
            throw new PgpValidationException(
                $"Wraps for non-members: {string.Join(", ", extra.Select(w => w.UserId))}");
        }

        // Validate every wrap, persist, all in one
        // transaction. We do the PGP parsing before
        // the INSERTs so a malformed wrap rolls back
        // the whole rotation (we don't want a half-
        // stored state where some members have the new
        // key and others don't).
        var now = DateTime.UtcNow;
        var newRows = new List<GroupChannelKey>(wraps.Count);
        foreach (var wrap in wraps)
        {
            if (!keys.TryGetValue(wrap.UserId, out var pgpKey))
            {
                throw new PgpValidationException(
                    $"User {wrap.UserId} has no PGP public key uploaded.");
            }
            if (string.IsNullOrWhiteSpace(wrap.EncryptedAesKey))
            {
                throw new PgpValidationException(
                    $"Empty EncryptedAesKey for user {wrap.UserId}.");
            }
            if (!PgpService.IsEncryptedToUser(
                    wrap.EncryptedAesKey, pgpKey.PublicKeyArmored))
            {
                throw new PgpValidationException(
                    $"EncryptedAesKey for user {wrap.UserId} is not addressed to their PGP public key.");
            }

            newRows.Add(new GroupChannelKey
            {
                ChannelId = channelId,
                UserId = wrap.UserId,
                KeyVersion = newKeyVersion,
                EncryptedAesKey = wrap.EncryptedAesKey,
                CreatedAt = now,
            });
        }

        _context.Set<GroupChannelKey>().AddRange(newRows);

        // History handling is explicit per rotation. In reencrypt mode the
        // browser has already decrypted and encrypted every message locally;
        // this service only validates completeness and swaps opaque blobs.
        int deletedMessages = 0;
        int reencryptedMessages = 0;
        var oldMessages = await _context.Set<Chattr.Core.Entities.E2EE.Message>()
            .Where(m => m.ChannelId == channelId)
            .ToListAsync(ct);
        if (normalizedMode == "delete")
        {
            if (oldMessages.Count > 0)
            {
                _context.Set<Chattr.Core.Entities.E2EE.Message>().RemoveRange(oldMessages);
                deletedMessages = oldMessages.Count;
            }
        }
        else
        {
            var replacementMap = replacements
                .GroupBy(r => r.MessageId)
                .ToDictionary(g => g.Key, g => g.ToList());
            var oldMessageIds = oldMessages.Select(m => m.Id).ToHashSet();
            if (replacementMap.Any(pair => pair.Value.Count != 1) ||
                replacementMap.Count != oldMessages.Count ||
                oldMessages.Any(m => !replacementMap.ContainsKey(m.Id)) ||
                replacementMap.Keys.Any(id => !oldMessageIds.Contains(id)))
            {
                throw new PgpValidationException(
                    "Re-encryption must contain exactly one replacement for every existing message.");
            }

            foreach (var message in oldMessages)
            {
                var ciphertext = replacementMap[message.Id][0].Ciphertext;
                if (string.IsNullOrWhiteSpace(ciphertext))
                {
                    throw new PgpValidationException(
                        $"Ciphertext is required for message {message.Id}.");
                }
                message.Ciphertext = ciphertext;
                message.KeyVersion = newKeyVersion;
                reencryptedMessages++;
            }
        }

        // Schedule the next rotation. The interval is
        // an ISO-8601 duration string (e.g. "P1D").
        // XmlConvert.ToTimeSpan is the standard .NET
        // parser that handles the day component
        // ("P1D" parses as 1.0:0:0, not the
        // TimeSpan.Parse-failing "00:00:00" guess).
        TimeSpan interval;
        try
        {
            interval = XmlConvert.ToTimeSpan(channel.RotationInterval);
        }
        catch (FormatException)
        {
            // Defensive default if the stored interval
            // is malformed — better to schedule
            // 1 day than to 500.
            _logger.LogWarning(
                "Channel {Id} has malformed RotationInterval '{Interval}', using 1 day",
                channelId, channel.RotationInterval);
            interval = TimeSpan.FromDays(1);
        }
        channel.NextRotationUtc = now.Add(interval);

        await _context.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return new RotateResult(
            channel.NextRotationUtc,
            newKeyVersion,
            deletedMessages,
            reencryptedMessages,
            normalizedMode);
    }

    /// <summary>
    /// Single per-member wrap in a rotation request.
    /// </summary>
    public sealed record MemberWrap(int UserId, string EncryptedAesKey);
    public sealed record MessageReplacement(int MessageId, string Ciphertext);

    /// <summary>
    /// Result of a successful rotation. The client
    /// updates its local key store with
    /// <see cref="NewKeyVersion"/> and the freshly
    /// unwrapped AES key. <see cref="DeletedMessages"/>
    /// is only &gt; 0 when
    /// <see cref="Channel.ClearOnRotation"/> was true —
    /// the UI can show a toast ("X old messages
    /// cleared") so the user knows the history is
    /// gone.
    /// </summary>
    public sealed record RotateResult(
        DateTime NewNextRotationUtc,
        int NewKeyVersion,
        int DeletedMessages,
        int ReencryptedMessages,
        string Mode);
}
