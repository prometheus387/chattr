namespace Chattr.Core.Entities;

public class Guild
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? IconUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<GuildInvite> Invites { get; set; } = new();
    public List<GuildMember> Members { get; set; } = new();
    
    // Admin Fields / Platform Admin, not Guild Admin
    public bool IsLimited { get; set; } = false;
    public DateTime? LimitedUntil { get; set; }
    public bool IsPunished { get; set; } = false;

}