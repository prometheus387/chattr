namespace Chattr.Infrastructure.Extensions;

public enum HttpClientServiceKey
{
    Default,
    Cap,
    Cobalt,
    CloudflareEmail,
    SeqHealthCheck,
}

public static class HttpClientServiceKeyExtensions
{
    public static string ToClientName(this HttpClientServiceKey key)
        => key switch
        {
            HttpClientServiceKey.Default => "default",
            HttpClientServiceKey.Cap => "cap",
            HttpClientServiceKey.Cobalt => "cobalt",
            HttpClientServiceKey.CloudflareEmail => "cloudflare-email",
            HttpClientServiceKey.SeqHealthCheck => "seq-healthcheck",
            _ => throw new ArgumentOutOfRangeException(nameof(key), key, null),
        };
}