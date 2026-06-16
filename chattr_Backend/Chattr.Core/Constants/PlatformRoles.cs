namespace Chattr.Core.Constants;

/// <summary>
/// Platform-global role hierarchy. Each role has a numeric rank; higher
/// rank = more authority. The first account ever created is
/// automatically promoted to <see cref="Admin"/>; everyone else
/// starts at <see cref="User"/>. Admins (and Moderators and above) can
/// grant any role at or below their own rank to other users via the
/// admin dashboard. There must always be at least one Admin in the
/// system — the role-change endpoint refuses to demote the last one.
/// </summary>
public static class PlatformRoles
{
    public const string User = "User";
    public const string Moderator = "Moderator";
    public const string Council = "Council";
    public const string Clique = "Clique";
    public const string Admin = "Admin";

    // Hierarchical ranks. Gaps of 25 so we can insert new tiers
    // between existing ones later (e.g. "Senior Moderator" at 35)
    // without having to renumber everything.
    public const int RankUser = 0;
    public const int RankModerator = 25;
    public const int RankCouncil = 50;
    public const int RankClique = 75;
    public const int RankAdmin = 100;

    /// <summary>
    /// Returns the numeric rank of <paramref name="role"/>, or
    /// <see cref="RankUser"/> for unknown values. Unknown roles
    /// are treated as User-rank for safety (a typo'd role from
    /// a hand-edited DB row shouldn't accidentally grant
    /// admin powers).
    /// </summary>
    public static int RankOf(string role) => role switch
    {
        Admin => RankAdmin,
        Clique => RankClique,
        Council => RankCouncil,
        Moderator => RankModerator,
        User => RankUser,
        _ => RankUser,
    };

    /// <summary>
    /// True if the role is one of the recognised ones. Used to
    /// reject garbage payloads before they hit the DB.
    /// </summary>
    public static bool IsValidRole(string role) =>
        role == User || role == Moderator || role == Council ||
        role == Clique || role == Admin;

    /// <summary>
    /// True if <paramref name="role"/> has access to the
    /// platform-admin dashboard. The dashboard is reserved for
    /// Moderator+; the regular User role has no admin
    /// capabilities.
    /// </summary>
    public static bool IsDashboardRole(string role) => RankOf(role) > RankUser;
}
