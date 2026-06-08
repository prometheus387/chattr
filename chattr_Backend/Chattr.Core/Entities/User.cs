namespace Chattr.Core.Entities;

public class User
{
    public Guid Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string SecurityQuestion { get; set; } = string.Empty;
    public string SecurityAnswer { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}