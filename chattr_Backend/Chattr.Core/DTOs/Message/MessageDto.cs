namespace Chattr.Core.DTOs.Message;

public sealed class MessageDto
{
    public int Id { get; init; }
    public int ChannelId { get; init; }
    public int AuthorId { get; init; }
    public string AuthorName { get; init; } = string.Empty;

    /// <summary>
    /// Author's per-guild role colour. Drives the username tint in
    /// the message row. Empty string = no custom colour, the
    /// client falls back to the default text colour.
    /// </summary>
    public string AuthorRoleColor { get; init; } = string.Empty;

    /// <summary>
    /// Author's per-guild role icon. Sanitized server-side (see
    /// Chattr.Infrastructure.Services.SvgSanitizer) so the client
    /// can render it via dangerouslySetInnerHTML without a second
    /// sanitization pass. Null = no icon.
    /// </summary>
    public string? AuthorRoleIconSvg { get; init; }

    /// <summary>
    /// Author's role id in this guild; null when the author has left.
    /// </summary>
    public int? AuthorRoleId { get; init; }

    public string Content { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime? EditedAt { get; init; }

    /// <summary>
    /// Server-computed: when the message has been soft-deleted.
    /// Clients render the row as a "[message deleted]"
    /// placeholder rather than dropping it, so reply threads
    /// stay readable. <see cref="Content"/> is also blanked in
    /// this case.
    /// </summary>
    public DateTime? DeletedAt { get; init; }

    /// <summary>Convenience flag: true iff <see cref="DeletedAt"/> is non-null.</summary>
    public bool IsDeleted { get; init; }

    /// <summary>
    /// True if the calling user can edit this message right now.
    /// True when (a) the caller is the author, or (b) the
    /// caller has IsAdministrator on their role in this guild.
    /// Computed per-request so the client doesn't have to
    /// re-check permissions before showing the edit button.
    /// </summary>
    public bool CanEdit { get; init; }

    /// <summary>
    /// True if the calling user can delete this message right
    /// now. Same logic as <see cref="CanEdit"/> but also
    /// allows the "CanDeleteMessages" permission (the user
    /// spec's "manage_messages") — moderators with that flag
    /// can delete other people's messages but typically not
    /// edit them.
    /// </summary>
    public bool CanDelete { get; init; }
}

public sealed class SendMessageDto
{
    public string Content { get; set; } = string.Empty;
}

public sealed class EditMessageDto
{
    public string Content { get; set; } = string.Empty;
}
