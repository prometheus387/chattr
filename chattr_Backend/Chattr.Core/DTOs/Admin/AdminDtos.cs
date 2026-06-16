using Chattr.Core.Constants;

namespace Chattr.Core.DTOs.Admin;

public class AdminUserDto
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public string PlatformRole { get; init; } = PlatformRoles.User;
    public DateTime CreatedAt { get; init; }
    public DateTime? LastSeenAt { get; init; }
}

public class UpdatePlatformRoleDto
{
    /// <summary>One of "User", "Moderator", "Council", "Clique", "Admin".</summary>
    public string Role { get; set; } = string.Empty;
}

public class AdminDashboardDto
{
    public int TotalUsers { get; init; }
    public int TotalGuilds { get; init; }
    public int TotalChannels { get; init; }
    public int TotalMessages { get; init; }
    public int TotalDirectMessages { get; init; }
    public int ActiveUsersLast24h { get; init; }

    public RoleDistributionDto RoleDistribution { get; init; } = new();
    public GuildGrowthDto GuildGrowthLast14Days { get; init; } = new();
}

public class RoleDistributionDto
{
    public int Admin { get; init; }
    public int Clique { get; init; }
    public int Council { get; init; }
    public int Moderator { get; init; }
    public int User { get; init; }
}

public class GuildGrowthDto
{
    public List<DailyCountDto> Daily { get; init; } = new();
}

/// <summary>Used by future sparkline charts (per-day guild / message growth).</summary>
public class DailyCountDto
{
    public DateTime Date { get; init; }
    public int Count { get; init; }
}
