using System.Dynamic;

namespace Chattr.Core.Entities;

public class GuildMember
{
    public Guid Id { get; set; }
    public User ReferredUser { get; set; } = null!;
    public Guild ReferredGuild { get; set; } = null!;
    
}