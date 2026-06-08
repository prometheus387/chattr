namespace Chattr.Core.Entities;

public class PlatformInvite
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public bool IsUsed { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UsedAt { get; set; }
    public User? UsedBy { get; set; }
    public User? CreatedBy { get; set; }
}