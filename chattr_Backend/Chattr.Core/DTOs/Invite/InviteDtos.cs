using Chattr.Core.DTOs.Guild;

namespace Chattr.Core.DTOs.Invite;

/// <summary>
/// Payload for creating a new invite. All fields optional; the
/// server fills in the issuer from the JWT and the code is
/// auto-generated.
/// </summary>
public class CreateInviteDto
{
    /// <summary>If true, ignore MaxUse and let the link work forever (default).</summary>
    public bool? UnlimitedUse { get; set; }
    /// <summary>Cap on how many times the invite may be redeemed. Ignored when UnlimitedUse is true.</summary>
    public int? MaxUse { get; set; }
    /// <summary>Absolute expiry. Null = no expiry (in addition to the UnlimitedUse flag).</summary>
    public DateTime? ValidUntil { get; set; }
}

/// <summary>
/// Invite summary returned by the create / list endpoints. The full
/// share URL lives on the client (the server only knows its own
/// base URL via configuration).
/// </summary>
public class GuildInviteDto
{
    public int Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public int GuildId { get; init; }
    public string GuildName { get; init; } = string.Empty;
    public int IssuedById { get; init; }
    public string IssuedByUsername { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public bool UnlimitedUse { get; init; } = true;
    public int? MaxUse { get; set; }
    public int UseCount { get; init; }
    public DateTime? ValidUntil { get; set; }
    /// <summary>Computed client-side hint: true iff the invite is no longer redeemable.</summary>
    public bool Expired { get; init; }
}

/// <summary>
/// What unauthenticated (or pre-accept) viewers get when they hit
/// the invite-preview endpoint. We expose just enough to show a
/// "You've been invited to X" panel and the accept button.
/// </summary>
public class InvitePreviewDto
{
    public string Code { get; init; } = string.Empty;
    public int GuildId { get; init; }
    public string GuildName { get; init; } = string.Empty;
    public string? GuildIconUrl { get; init; }
    public int MemberCount { get; init; }
    /// <summary>True if the requesting user is already a member of this guild.</summary>
    public bool AlreadyMember { get; init; }
    /// <summary>True if the invite can no longer be redeemed (expired or maxed out).</summary>
    public bool Expired { get; init; }
}
