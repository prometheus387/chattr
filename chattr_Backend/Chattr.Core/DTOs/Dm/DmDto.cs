namespace Chattr.Core.DTOs.Dm;

/// <summary>
/// One entry in the "recent chats" sidebar. Carries the *other* user's
/// profile and the last message preview so the UI can render a row
/// without a second round-trip.
/// </summary>
public sealed class DmSummaryDto
{
    public int Id { get; init; }
    public int OtherUserId { get; init; }
    public string OtherUsername { get; init; } = string.Empty;
    public string OtherDisplayName { get; init; } = string.Empty;
    public string? OtherAvatarUrl { get; init; }
    public DateTime? OtherLastSeenAt { get; init; }
    public DateTime? LastMessageAt { get; init; }
    public string? LastMessagePreview { get; init; }
}

public sealed class DmMessageDto
{
    public int Id { get; init; }
    public int DmChannelId { get; init; }
    public int AuthorId { get; init; }
    public string AuthorName { get; init; } = string.Empty;
    public string Content { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime? EditedAt { get; init; }
}

public sealed class SendDmMessageDto
{
    public string Content { get; set; } = string.Empty;
}
