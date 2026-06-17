namespace Chattr.Core.Entities;

/// <summary>
/// Membership of a <see cref="User"/> in a <see cref="Guild"/>.
/// The <see cref="RoleId"/> is the *primary* role (carried
/// for backwards compatibility and as a fallback when the
/// member has no additional roles). The m:n side-channel via
/// <see cref="GuildMemberRole"/> holds *additional* roles;
/// the *displayed* role in the UI is whichever role across
/// the primary + additional set has the highest
/// <see cref="GuildRole.Position"/>.
/// </summary>
public class GuildMember
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }

    /// <summary>
    /// Primary role. The spec moved us to m:n, but we keep
    /// this as the always-present anchor row so older code
    /// paths (permission checks, hierarchy math, etc.) that
    /// expect a single role still work. New m:n code should
    /// read <see cref="AdditionalRoles"/> in addition.
    /// </summary>
    public int RoleId { get; set; }
    public GuildRole? Role { get; set; }

    /// <summary>
    /// m:n navigation to *additional* roles beyond
    /// <see cref="Role"/>. The display role is the highest
    /// position across the union of <see cref="Role"/> and
    /// <see cref="AdditionalRoles"/>. May be empty when a
    /// member only has the primary role.
    /// </summary>
    public ICollection<GuildMemberRole> AdditionalRoles { get; set; } = new List<GuildMemberRole>();

    /// <summary>
    /// Per-guild nickname. Distinct from
    /// <see cref="User.DisplayName"/> (which is platform-wide).
    /// When non-null and non-empty, the UI shows this in
    /// preference to the user's global display name; fall
    /// back to the display name (or username) when null.
    /// </summary>
    public string? Nickname { get; set; }

    /// <summary>
    /// Founder / creator flag. The owner of a guild always
    /// has full permissions via the IsOwner bypass in
    /// <c>GuildPermissionService</c>; this is what the
    /// transfer-ownership flow and the "last owner can't
    /// leave" rule look at.
    /// </summary>
    public bool IsOwner { get; set; } = false;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// m:n side-channel: a member carries a role in addition to
/// their <see cref="GuildMember.RoleId"/>. Distinct from
/// (and complementary to) the primary role — together they
/// form the member's full role set. The unique key on
/// (GuildMemberId, RoleId) means the same role can't be
/// added twice; the handler also validates that the new
/// role is distinct from the member's primary role before
/// inserting (and rejects the request as 400 otherwise).
/// </summary>
public class GuildMemberRole
{
    public int GuildMemberId { get; set; }
    public GuildMember? Member { get; set; }

    public int RoleId { get; set; }
    public GuildRole? Role { get; set; }
}
