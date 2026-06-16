namespace Chattr.Core.Entities;

public class GuildInvite
{
    public int Id { get; set; }
    public int GuildId { get; set; }
    public Guild? Guild { get; set; }
    public int IssuedById { get; set; }
    public User? IssuedBy { get; set; }

    /// <summary>
    /// Short URL-friendly share code (base62, 10 chars). Pinned in
    /// the URL as <c>/invite/&lt;code&gt;</c>.
    /// </summary>
    public string Code { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool UnlimitedUse { get; set; } = true;
    public int? MaxUse { get; set; }
    public int UseCount { get; set; } = 0;
    public DateTime? ValidUntil { get; set; }
}
