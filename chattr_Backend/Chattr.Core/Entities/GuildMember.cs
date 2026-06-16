namespace Chattr.Core.Entities;

public class GuildMember
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public int RoleId { get; set; }
    public GuildRole? Role { get; set; }
    public bool IsOwner { get; set; } = false;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
