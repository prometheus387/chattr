namespace Chattr.Core.Entities;

public class GuildInvite
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public int IssuedById { get; set; }
    public User? IssuedBy { get; set; }
    public bool UnlimitedUse { get; set; } = true;
    public int? MaxUse { get; set; }
    public DateTime? ValidUntil { get; set; }
}
