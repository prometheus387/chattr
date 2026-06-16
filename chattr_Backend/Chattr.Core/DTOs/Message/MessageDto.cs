namespace Chattr.Core.DTOs.Message;

public sealed class MessageDto
{
    public int Id { get; init; }
    public int ChannelId { get; init; }
    public int AuthorId { get; init; }
    public string AuthorName { get; init; } = string.Empty;

    /// <summary>
    /// The author's <see cref="GuildRole.Color"/> in the guild this
    /// channel belongs to. Empty when the author has no custom
    /// color (i.e. the @everyone role is in use and no override
    /// was set) — the client treats empty as "use the default
    /// text colour" so this never bleeds into an "ugly black"
    /// regression.
    /// </summary>
    public string AuthorRoleColor { get; init; } = string.Empty;

    /// <summary>
    /// The author's <see cref="GuildRole.IconSvg"/> in the guild
    /// this channel belongs to. Sanitized server-side on write
    /// (<see cref="Chattr.Infrastructure.Services.SvgSanitizer"/>)
    /// so the client can render this directly via dangerouslySetInnerHTML
    /// without a second sanitization pass. Null when the role has
    /// no icon set.
    /// </summary>
    public string? AuthorRoleIconSvg { get; init; }

    /// <summary>
    /// The author's <see cref="GuildRole.Id"/> in this guild. Used
    /// by the client for hover tooltips / role cards ("posten als
    /// Rolle #42"). Null when the author isn't a member of the
    /// guild anymore (e.g. they left after the message was sent).
    /// </summary>
    public int? AuthorRoleId { get; init; }

    public string Content { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime? EditedAt { get; init; }
}

public sealed class SendMessageDto
{
    public string Content { get; set; } = string.Empty;
}
