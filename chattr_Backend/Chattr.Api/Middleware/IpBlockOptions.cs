namespace Chattr.Api.Middleware;

/// <summary>
/// Options for <see cref="IpBlockMiddleware"/>. Bound
/// from configuration like
/// <c>services.Configure&lt;IpBlockOptions&gt;(builder.Configuration.GetSection("IpBlock"))</c>.
/// </summary>
public sealed class IpBlockOptions
{
    /// <summary>
    /// CIDR ranges (or bare IPs) to block. Compared
    /// against the resolved client IP. Examples:
    /// <c>1.2.3.4</c>, <c>10.0.0.0/8</c>,
    /// <c>2001:db8::/32</c>. Checked in order; the first
    /// match wins.
    /// </summary>
    public List<string> BlockedRanges { get; set; } = new();

    /// <summary>
    /// When true, the middleware trusts
    /// <c>X-Forwarded-For</c> / <c>X-Real-IP</c> from
    /// requests originating in <see cref="TrustedProxies"/>.
    ///
    /// SECURITY: this MUST be <c>true</c> *only* if the
    /// app is behind a trusted reverse proxy. Leaving
    /// this off (default) means we always use the
    /// connection's remote IP — the safe fallback for
    /// direct exposure.
    /// </summary>
    public bool TrustForwardedHeaders { get; set; }

    /// <summary>
    /// IPs / CIDR ranges of trusted reverse proxies.
    /// When <see cref="TrustForwardedHeaders"/> is on,
    /// forwarded headers are honoured only when the
    /// immediate connection's IP is in this list.
    /// Cloudflare's published ranges are a sensible
    /// default; refresh via
    /// <c>https://api.cloudflare.com/client/v4/ips</c>.
    /// </summary>
    public List<string> TrustedProxies { get; set; } = new();

    /// <summary>
    /// When true, the Cloudflare-specific
    /// <c>CF-Connecting-IP</c> header takes precedence
    /// over the <c>X-Forwarded-For</c> chain. Enable
    /// this when terminating TLS at Cloudflare; the
    /// header is set by Cloudflare and cannot be
    /// spoofed by clients (Cloudflare strips any
    /// client-supplied value of the same name).
    /// </summary>
    public bool UseCloudflareHeaders { get; set; } = true;

    /// <summary>
    /// When true, blocked requests are logged at
    /// <c>Warning</c> level with the path and the
    /// resolved IP. Defaults to on; turn off in
    /// dev to keep test output quiet.
    /// </summary>
    public bool LogBlocked { get; set; } = true;
}
