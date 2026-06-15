namespace Chattr.Core.DTOs.Message;

public sealed class MessageDto
{
    public int Id { get; init; }
    public int ChannelId { get; init; }
    public int AuthorId { get; init; }
    public string AuthorName { get; init; } = string.Empty;
    public string Content { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime? EditedAt { get; init; }
}

public sealed class SendMessageDto
{
    public string Content { get; set; } = string.Empty;
}
