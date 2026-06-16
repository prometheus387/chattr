namespace Chattr.Core.Entities;

public class GuildRole
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty; // hex or rgb

    /// <summary>
    /// Vertical rank in the guild's role hierarchy. Higher = more
    /// authority. @everyone is the floor (0); a guild's admin role
    /// sits at the top (100 by default). Users with a role that has
    /// <c>CanManageRoles</c> may only assign roles strictly below
    /// their own and only if every permission flag on the target role
    /// is also set on the assigner's role.
    /// </summary>
    public int Position { get; set; } = 0;

    /// <summary>
    /// When true, members carrying this role get their own labelled
    /// section in the user sidebar instead of being lumped into the
    /// catch-all "Members" group. Typically used for owner / admin /
    /// moderator tiers.
    /// </summary>
    public bool DisplaySeparately { get; set; } = false;

    /// <summary>
    /// Optional inline-SVG icon (sanitized server-side before save).
    /// Shown next to the role's name in the sidebar and next to a
    /// message author's name. The field is in place now so the
    /// follow-up "set icon" UI doesn't need a second migration.
    /// </summary>
    public string? IconSvg { get; set; }

    public GuildRolePermissions? Permissions { get; set; }
}
