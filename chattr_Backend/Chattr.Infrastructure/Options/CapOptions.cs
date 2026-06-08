using System.ComponentModel.DataAnnotations;

namespace Chattr.Infrastructure.Options;

public sealed class CapOptions
{
    public const string SectionName = "Cap";

    public bool Enabled { get; init; } = false;

    [MinLength(1, ErrorMessage = "Cap:SecretKey cannot be empty when provided.")]
    public string? SecretKey { get; init; }

    [MinLength(1, ErrorMessage = "Cap:SiteKey cannot be empty when provided.")]
    public string? SiteKey { get; init; }

    [Url(ErrorMessage = "Cap:SiteVerifyUrl must be a valid absolute URL.")]
    public string? SiteVerifyUrl { get; init; }

    [Url(ErrorMessage = "Cap:ApiBaseUrl must be a valid absolute URL.")]
    public string? ApiBaseUrl { get; init; }
}