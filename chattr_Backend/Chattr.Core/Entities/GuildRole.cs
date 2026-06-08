namespace Chattr.Core.Entities;

public class GuildRole
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty; // Being safed as either hex or rgb
}