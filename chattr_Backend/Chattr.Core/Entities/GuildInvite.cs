using System.Dynamic;

namespace Chattr.Core.Entities;

public class GuildInvite
{
    public Guid Id { get; set; }
    public Guild ReferredGuild { get; set; } = new();
    public User IssuedBy { get; set; } = new();
    public bool UnlimitedUse { get; set; } = true;
    public int? MaxUse { get; set; }
    public DateTime? ValidUntil { get; set; }


}